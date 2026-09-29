import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  IntegracaoCarga,
  IntegracaoCargaErrosPage,
  IntegracaoCargaErrosQuery,
  IntegracaoCargaGrupo,
  IntegracaoCargaLimpar,
  IntegracaoCargaLista,
  IntegracaoCargaListaQuery,
  IntegracaoCargaSituacao,
} from '@plataforma/contracts';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  ArquivoCargaInvalido,
  compactarParaGuardar,
  conferirArquivo,
  descompactar,
} from './ler-arquivo-carga';

/** Campos da carga que a API devolve — o arquivo nunca volta. */
const SELECAO = {
  id: true,
  descricao: true,
  situacao: true,
  tamanho: true,
  entidades: true,
  totalLinhas: true,
  linhasProcessadas: true,
  criados: true,
  atualizados: true,
  excluidos: true,
  erros: true,
  mensagem: true,
  tentativas: true,
  createdAt: true,
  iniciadaEm: true,
  concluidaEm: true,
  updatedAt: true,
} as const;

type LinhaCarga = {
  id: string;
  descricao: string | null;
  situacao: IntegracaoCarga['situacao'];
  tamanho: number;
  entidades: unknown;
  totalLinhas: number;
  linhasProcessadas: number;
  criados: number;
  atualizados: number;
  excluidos: number;
  erros: number;
  mensagem: string | null;
  tentativas: number;
  createdAt: Date;
  iniciadaEm: Date | null;
  concluidaEm: Date | null;
  updatedAt: Date;
};

function paraResposta(c: LinhaCarga): IntegracaoCarga {
  return {
    id: c.id,
    descricao: c.descricao,
    situacao: c.situacao,
    tamanho: c.tamanho,
    entidades: (c.entidades ?? {}) as Record<string, number>,
    totalLinhas: c.totalLinhas,
    linhasProcessadas: c.linhasProcessadas,
    criados: c.criados,
    atualizados: c.atualizados,
    excluidos: c.excluidos,
    erros: c.erros,
    mensagem: c.mensagem,
    tentativas: c.tentativas,
    createdAt: c.createdAt.toISOString(),
    iniciadaEm: c.iniciadaEm?.toISOString() ?? null,
    concluidaEm: c.concluidaEm?.toISOString() ?? null,
    atualizadaEm: c.updatedAt.toISOString(),
  };
}

/** Filtro de cada grupo da tela (ver `integracaoCargaGrupoSchema`). */
function whereGrupo(
  grupo: IntegracaoCargaGrupo,
): Prisma.IntegracaoCargaWhereInput {
  switch (grupo) {
    case 'nao-processados':
      return { situacao: { in: ['aguardando', 'recebida'] } };
    case 'em-processamento':
      return { situacao: 'processando' };
    case 'processados':
      return { situacao: 'concluida', erros: 0 };
    case 'com-erro':
      return {
        OR: [{ situacao: 'erro' }, { situacao: 'concluida', erros: { gt: 0 } }],
      };
    case 'canceladas':
      return { situacao: 'cancelada' };
  }
}

/** Terminadas: podem ser excluídas e reprocessadas. As da fila e a que roda, não. */
const TERMINADAS = ['concluida', 'erro', 'cancelada'] as const;

/**
 * Carga por arquivo: recebe, guarda e responde. Quem aplica é o
 * `CargasProcessador`, em segundo plano. Ver
 * docs/planos/2026-09-28-carga-por-arquivo.md.
 */
@Injectable()
export class IntegracaoCargasService {
  constructor(private readonly prisma: PrismaService) {}

