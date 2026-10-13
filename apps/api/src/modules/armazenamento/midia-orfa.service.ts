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
    const referenciados = await this.referenciados();

    let recentesIgnorados = 0;
    const orfaos: { nome: string; bytes: number }[] = [];
    for (const arquivo of naPasta) {
      if (referenciados.has(arquivo.nome)) continue;
      if (agora - arquivo.modificadoEm < IDADE_MINIMA_MS) {
        recentesIgnorados += 1;
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
    for (const { id } of empresas) {
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
      for (const m of mensagens) {
        const nome = arquivoDaMidia(m.arquivoUrl);
        if (nome) nomes.add(nome);
      }
      for (const c of contatos) {
        const nome = arquivoDaMidia(c.fotoUrl);
        if (nome) nomes.add(nome);
      }
    }
    return nomes;
  }
}
