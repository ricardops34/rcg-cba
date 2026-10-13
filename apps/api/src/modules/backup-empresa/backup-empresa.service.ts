import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Prisma, type EmpresaBackup } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  armazenamento,
  type Armazenamento,
} from '../../common/armazenamento/armazenamento';
import { UPLOADS_DIR } from '../../common/uploads/uploads.config';
import { assinarCaminho } from '../../common/uploads/link-assinado';
import { BackupGerador, apagarTemporario } from './backup-gerador';

/** Onde o zip é montado antes de ir para o armazenamento (no volume, não no contêiner). */
export const PASTA_TEMPORARIA = join(UPLOADS_DIR, '.tmp');

/** Validade do link de download. Curto: é a empresa inteira. */
const VALIDADE_LINK_SEGUNDOS = 5 * 60;

/** Gerando há mais que isto é backup interrompido (a API reiniciou no meio). */
const GERANDO_MAXIMO_MS = 6 * 60 * 60 * 1000;

export interface BackupResumo {
  id: string;
  empresaId: string;
  origem: 'manual' | 'agendado';
  situacao: 'gerando' | 'pronto' | 'falhou';
  bytes: number | null;
  registros: number | null;
  arquivos: number | null;
  erro: string | null;
  iniciadoEm: Date;
  concluidoEm: Date | null;
}

export interface EmpresaComBackups {
  empresa: {
    id: string;
    razaoSocial: string;
    nomeFantasia: string;
    cnpj: string;
  };
  backups: BackupResumo[];
}

const resumo = (b: EmpresaBackup): BackupResumo => ({
  id: b.id,
  empresaId: b.empresaId,
  origem: b.origem,
  situacao: b.situacao,
  bytes: b.bytes === null ? null : Number(b.bytes),
  registros: b.registros,
  arquivos: b.arquivos,
  erro: b.erro,
  iniciadoEm: b.iniciadoEm,
  concluidoEm: b.concluidoEm,
});

/**
 * Backup por empresa — ver `docs/planos/2026-10-13-backup-por-empresa.md`.
 * Só a administração da plataforma chega aqui (controller com
 * `PlatformAdminGuard`).
 */
@Injectable()
export class BackupEmpresaService {
  private readonly logger = new Logger(BackupEmpresaService.name);

  /** Propriedade para o teste trocar por um armazenamento temporário. */
  armazenamento: Armazenamento = armazenamento();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra o backup e gera em segundo plano; devolve na hora. O índice
   * parcial do banco segura um gerando por empresa.
   */
  async solicitar(
    empresaId: string,
    origem: 'manual' | 'agendado',
    usuarioId?: string,
  ) {
    const backup = await this.registrar(empresaId, origem, usuarioId);
    void this.gerar(backup);
    return resumo(backup);
  }

  /** Para o agendamento: registra e espera terminar (um de cada vez). */
  async gerarAgora(empresaId: string, origem: 'manual' | 'agendado') {
    const backup = await this.registrar(empresaId, origem);
    return this.gerar(backup);
  }

  private async registrar(
    empresaId: string,
    origem: 'manual' | 'agendado',
    usuarioId?: string,
  ) {
    await this.encerrarInterrompidos(empresaId);
    try {
      return await this.prisma.withTenant(empresaId, (tx) =>
        tx.empresaBackup.create({
          data: { empresaId, origem, solicitadoPor: usuarioId ?? null },
        }),
      );
    } catch (erro) {
      if (
        erro instanceof Prisma.PrismaClientKnownRequestError &&
        erro.code === 'P2002'
      ) {
        throw new ConflictException(
          'Já há um backup desta empresa sendo gerado.',
        );
      }
      throw erro;
    }
  }