  async receber(
    empresaId: string,
    apiKeyId: string,
    conteudo: unknown,
    descricao: string | undefined,
    /**
     * A tela sobe e deixa aguardando: quem manda processar é a aba
     * Processamento. O ERP, pela chave de API, entra direto na fila.
     */
    opcoes: { aguardar?: boolean } = {},
  ): Promise<IntegracaoCarga> {
    if (!Buffer.isBuffer(conteudo) || conteudo.length === 0) {
      throw new BadRequestException(
        'Envie o arquivo no corpo da requisição, com Content-Type ' +
          'application/gzip (compactado) ou application/x-ndjson (texto).',
      );
    }

    let conferido: { totalLinhas: number; entidades: Record<string, number> };
    try {
      conferido = conferirArquivo(descompactar(conteudo));
    } catch (erro) {
      if (erro instanceof ArquivoCargaInvalido) {
        throw new BadRequestException({
          message: 'Arquivo de carga recusado',
          problemas: erro.problemas,
        });
      }
      throw erro;
    }

    await this.conferirEndpointsAtivos(
      empresaId,
      Object.keys(conferido.entidades),
    );

    const criada = await this.prisma.withTenant(empresaId, (tx) =>
      tx.integracaoCarga.create({
        data: {
          empresaId,
          apiKeyId,
          descricao: descricao?.trim().slice(0, 200) || null,
          situacao: opcoes.aguardar ? 'aguardando' : 'recebida',
          arquivo: new Uint8Array(compactarParaGuardar(conteudo)),
          tamanho: conteudo.length,
          entidades: conferido.entidades,
          totalLinhas: conferido.totalLinhas,
        },
        select: SELECAO,
      }),
    );
    return paraResposta(criada);
  }

  /**
   * Carga subida pela tela (usuário logado): ela fica em nome de uma chave de
   * API da empresa, e os registros levam a autoria dessa integração. A chave
   * precisa ser da empresa ativa e estar valendo — a mesma regra do
   * `ApiKeyGuard`, para a tela não gravar por uma chave que o ERP não usaria.
   */
  async conferirChave(empresaId: string, apiKeyId: string) {
    const chave = await this.prisma.withTenant(empresaId, (tx) =>
      tx.integracaoApiKey.findFirst({
        where: { id: apiKeyId, empresaId, deletedAt: null, ativo: true },
        select: { expiraEm: true },
      }),
    );
    if (!chave) {
      throw new BadRequestException(
        'Chave de API não encontrada, inativa ou de outra empresa.',
      );
    }
    if (chave.expiraEm && chave.expiraEm.getTime() < Date.now()) {
      throw new BadRequestException('Chave de API expirada.');
    }
  }

  /**
   * Endpoint desligado no monitor da empresa vale também para o arquivo: sem
   * isto, desligar `titulos-receber` pararia o `PUT` e deixaria a mesma carga
   * entrar por aqui. Conferido de novo a cada bloco, no processamento.
   */
  async conferirEndpointsAtivos(empresaId: string, entidades: string[]) {
    const desligados = await this.prisma.integracaoEndpointConfig.findMany({
      where: { empresaId, endpointKey: { in: entidades }, ativo: false },
      select: { endpointKey: true },
    });
    if (desligados.length > 0) {
      throw new ForbiddenException(
        `Endpoint desativado para esta empresa: ${desligados
          .map((d) => `/integracao/${d.endpointKey}`)
          .join(', ')}.`,
      );
    }
  }

