import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  armazenamento,
  type Armazenamento,
} from '../../common/armazenamento/armazenamento';
import { arquivoDaMidia } from '../whatsapp/midia-arquivos';

/**
 * Arquivo mais novo que isto não entra: o multer grava o anexo **antes** de a
 * mensagem existir no banco (ver `WhatsappConversasService.enviarArquivo`), e a
 * varredura não pode apagar um envio em andamento.
 */
const IDADE_MINIMA_MS = 24 * 60 * 60 * 1000;

/** Quantos nomes de exemplo voltam para a tela conferir. */
const AMOSTRA = 20;

export interface ResultadoMidiaOrfa {
  arquivosNaPasta: number;
  referenciados: number;
  recentesIgnorados: number;
  /**
   * Sem referência, mas na pasta de uma empresa cuja leitura não trouxe
   * nenhuma referência (ou de uma empresa que não existe): não entram como
   * órfãos. Ver `varrer`.
   */
  protegidos: number;
  /** As pastas de empresa protegidas, para a tela mostrar. */
  pastasProtegidas: string[];
  orfaos: number;
  bytesOrfaos: number;
  amostra: string[];
  apagados: number;
  falhas: number;
}

/**
 * Mídia de WhatsApp que nenhum registro referencia mais.
 *
 * De onde vem: até 2026-10-13 a exclusão do histórico pelo administrador
 * apagava as mensagens e deixava os arquivos; a foto de perfil do contato,
 * quando atualizada, deixa a anterior; e um anexo cujo envio falhou fica do
 * jeito que o multer gravou.
 *
 * "Referenciado" = `whatsapp_mensagens.arquivoUrl` ou
 * `whatsapp_contatos.fotoUrl` de **qualquer** empresa. Essas tabelas têm RLS
 * por empresa, então a leitura passa empresa a empresa por `withTenant`.
 *
 * Primeiro lista (quantidade, tamanho, amostra); apaga só quando pedido.
 */
@Injectable()
export class MidiaOrfaService {
  private readonly logger = new Logger(MidiaOrfaService.name);

  /**
   * Disco e S3 juntos (`listar` une os dois). Propriedade para o teste usar um
   * armazenamento numa pasta temporária.
   */
  armazenamento: Armazenamento = armazenamento();

  constructor(private readonly prisma: PrismaService) {}

  async varrer(
    apagar: boolean,
    agora = Date.now(),
  ): Promise<ResultadoMidiaOrfa> {
    const naPasta = await this.arquivosDaPasta();
    const { referenciados, porEmpresa } = await this.referenciados();

    let recentesIgnorados = 0;
    let protegidos = 0;
    const pastasProtegidas = new Set<string>();
    const orfaos: { nome: string; bytes: number }[] = [];
    for (const arquivo of naPasta) {
      if (referenciados.has(arquivo.nome)) continue;
      if (agora - arquivo.modificadoEm < IDADE_MINIMA_MS) {
        recentesIgnorados += 1;
        continue;
      }
      // Trava por empresa: a mídia desde 2026-10-13 fica em
      // `whatsapp/<empresaId>/`. Se a leitura daquela empresa não trouxe
      // nenhuma referência — o mesmo caso de RLS sem contexto da trava geral,
      // só que numa empresa —, os arquivos dela não são órfãos confiáveis.
      // Pasta de empresa que não existe fica também: não há como conferir.
      const pasta = arquivo.nome.includes('/')
        ? arquivo.nome.split('/')[0]
        : null;
      if (pasta !== null && !(porEmpresa.get(pasta)?.size ?? 0)) {
        protegidos += 1;
        pastasProtegidas.add(pasta);
        continue;
      }
      orfaos.push(arquivo);
    }

    let apagados = 0;
    let falhas = 0;
    if (apagar && orfaos.length > 0) {
      // Trava contra o pior caso: uma leitura que volta vazia sem erro (RLS
      // sem contexto, como já aconteceu no monitor de endpoints) faria tudo
      // parecer órfão.
      if (referenciados.size === 0) {
        throw new BadRequestException(
          'Nenhum arquivo referenciado foi encontrado no banco — a varredura não apaga nada nesse caso. Confira a leitura antes.',
        );
      }
      for (const { nome } of orfaos) {
        try {
          await this.armazenamento.apagar(`whatsapp/${nome}`);
          apagados += 1;
        } catch {
          falhas += 1;
        }
      }
      this.logger.warn(
        `Mídia órfã do WhatsApp: ${apagados} arquivos apagados, ${falhas} falhas.`,
      );
    }

    return {
      arquivosNaPasta: naPasta.length,
      referenciados: referenciados.size,
      recentesIgnorados,
      protegidos,
      pastasProtegidas: [...pastasProtegidas].sort(),
      orfaos: orfaos.length,
      bytesOrfaos: orfaos.reduce((acc, o) => acc + o.bytes, 0),
      amostra: orfaos.slice(0, AMOSTRA).map((o) => o.nome),
      apagados,
      falhas,
    };
  }

  private async arquivosDaPasta() {
    const lista = await this.armazenamento.listar('whatsapp');
    return lista.map((a) => ({
      nome: a.chave.slice('whatsapp/'.length),
      bytes: a.bytes,
      modificadoEm: a.modificadoEm,
    }));
  }

  private async referenciados() {
    // Empresas: tabela com RLS por grupo — o modo sistema vê todas, inclusive
    // as excluídas, que ainda podem ter mensagens. Operação de administração
    // da plataforma (o controller exige `administradorPlataforma`).
    const empresas = await this.prisma.withSistema((tx) =>
      tx.empresa.findMany({ select: { id: true } }),
    );

    const nomes = new Set<string>();
    const porEmpresa = new Map<string, Set<string>>();
    for (const { id } of empresas) {
      const daEmpresa = new Set<string>();
      porEmpresa.set(id, daEmpresa);
      // Em sequência: consulta paralela numa transação interativa não é
      // garantida pelo Prisma.
      const [mensagens, contatos] = await this.prisma.withTenant(
        id,
        async (tx) =>
          [
            await tx.whatsappMensagem.findMany({
              where: { empresaId: id, arquivoUrl: { not: null } },
              select: { arquivoUrl: true },
            }),
            await tx.whatsappContato.findMany({
              where: { empresaId: id, fotoUrl: { not: null } },
              select: { fotoUrl: true },
            }),
          ] as const,
      );
      for (const url of [
        ...mensagens.map((m) => m.arquivoUrl),
        ...contatos.map((c) => c.fotoUrl),
      ]) {
        const nome = arquivoDaMidia(url);
        if (!nome) continue;
        nomes.add(nome);
        daEmpresa.add(nome);
      }
    }
    return { referenciados: nomes, porEmpresa };
  }
}