  private async gerar(backup: EmpresaBackup) {
    const pasta = join(PASTA_TEMPORARIA, `backup-${backup.id}`);
    try {
      const gerador = new BackupGerador(
        this.prisma,
        this.armazenamento,
        backup.empresaId,
        pasta,
      );
      const r = await gerador.gerar({
        versaoSchema: await this.versaoSchema(),
        geradoEm: backup.iniciadoEm,
        origem: backup.origem,
      });
      const carimbo = backup.iniciadoEm.toISOString().replace(/[:.]/g, '-');
      const chave = `backups-empresas/${backup.empresaId}/${carimbo}-${backup.origem}.zip`;
      await this.armazenamento.gravarArquivo(
        chave,
        r.caminhoZip,
        'application/zip',
      );
      const pronto = await this.prisma.withTenant(backup.empresaId, (tx) =>
        tx.empresaBackup.update({
          where: { id: backup.id },
          data: {
            situacao: 'pronto',
            chave,
            bytes: BigInt(r.bytes),
            registros: r.registros,
            arquivos: r.arquivos,
            concluidoEm: new Date(),
          },
        }),
      );
      this.logger.log(
        `Backup ${backup.id} da empresa ${backup.empresaId}: ${r.registros} registros, ${r.arquivos} arquivos, ${r.bytes} bytes.`,
      );
      if (backup.origem === 'agendado')
        await this.podarAgendados(backup.empresaId);
      return resumo(pronto);
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      this.logger.error(
        `Backup ${backup.id} da empresa ${backup.empresaId} falhou: ${mensagem}`,
      );
      const falhou = await this.prisma.withTenant(backup.empresaId, (tx) =>
        tx.empresaBackup.update({
          where: { id: backup.id },
          data: {
            situacao: 'falhou',
            erro: mensagem.slice(0, 2000),
            concluidoEm: new Date(),
          },
        }),
      );
      return resumo(falhou);
    } finally {
      await apagarTemporario(pasta).catch(() => undefined);
    }
  }

  /** As empresas (inclusive excluídas, que ainda podem ter backup) com os backups. */
  async listar(): Promise<EmpresaComBackups[]> {
    const empresas = await this.empresas();
    const saida: EmpresaComBackups[] = [];
    for (const empresa of empresas) {
      const backups = await this.prisma.withTenant(empresa.id, (tx) =>
        tx.empresaBackup.findMany({
          where: { empresaId: empresa.id },
          orderBy: { iniciadoEm: 'desc' },
        }),
      );
      saida.push({ empresa, backups: backups.map(resumo) });
    }
    return saida;
  }

  /** Os backups de uma empresa só — a tela do administrador da empresa. */
  async listarDaEmpresa(empresaId: string): Promise<BackupResumo[]> {
    const backups = await this.prisma.withTenant(empresaId, (tx) =>
      tx.empresaBackup.findMany({
        where: { empresaId },
        orderBy: { iniciadoEm: 'desc' },
      }),
    );
    return backups.map(resumo);
  }

  /**
   * Link de download: o caminho `/uploads/<chave>` assinado por 5 minutos. O
   * `main.ts` confere a assinatura e serve do disco ou redireciona ao MinIO.
   */
  async link(empresaId: string, id: string) {
    const backup = await this.buscar(empresaId, id);
    if (backup.situacao !== 'pronto' || !backup.chave) {
      throw new NotFoundException('Este backup não tem pacote para baixar.');
    }
    return {
      url: assinarCaminho(`/uploads/${backup.chave}`, VALIDADE_LINK_SEGUNDOS),
    };
  }

  async excluir(empresaId: string, id: string) {
    const backup = await this.buscar(empresaId, id);
    if (backup.situacao === 'gerando') {
      throw new ConflictException('O backup ainda está sendo gerado.');
    }
    if (backup.chave) await this.armazenamento.apagar(backup.chave);
    await this.prisma.withTenant(empresaId, (tx) =>
      tx.empresaBackup.delete({ where: { id } }),
    );
    return { ok: true };
  }

  async lerConfig() {
    return this.prisma.backupEmpresaConfig.upsert({
      where: { id: 'unico' },
      create: { id: 'unico' },
      update: {},
    });
  }

  async atualizarConfig(
    dados: { ativo?: boolean; frequenciaDias?: number; manter?: number },
    usuarioId: string,
  ) {
    return this.prisma.backupEmpresaConfig.upsert({
      where: { id: 'unico' },
      create: { id: 'unico', ...dados, atualizadoPor: usuarioId },
      update: { ...dados, atualizadoPor: usuarioId },
    });
  }