  /**
   * A lista da tela: paginada (mais recentes primeiro), filtrável por
   * situação, com o resumo por situação da empresa toda e a carga que está
   * rodando agora. Sem isso a tela mostrava só as 50 mais novas — as últimas
   * da fila, paradas em "na fila" — e não o que estava sendo processado.
   */
  async listarPagina(
    empresaId: string,
    query: IntegracaoCargaListaQuery,
  ): Promise<IntegracaoCargaLista> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        ...(query.situacao ? { situacao: query.situacao } : {}),
        ...(query.grupo ? whereGrupo(query.grupo) : {}),
      };
      const nomesGrupo: IntegracaoCargaGrupo[] = [
        'nao-processados',
        'em-processamento',
        'processados',
        'com-erro',
        'canceladas',
      ];
      const contagemGrupos = await Promise.all(
        nomesGrupo.map((g) =>
          tx.integracaoCarga.count({ where: { empresaId, ...whereGrupo(g) } }),
        ),
      );
      const [total, linhas, grupos, rodando] = await Promise.all([
        tx.integracaoCarga.count({ where }),
        tx.integracaoCarga.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          select: SELECAO,
        }),
        tx.integracaoCarga.groupBy({
          by: ['situacao'],
          where: { empresaId },
          _count: { _all: true },
        }),
        tx.integracaoCarga.findFirst({
          where: { empresaId, situacao: 'processando' },
          orderBy: { createdAt: 'asc' },
          select: SELECAO,
        }),
      ]);

      const resumo: Record<IntegracaoCargaSituacao, number> = {
        aguardando: 0,
        recebida: 0,
        processando: 0,
        concluida: 0,
        cancelada: 0,
        erro: 0,
      };
      for (const g of grupos) resumo[g.situacao] = g._count._all;

      return {
        data: linhas.map(paraResposta),
        total,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: Math.ceil(total / query.pageSize),
        resumo,
        grupos: {
          'nao-processados': contagemGrupos[0],
          'em-processamento': contagemGrupos[1],
          processados: contagemGrupos[2],
          'com-erro': contagemGrupos[3],
          canceladas: contagemGrupos[4],
        },
        emProcessamento: rodando ? paraResposta(rodando) : null,
      };
    });
  }

  async listar(empresaId: string): Promise<IntegracaoCarga[]> {
    const linhas = await this.prisma.withTenant(empresaId, (tx) =>
      tx.integracaoCarga.findMany({
        where: { empresaId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: SELECAO,
      }),
    );
    return linhas.map(paraResposta);
  }

  async obter(empresaId: string, id: string): Promise<IntegracaoCarga> {
    const carga = await this.prisma.withTenant(empresaId, (tx) =>
      tx.integracaoCarga.findFirst({
        where: { id, empresaId },
        select: SELECAO,
      }),
    );
    if (!carga) throw new NotFoundException('Carga não encontrada');
    return paraResposta(carga);
  }

  async erros(
    empresaId: string,
    id: string,
    query: IntegracaoCargaErrosQuery,
  ): Promise<IntegracaoCargaErrosPage> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const carga = await tx.integracaoCarga.findFirst({
        where: { id, empresaId },
        select: { id: true },
      });
      if (!carga) throw new NotFoundException('Carga não encontrada');

      const [total, linhas] = await Promise.all([
        tx.integracaoCargaErro.count({ where: { cargaId: id } }),
        tx.integracaoCargaErro.findMany({
          where: { cargaId: id },
          orderBy: { linha: 'asc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          select: { linha: true, entidade: true, chave: true, mensagem: true },
        }),
      ]);

      return {
        data: linhas,
        total,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: Math.ceil(total / query.pageSize),
      };
    });
  }

  /**
   * Libera para processar as cargas que aguardam (todas, ou só as `ids`).
   * Entram na fila na ordem em que foram subidas — a ordem de chegada, que é
   * a que o processamento segue. Devolve quantas foram liberadas.
   */
  async processar(
    empresaId: string,
    ids?: string[],
  ): Promise<{ liberadas: number }> {
    const { count } = await this.prisma.withTenant(empresaId, (tx) =>
      tx.integracaoCarga.updateMany({
        where: {
          empresaId,
          situacao: 'aguardando',
          ...(ids ? { id: { in: ids } } : {}),
        },
        data: { situacao: 'recebida' },
      }),
    );
    return { liberadas: count };
  }

  /**
   * Exclui uma carga que aguarda (o arquivo subido por engano) ou que já
   * terminou (limpeza). Some o registro, o arquivo guardado e os erros dela;
   * os dados já gravados na plataforma ficam. A que está na fila ou rodando,
   * não — cancele antes.
   */
  async excluir(empresaId: string, id: string): Promise<void> {
    await this.prisma.withTenant(empresaId, async (tx) => {
      const carga = await tx.integracaoCarga.findFirst({
        where: { id, empresaId },
        select: { situacao: true },
      });
      if (!carga) throw new NotFoundException('Carga não encontrada');
      const { count } = await tx.integracaoCarga.deleteMany({
        where: { id, situacao: { in: ['aguardando', ...TERMINADAS] } },
      });
      if (count === 0) {
        throw new BadRequestException(
          'A carga está na fila ou em processamento; cancele antes de excluir.',
        );
      }
    });
  }

  /**
   * Exclui de uma vez as cargas de um grupo — a limpeza da tela. Do grupo
   * "não processados" só as que aguardam: as da fila podem começar a qualquer
   * momento.
   */
  async limpar(
    empresaId: string,
    grupo: IntegracaoCargaLimpar['grupo'],
  ): Promise<{ excluidas: number }> {
    const where =
      grupo === 'nao-processados'
        ? { situacao: 'aguardando' as const }
        : whereGrupo(grupo);
    const { count } = await this.prisma.withTenant(empresaId, (tx) =>
      tx.integracaoCarga.deleteMany({ where: { empresaId, ...where } }),
    );
    return { excluidas: count };
  }

  /**
   * Reprocessa: a carga volta para a fila e roda o arquivo inteiro de novo,
   * do zero — os erros anteriores saem, e a gravação é por chave, então o que
   * já tinha entrado não duplica. Sem `ids`, todas as do grupo com erro. Só
   * carga terminada; mantém a data de chegada, então entra na fila na ordem
   * em que foi subida (a ordem de carga).
   */
  async reprocessar(
    empresaId: string,
    ids?: string[],
  ): Promise<{ reprocessadas: number }> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const alvo = await tx.integracaoCarga.findMany({
        where: ids
          ? { empresaId, id: { in: ids }, situacao: { in: [...TERMINADAS] } }
          : { empresaId, ...whereGrupo('com-erro') },
        select: { id: true },
      });
      const alvoIds = alvo.map((c) => c.id);
      if (alvoIds.length === 0) return { reprocessadas: 0 };

      await tx.integracaoCargaErro.deleteMany({
        where: { cargaId: { in: alvoIds } },
      });
      const { count } = await tx.integracaoCarga.updateMany({
        where: { id: { in: alvoIds } },
        data: {
          situacao: 'recebida',
          linhasProcessadas: 0,
          ultimaLinha: 0,
          criados: 0,
          atualizados: 0,
          excluidos: 0,
          erros: 0,
          mensagem: null,
          tentativas: 0,
          cancelarSolicitado: false,
          iniciadaEm: null,
          concluidaEm: null,
        },
      });
      return { reprocessadas: count };
    });
  }

  /**
   * Carga que ainda não começou é cancelada na hora. A que está rodando para
   * no fim do bloco em andamento — o que já foi aplicado fica aplicado.
   */
  async cancelar(empresaId: string, id: string): Promise<IntegracaoCarga> {
    await this.prisma.withTenant(empresaId, async (tx) => {
      const carga = await tx.integracaoCarga.findFirst({
        where: { id, empresaId },
        select: { situacao: true },
      });
      if (!carga) throw new NotFoundException('Carga não encontrada');

      if (carga.situacao === 'aguardando' || carga.situacao === 'recebida') {
        const { count } = await tx.integracaoCarga.updateMany({
          where: { id, situacao: { in: ['aguardando', 'recebida'] } },
          data: {
            situacao: 'cancelada',
            cancelarSolicitado: true,
            concluidaEm: new Date(),
            mensagem: 'Cancelada antes de começar.',
          },
        });
        // O processador a pegou entre a leitura e a troca: vira pedido de
        // parada, atendido no fim do primeiro bloco.
        if (count === 0) {
          await tx.integracaoCarga.update({
            where: { id },
            data: { cancelarSolicitado: true },
          });
        }
      } else if (carga.situacao === 'processando') {
        await tx.integracaoCarga.update({
          where: { id },
          data: { cancelarSolicitado: true },
        });
      } else {
        throw new BadRequestException(
          `A carga já terminou (situação: ${carga.situacao}).`,
        );
      }
    });
    return this.obter(empresaId, id);
  }
}