  /**
   * Uma passagem do agendamento: para cada empresa ativa sem backup agendado
   * dentro da frequência, gera um — um de cada vez, esperando terminar.
   */
  async agendados(agora = Date.now()) {
    const config = await this.lerConfig();
    if (!config.ativo) return { gerados: 0 };
    const limite = agora - config.frequenciaDias * 24 * 60 * 60 * 1000;
    let gerados = 0;
    for (const empresa of await this.empresas({ soAtivas: true })) {
      const ultimo = await this.prisma.withTenant(empresa.id, (tx) =>
        tx.empresaBackup.findFirst({
          where: {
            empresaId: empresa.id,
            origem: 'agendado',
            situacao: { in: ['pronto', 'gerando'] },
          },
          orderBy: { iniciadoEm: 'desc' },
        }),
      );
      if (ultimo && ultimo.iniciadoEm.getTime() > limite) continue;
      try {
        await this.gerarAgora(empresa.id, 'agendado');
        gerados += 1;
      } catch (erro) {
        // Conflito (um manual gerando) ou falha: a próxima passagem tenta de novo.
        this.logger.warn(
          `Backup agendado da empresa ${empresa.id} não gerado: ${String(erro)}`,
        );
      }
    }
    return { gerados };
  }

  /** Guarda só os `manter` agendados mais recentes da empresa. */
  private async podarAgendados(empresaId: string) {
    const { manter } = await this.lerConfig();
    const antigos = await this.prisma.withTenant(empresaId, (tx) =>
      tx.empresaBackup.findMany({
        where: {
          empresaId,
          origem: 'agendado',
          situacao: { in: ['pronto', 'falhou'] },
        },
        orderBy: { iniciadoEm: 'desc' },
        skip: Math.max(manter, 1),
      }),
    );
    for (const b of antigos) {
      if (b.chave)
        await this.armazenamento.apagar(b.chave).catch(() => undefined);
      await this.prisma.withTenant(empresaId, (tx) =>
        tx.empresaBackup.delete({ where: { id: b.id } }),
      );
    }
  }

  /** Gerando há horas é backup que a API largou no meio: marca como falhou. */
  private async encerrarInterrompidos(empresaId: string) {
    await this.prisma.withTenant(empresaId, (tx) =>
      tx.empresaBackup.updateMany({
        where: {
          empresaId,
          situacao: 'gerando',
          iniciadoEm: { lt: new Date(Date.now() - GERANDO_MAXIMO_MS) },
        },
        data: {
          situacao: 'falhou',
          erro: 'Interrompido (a API reiniciou durante a geração).',
          concluidoEm: new Date(),
        },
      }),
    );
  }

  /** Na subida da API: nada está gerando de verdade; limpa o temporário. */
  async aoSubir() {
    for (const empresa of await this.empresas()) {
      await this.prisma.withTenant(empresa.id, (tx) =>
        tx.empresaBackup.updateMany({
          where: { empresaId: empresa.id, situacao: 'gerando' },
          data: {
            situacao: 'falhou',
            erro: 'Interrompido (a API reiniciou durante a geração).',
            concluidoEm: new Date(),
          },
        }),
      );
    }
    const sobras = await readdir(PASTA_TEMPORARIA).catch(() => [] as string[]);
    for (const s of sobras.filter((n) => n.startsWith('backup-'))) {
      await apagarTemporario(join(PASTA_TEMPORARIA, s)).catch(() => undefined);
    }
  }

  private async buscar(empresaId: string, id: string) {
    const backup = await this.prisma.withTenant(empresaId, (tx) =>
      tx.empresaBackup.findFirst({ where: { id, empresaId } }),
    );
    if (!backup) throw new NotFoundException('Backup não encontrado.');
    return backup;
  }

  /**
   * Empresas: RLS por grupo — o modo sistema vê todas. Operação da
   * administração da plataforma (controller com `PlatformAdminGuard`) ou do
   * agendamento, que roda sem usuário.
   */
  private empresas(opcoes: { soAtivas?: boolean } = {}) {
    return this.prisma.withSistema((tx) =>
      tx.empresa.findMany({
        where: opcoes.soAtivas ? { deletedAt: null } : undefined,
        select: { id: true, razaoSocial: true, nomeFantasia: true, cnpj: true },
        orderBy: { razaoSocial: 'asc' },
      }),
    );
  }

  /** A última migration aplicada — vai no manifesto para a restauração conferir. */
  private async versaoSchema() {
    const linhas = await this.prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM _prisma_migrations
      WHERE finished_at IS NOT NULL ORDER BY migration_name DESC LIMIT 1`.catch(
      () => [],
    );
    return linhas[0]?.migration_name ?? 'desconhecida';
  }
}
