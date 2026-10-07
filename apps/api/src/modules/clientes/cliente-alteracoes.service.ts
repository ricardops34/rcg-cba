import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PrismaService,
  type TenantTx,
} from '../../common/prisma/prisma.service';
import {
  registrarNotificacao,
  usuarioDoVendedor,
} from '../notificacoes/registrar-notificacao';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import { resolverEscopoVendedores } from '../../common/escopo/escopo-vendedores';
import { registrarAtividadeAlteracaoCliente } from './registrar-atividade-alteracao-cliente';
import {
  clienteUpdateSchema,
  type ClienteAlteracaoAprovarVaziosResultado,
  type ClienteAlteracaoQuery,
  type DiffAlteracao,
  type OrigemAlteracaoCliente,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/** Campos do cliente que a fila de aprovação acompanha. */
const CAMPOS_ACOMPANHADOS = [
  'codigoErp',
  'tipoPessoa',
  'razaoSocial',
  'nomeFantasia',
  'cnpjCpf',
  'inscricaoEstadual',
  'inscricaoMunicipal',
  'contribuinteIcms',
  'rg',
  'dataNascimento',
  'contato',
  'email',
  'telefone',
  'telefone2',
  'celular',
  'endereco',
  'complemento',
  'bairro',
  'municipio',
  'uf',
  'cep',
  'latitude',
  'longitude',
  'vendedorId',
  'tabelaPrecoId',
  'condicaoPagamentoId',
  'ativo',
  'carteira',
  'site',
  'limiteCredito',
  'vencimentoLimite',
  'observacao',
  'dataBloqueio',
  'observacaoBloqueio',
  'dataReativacao',
  'observacaoReativacao',
] as const;

/**
 * Campo virtual: não é coluna do cliente, é a coleção `cliente_cnaes`.
 *
 * Entra na fila porque a pergunta que ela responde — "quem autoriza mexer no
 * cadastro deste cliente?" — vale igual para o ramo de atividade, que é o eixo
 * da sugestão de compra. No diff ele trafega como a lista de códigos ordenada
 * e separada por vírgula, para caber no mesmo `de → para` dos outros campos e
 * ser legível na tela de aprovação sem tratamento especial.
 */
export const CAMPO_CNAES = 'cnaes';

/**
 * Também virtual: o código do CNAE principal do cliente. Separado da lista
 * porque a lista só acrescenta (ver `aplicarCnaes`) e não diz qual é o
 * principal — e a consulta à Receita traz principal e secundários, que o
 * usuário quer ver e aprovar (decisão de 30/09/2026).
 */
export const CAMPO_CNAE_PRINCIPAL = 'cnaePrincipal';

/** Campos que não são coluna do cliente. */
const CAMPOS_VIRTUAIS: string[] = [CAMPO_CNAES, CAMPO_CNAE_PRINCIPAL];

/** Lista de códigos CNAE como o diff a representa: ordenada, sem repetição. */
function serializarCnaes(valor: unknown): string | null {
  if (!Array.isArray(valor)) return null;
  const codigos = [
    ...new Set(
      valor
        .map((v) => (typeof v === 'string' ? v.trim() : ''))
        .filter((v) => v.length > 0),
    ),
  ].sort();
  return codigos.length > 0 ? codigos.join(', ') : null;
}

type ValorSerializado = string | number | boolean | null;

/**
 * Normaliza para comparação e para o JSON do diff. Data vira ISO (o cliente
 * guarda Date, o payload chega como string — sem isso toda edição pareceria
 * mudar todas as datas), e string vazia vira null, que é como o cadastro grava.
 */
function serializar(valor: unknown): ValorSerializado {
  if (valor == null || valor === '') return null;
  if (valor instanceof Date) return valor.toISOString();
  if (
    typeof valor === 'string' ||
    typeof valor === 'number' ||
    typeof valor === 'boolean'
  ) {
    return valor;
  }
  // Todo campo acompanhado é escalar ou data — nada mais deveria chegar aqui.
  // Se chegar, vira null nos dois lados da comparação e o campo é ignorado:
  // melhor não propor a mudança do que gravar um "[object Object]" no cadastro.
  return null;
}

/**
 * Calcula o que muda de fato entre o cliente atual e o payload. Só entra campo
 * acompanhado, presente no payload e com valor diferente — é o que faz o ERP
 * reenviar o mesmo cadastro sem gerar solicitação nenhuma.
 */
export function calcularDiff(
  atual: Record<string, unknown>,
  input: Record<string, unknown>,
): DiffAlteracao {
  const diff: DiffAlteracao = {};
  for (const campo of CAMPOS_ACOMPANHADOS) {
    if (!(campo in input)) continue;
    const de = serializar(atual[campo]);
    const para = serializar(input[campo]);
    if (de === para) continue;
    diff[campo] = { de, para };
  }

  // Coleção, não coluna: comparada como lista de códigos (ver CAMPO_CNAES).
  if (CAMPO_CNAES in input) {
    const de = serializarCnaes(atual[CAMPO_CNAES]);
    const para = serializarCnaes(input[CAMPO_CNAES]);
    if (de !== para && para !== null) diff[CAMPO_CNAES] = { de, para };
  }
  if (CAMPO_CNAE_PRINCIPAL in input) {
    const de = serializar(atual[CAMPO_CNAE_PRINCIPAL]);
    const para = serializar(input[CAMPO_CNAE_PRINCIPAL]);
    if (de !== para && para !== null) diff[CAMPO_CNAE_PRINCIPAL] = { de, para };
  }

  return diff;
}

/**
 * Fila de aprovação do cadastro de cliente.
 *
 * Toda alteração — da tela, da consulta de CNPJ, do ERP ou do agente — passa
 * por aqui. Quem tem `clientes.aprovar` aplica na hora, mas ainda assim deixa a
 * solicitação registrada como autoaprovada: o rastro é único, sem exceção
 * silenciosa.
 */
@Injectable()
export class ClienteAlteracoesService {
  constructor(private readonly prisma: PrismaService) {}

  private podeAprovar(user: AuthenticatedUser): boolean {
    return user.isAdmin || user.permissoes.includes('clientes.aprovar');
  }

  // ------------------------------------------------------------------
  // Registro da solicitação
  // ------------------------------------------------------------------

  /**
   * Ponto único por onde passa qualquer alteração de cliente. Devolve o que
   * aconteceu para o chamador traduzir em resposta HTTP.
   *
   * `autorId` é o usuário logado ou, na integração, o marcador da API key —
   * quem aprova precisa saber de onde veio.
   */
  async registrar(
    tx: TenantTx,
    params: {
      empresaId: string;
      clienteId: string;
      atual: Record<string, unknown>;
      input: Record<string, unknown>;
      origem: OrigemAlteracaoCliente;
      autorId: string | null;
      aplicarDireto: boolean;
      justificativa?: string | null;
      /**
       * Pendência nova vira tarefa na agenda de quem aprova (padrão). O lote
       * da Receita desliga: centenas de clientes de uma vez virariam centenas
       * de tarefas — ali o aviso é um só, no sino, ao terminar.
       */
      registrarNaAgenda?: boolean;
    },
  ): Promise<
    | { resultado: 'sem-mudanca' }
    | { resultado: 'aplicado'; diff: DiffAlteracao }
    | { resultado: 'pendente'; solicitacaoId: string; diff: DiffAlteracao }
  > {
    const {
      empresaId,
      clienteId,
      atual,
      input,
      origem,
      autorId,
      aplicarDireto,
      justificativa,
      registrarNaAgenda = true,
    } = params;

    const diff = calcularDiff(atual, input);
    if (Object.keys(diff).length === 0) return { resultado: 'sem-mudanca' };

    if (aplicarDireto) {
      const solicitacao = await tx.clienteAlteracao.create({
        data: {
          empresaId,
          clienteId,
          origem,
          status: 'aprovada',
          alteracoes: diff,
          justificativa: justificativa ?? null,
          solicitadoPor: autorId,
          analisadoPor: autorId,
          analisadoEm: new Date(),
        },
      });
      await this.aplicarNoCliente(tx, empresaId, clienteId, diff, autorId);
      await this.gravarHistorico(tx, {
        empresaId,
        clienteId,
        alteracaoId: solicitacao.id,
        diff,
        origem,
        autor: autorId,
      });
      return { resultado: 'aplicado', diff };
    }

    // Dedupe: uma pendência por cliente **por origem** (índice parcial na
    // migration). O ERP reenviando o mesmo cadastro atualiza a solicitação em
    // vez de empilhar cópias.
    const pendente = await tx.clienteAlteracao.findFirst({
      where: { empresaId, clienteId, origem, status: 'pendente' },
      select: { id: true },
    });

    const solicitacao = pendente
      ? await tx.clienteAlteracao.update({
          where: { id: pendente.id },
          data: {
            alteracoes: diff,
            justificativa: justificativa ?? null,
            solicitadoPor: autorId,
            solicitadoEm: new Date(),
          },
        })
      : await tx.clienteAlteracao.create({
          data: {
            empresaId,
            clienteId,
            origem,
            status: 'pendente',
            alteracoes: diff,
            justificativa: justificativa ?? null,
            solicitadoPor: autorId,
          },
        });

    // Só na criação: reabrir a mesma pendência a cada sincronização do ERP
    // encheria a agenda de quem aprova.
    if (!pendente && registrarNaAgenda) {
      await registrarAtividadeAlteracaoCliente(tx, {
        empresaId,
        clienteId,
        autorId,
        origem,
        campos: Object.keys(diff),
      });
    }

    return { resultado: 'pendente', solicitacaoId: solicitacao.id, diff };
  }

  /**
   * Aplica o `para` do diff no cliente. Passa pelo schema do contrato para
   * reconverter o que o JSON achatou — data volta a Date, número a number —
   * em vez de repetir a tabela de tipos aqui.
   */
  private async aplicarNoCliente(
    tx: TenantTx,
    empresaId: string,
    clienteId: string,
    diff: DiffAlteracao,
    autorId: string | null,
  ) {
    const bruto: Record<string, unknown> = {};
    for (const [campo, { para }] of Object.entries(diff)) {
      if (CAMPOS_VIRTUAIS.includes(campo)) continue;
      bruto[campo] = para;
    }

    // Um diff só de CNAE não tem o que atualizar no cliente — e um
    // `update` com data vazia só carimbaria o `updatedAt`.
    if (Object.keys(bruto).length > 0) {
      const dados = clienteUpdateSchema.parse(bruto);
      await tx.cliente.update({
        where: { id: clienteId },
        data: { ...(dados as object), updatedBy: autorId } as never,
      });
    }

    if (diff[CAMPO_CNAES]) {
      await this.aplicarCnaes(
        tx,
        empresaId,
        clienteId,
        String(diff[CAMPO_CNAES].para ?? ''),
        autorId,
      );
    }
    if (diff[CAMPO_CNAE_PRINCIPAL]?.para) {
      await this.aplicarCnaePrincipal(
        tx,
        empresaId,
        clienteId,
        String(diff[CAMPO_CNAE_PRINCIPAL].para),
        autorId,
      );
    }

    // Carteira que muda de dono é notícia para quem recebeu: o cliente
    // aparece na lista dele sem nenhum aviso, e passar a atender alguém sem
    // saber é como perder o cliente. Fica aqui, no ponto onde o cadastro muda
    // de verdade, e por isso vale para os três caminhos — tela, ERP e
    // aprovação de solicitação pendente.
    const vendedorNovo = diff.vendedorId?.para;
    if (typeof vendedorNovo === 'string' && vendedorNovo) {
      const usuarioId = await usuarioDoVendedor(tx, empresaId, vendedorNovo);
      if (usuarioId) {
        const cliente = await tx.cliente.findUnique({
          where: { id: clienteId },
          select: { razaoSocial: true },
        });
        await registrarNotificacao(tx, {
          empresaId,
          usuarioId,
          tipo: 'cliente_atribuido',
          titulo: `${cliente?.razaoSocial ?? 'Cliente'} entrou na sua carteira`,
          rota: `/cadastros/clientes/${clienteId}`,
          referenciaId: clienteId,
          autorUsuarioId: autorId,
        });
      }
    }
  }

  /**
   * Vincula ao cliente os CNAEs da lista aprovada.
   *
   * **Só acrescenta.** O `para` do diff é sempre a união do que o cliente já
   * tem com o que a origem propôs, então sincronizar (apagando o que ficou de
   * fora) daria no mesmo — e apagar seria a operação perigosa: um ramo
   * cadastrado à mão que a Receita não conhece sumiria numa aprovação de
   * rotina. Pelo mesmo motivo o `principal` não é tocado aqui: quando o
   * cliente já tem um, quem escolheu foi gente.
   */
  private async aplicarCnaes(
    tx: TenantTx,
    empresaId: string,
    clienteId: string,
    lista: string,
    autorId: string | null,
  ) {
    const codigos = lista
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    if (codigos.length === 0) return;

    const referencia = await tx.cnae.findMany({
      where: { codigoErp: { in: codigos }, deletedAt: null },
      select: { id: true },
    });
    if (referencia.length === 0) return;

    const jaTem = await tx.clienteCnae.findMany({
      where: { empresaId, clienteId },
      select: { id: true, cnaeId: true, deletedAt: true },
    });
    const porCnae = new Map(jaTem.map((l) => [l.cnaeId, l]));
    const temPrincipal = await tx.clienteCnae.findFirst({
      where: { empresaId, clienteId, principal: true, deletedAt: null },
      select: { id: true },
    });

    for (const cnae of referencia) {
      const linha = porCnae.get(cnae.id);
      if (linha && !linha.deletedAt) continue;
      if (linha) {
        // Vínculo removido antes: a unique é (clienteId, cnaeId) e ignora o
        // soft delete, então recriar daria erro de chave — reaproveita a linha.
        await tx.clienteCnae.update({
          where: { id: linha.id },
          data: { deletedAt: null, deletedBy: null, updatedBy: autorId },
        });
        continue;
      }
      await tx.clienteCnae.create({
        data: {
          empresaId,
          clienteId,
          cnaeId: cnae.id,
          // Cliente sem principal nenhum ganha o primeiro da lista; com
          // principal definido, nada muda.
          principal: !temPrincipal && cnae.id === referencia[0].id,
          createdBy: autorId,
          updatedBy: autorId,
        },
      });
    }
  }

  /**
   * Marca o CNAE aprovado como o principal do cliente (vinculando-o, se ainda
   * não estiver) e desmarca o anterior. Aqui o principal muda porque alguém
   * aprovou exatamente isso, campo a campo.
   */
  private async aplicarCnaePrincipal(
    tx: TenantTx,
    empresaId: string,
    clienteId: string,
    codigo: string,
    autorId: string | null,
  ) {
    const cnae = await tx.cnae.findFirst({
      where: { codigoErp: codigo, deletedAt: null },
      select: { id: true },
    });
    if (!cnae) return;
    await tx.clienteCnae.updateMany({
      where: { empresaId, clienteId, principal: true, cnaeId: { not: cnae.id } },
      data: { principal: false, updatedBy: autorId },
    });
    const linha = await tx.clienteCnae.findFirst({
      where: { empresaId, clienteId, cnaeId: cnae.id },
      select: { id: true },
    });
    if (linha) {
      await tx.clienteCnae.update({
        where: { id: linha.id },
        data: { principal: true, deletedAt: null, deletedBy: null, updatedBy: autorId },
      });
    } else {
      await tx.clienteCnae.create({
        data: { empresaId, clienteId, cnaeId: cnae.id, principal: true, createdBy: autorId, updatedBy: autorId },
      });
    }
  }

  private async gravarHistorico(
    tx: TenantTx,
    params: {
      empresaId: string;
      clienteId: string;
      alteracaoId: string;
      diff: DiffAlteracao;
      origem: OrigemAlteracaoCliente;
      autor: string | null;
      /** `reprovado` = proposto e negado na aprovação campo a campo. */
      status?: 'aplicado' | 'reprovado';
    },
  ) {
    const { empresaId, clienteId, alteracaoId, diff, origem, autor } = params;
    if (Object.keys(diff).length === 0) return;
    await tx.clienteHistorico.createMany({
      data: Object.entries(diff).map(([campo, { de, para }]) => ({
        empresaId,
        clienteId,
        alteracaoId,
        campo,
        valorAnterior: de == null ? null : String(de),
        valorNovo: para == null ? null : String(para),
        status: params.status ?? 'aplicado',
        origem,
        autor,
      })),
    });
  }

  // ------------------------------------------------------------------
  // Fila
  // ------------------------------------------------------------------

  async findAll(
    empresaId: string,
    user: AuthenticatedUser,
    query: ClienteAlteracaoQuery,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      // A fila respeita a carteira: um supervisor só vê pedidos de clientes que
      // ele alcança.
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const idsCnaeVazio = query.cnaeVazio
        ? await this.idsComCnaeVazio(tx, empresaId)
        : null;
      const where = {
        empresaId,
        ...(idsCnaeVazio ? { id: { in: idsCnaeVazio } } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.origem ? { origem: query.origem } : {}),
        ...(query.clienteId ? { clienteId: query.clienteId } : {}),
        ...(escopo || query.search
          ? {
              cliente: {
                ...(escopo ? { vendedorId: { in: escopo } } : {}),
                ...(query.search
                  ? {
                      razaoSocial: {
                        contains: query.search,
                        mode: 'insensitive' as const,
                      },
                    }
                  : {}),
              },
            }
          : {}),
      };

      const [linhas, total] = await Promise.all([
        tx.clienteAlteracao.findMany({
          where,
          include: {
            cliente: { select: { razaoSocial: true, codigoErp: true } },
          },
          ...paginationToSkipTake(query),
          // Pendente mais antiga primeiro: é fila, não pilha.
          orderBy: { solicitadoEm: query.sortOrder ?? 'asc' },
        }),
        tx.clienteAlteracao.count({ where }),
      ]);

      const nomes = await this.nomesDeUsuarios(
        linhas.flatMap((l) => [l.solicitadoPor, l.analisadoPor]),
      );

      return buildPaginatedResult(
        linhas.map((l) => this.paraLeitura(l, nomes)),
        total,
        query,
      );
    });
  }

  /**
   * Aprova a solicitação, inteira ou **campo a campo**.
   *
   * `campos` recorta o que entra no cadastro; omitido, aprova tudo (o
   * comportamento de sempre). O que ficar de fora não é descartado em
   * silêncio: vai para o histórico do cliente como `reprovado`, com quem
   * analisou — quem olhar o cadastro daqui a seis meses precisa ver que aquele
   * endereço foi proposto e negado, não que nunca chegou.
   */
  async aprovar(
    empresaId: string,
    user: AuthenticatedUser,
    id: string,
    campos?: string[],
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const solicitacao = await this.buscarPendenteNoEscopo(
        tx,
        empresaId,
        user,
        id,
      );
      const proposto = solicitacao.alteracoes as DiffAlteracao;

      const escolhidos = campos
        ? campos.filter((campo) => campo in proposto)
        : Object.keys(proposto);
      if (escolhidos.length === 0) {
        throw new BadRequestException(
          'Nenhum dos campos informados está nesta solicitação. Para negar tudo, use Recusar.',
        );
      }
      const diff = Object.fromEntries(
        escolhidos.map((campo) => [campo, proposto[campo]]),
      ) as DiffAlteracao;
      const reprovado = Object.fromEntries(
        Object.entries(proposto).filter(([campo]) => !escolhidos.includes(campo)),
      ) as DiffAlteracao;

      // O cliente pode ter mudado entre a solicitação e a aprovação (outra
      // solicitação aprovada antes, por exemplo). Aprovar às cegas sobrescreveria
      // em silêncio — melhor recusar e mandar reabrir com o estado atual.
      const cliente = await tx.cliente.findFirst({
        where: { id: solicitacao.clienteId, empresaId, deletedAt: null },
      });
      if (!cliente) throw new NotFoundException('Cliente não encontrado');

      // Só o que vai ser aplicado precisa estar em dia: campo reprovado não
      // toca o cadastro, e travar a aprovação por causa dele seria pedir para
      // refazer uma solicitação que já foi analisada.
      const conflitos = Object.entries(diff).filter(([campo, { de }]) =>
        CAMPOS_VIRTUAIS.includes(campo)
          ? false
          : serializar((cliente as Record<string, unknown>)[campo]) !== de,
      );
      if (conflitos.length > 0) {
        throw new ConflictException(
          `O cadastro mudou depois desta solicitação (${conflitos
            .map(([campo]) => campo)
            .join(', ')}). Peça para refazer a alteração.`,
        );
      }

      await this.aplicarNoCliente(
        tx,
        empresaId,
        solicitacao.clienteId,
        diff,
        user.id,
      );
      await this.gravarHistorico(tx, {
        empresaId,
        clienteId: solicitacao.clienteId,
        alteracaoId: solicitacao.id,
        diff,
        origem: solicitacao.origem,
        autor: user.id,
      });
      await this.gravarHistorico(tx, {
        empresaId,
        clienteId: solicitacao.clienteId,
        alteracaoId: solicitacao.id,
        diff: reprovado,
        origem: solicitacao.origem,
        autor: user.id,
        status: 'reprovado',
      });

      const atualizada = await tx.clienteAlteracao.update({
        where: { id },
        data: {
          status: 'aprovada',
          analisadoPor: user.id,
          analisadoEm: new Date(),
        },
        include: {
          cliente: { select: { razaoSocial: true, codigoErp: true } },
        },
      });
      return this.paraLeitura(
        atualizada,
        await this.nomesDeUsuarios([
          atualizada.solicitadoPor,
          atualizada.analisadoPor,
        ]),
      );
    });
  }

  async recusar(
    empresaId: string,
    user: AuthenticatedUser,
    id: string,
    motivo: string,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      await this.buscarPendenteNoEscopo(tx, empresaId, user, id);
      const atualizada = await tx.clienteAlteracao.update({
        where: { id },
        data: {
          status: 'rejeitada',
          motivoRecusa: motivo,
          analisadoPor: user.id,
          analisadoEm: new Date(),
        },
        include: {
          cliente: { select: { razaoSocial: true, codigoErp: true } },
        },
      });
      return this.paraLeitura(
        atualizada,
        await this.nomesDeUsuarios([
          atualizada.solicitadoPor,
          atualizada.analisadoPor,
        ]),
      );
    });
  }

  async historicoDoCliente(
    empresaId: string,
    user: AuthenticatedUser,
    clienteId: string,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const cliente = await tx.cliente.findFirst({
        where: {
          id: clienteId,
          empresaId,
          deletedAt: null,
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
        },
        select: { id: true },
      });
      if (!cliente) throw new NotFoundException('Cliente não encontrado');

      const linhas = await tx.clienteHistorico.findMany({
        where: { empresaId, clienteId },
        orderBy: { criadoEm: 'desc' },
        take: 200,
      });
      const nomes = await this.nomesDeUsuarios(linhas.map((l) => l.autor));
      return linhas.map((l) => ({
        id: l.id,
        clienteId: l.clienteId,
        alteracaoId: l.alteracaoId,
        campo: l.campo,
        valorAnterior: l.valorAnterior,
        valorNovo: l.valorNovo,
        status: l.status,
        origem: l.origem,
        autor: l.autor,
        autorNome: l.autor ? (nomes.get(l.autor) ?? null) : null,
        criadoEm: l.criadoEm,
      }));
    });
  }

  // ------------------------------------------------------------------

  /**
   * Solicitações que propõem CNAE para cliente que não tinha nenhum: a lista
   * de CNAEs está no diff com o "de" vazio. Filtro no JSON, que o `where` do
   * Prisma não expressa bem — o resto (escopo, status) fica com o chamador.
   */
  private async idsComCnaeVazio(
    tx: TenantTx,
    empresaId: string,
  ): Promise<string[]> {
    const linhas = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "cliente_alteracoes"
       WHERE "empresaId" = ${empresaId}
         AND ("alteracoes" -> ${CAMPO_CNAES}) IS NOT NULL
         AND ("alteracoes" -> ${CAMPO_CNAES} ->> 'de') IS NULL`;
    return linhas.map((l) => l.id);
  }

  /**
   * Aprovação em lote do CNAE vazio (ver `clienteAlteracaoAprovarVaziosSchema`).
   * Uma transação por solicitação: uma que falhe — já analisada por outra
   * pessoa, por exemplo — não desfaz as outras.
   */
  async aprovarVazios(
    empresaId: string,
    user: AuthenticatedUser,
    ids?: string[],
  ): Promise<ClienteAlteracaoAprovarVaziosResultado> {
    const alvo =
      ids ??
      (await this.prisma.withTenant(empresaId, async (tx) => {
        const escopo = await resolverEscopoVendedores(tx, empresaId, user);
        const linhas = await tx.clienteAlteracao.findMany({
          where: {
            empresaId,
            status: 'pendente',
            id: { in: await this.idsComCnaeVazio(tx, empresaId) },
            ...(escopo ? { cliente: { vendedorId: { in: escopo } } } : {}),
          },
          select: { id: true },
        });
        return linhas.map((l) => l.id);
      }));

    const resultado: ClienteAlteracaoAprovarVaziosResultado = {
      processadas: 0,
      concluidas: 0,
      parciais: 0,
      semCampoVazio: 0,
      falhas: 0,
    };
    for (const id of alvo) {
      resultado.processadas++;
      try {
        const desfecho = await this.prisma.withTenant(empresaId, (tx) =>
          this.aprovarCamposVazios(tx, empresaId, user, id),
        );
        resultado[desfecho]++;
      } catch {
        resultado.falhas++;
      }
    }
    return resultado;
  }

  private async aprovarCamposVazios(
    tx: TenantTx,
    empresaId: string,
    user: AuthenticatedUser,
    id: string,
  ): Promise<'concluidas' | 'parciais' | 'semCampoVazio'> {
    const solicitacao = await this.buscarPendenteNoEscopo(
      tx,
      empresaId,
      user,
      id,
    );
    const proposto = solicitacao.alteracoes as DiffAlteracao;
    const cliente = await tx.cliente.findFirst({
      where: { id: solicitacao.clienteId, empresaId, deletedAt: null },
    });
    if (!cliente) throw new NotFoundException('Cliente não encontrado');

    // Só o CNAE (ramo e principal) que estava vazio entra sem revisão —
    // decisão do usuário, 2026-10-07. Dado cadastral vazio (telefone,
    // bairro...) continua na solicitação, para alguém decidir.
    const aplicar: DiffAlteracao = {};
    const restante: DiffAlteracao = {};
    for (const [campo, valor] of Object.entries(proposto)) {
      if (CAMPOS_VIRTUAIS.includes(campo) && valor.de === null) {
        aplicar[campo] = valor;
      } else {
        restante[campo] = valor;
      }
    }
    if (Object.keys(aplicar).length === 0) return 'semCampoVazio';

    await this.aplicarNoCliente(
      tx,
      empresaId,
      solicitacao.clienteId,
      aplicar,
      user.id,
    );
    await this.gravarHistorico(tx, {
      empresaId,
      clienteId: solicitacao.clienteId,
      alteracaoId: solicitacao.id,
      diff: aplicar,
      origem: solicitacao.origem,
      autor: user.id,
    });

    if (Object.keys(restante).length === 0) {
      await tx.clienteAlteracao.update({
        where: { id },
        data: {
          status: 'aprovada',
          analisadoPor: user.id,
          analisadoEm: new Date(),
        },
      });
      return 'concluidas';
    }
    // O que divergia continua pendente, agora sem os campos já aplicados.
    await tx.clienteAlteracao.update({
      where: { id },
      data: { alteracoes: restante },
    });
    return 'parciais';
  }

  private async buscarPendenteNoEscopo(
    tx: TenantTx,
    empresaId: string,
    user: AuthenticatedUser,
    id: string,
  ) {
    const escopo = await resolverEscopoVendedores(tx, empresaId, user);
    const solicitacao = await tx.clienteAlteracao.findFirst({
      where: {
        id,
        empresaId,
        ...(escopo ? { cliente: { vendedorId: { in: escopo } } } : {}),
      },
    });
    if (!solicitacao) throw new NotFoundException('Solicitação não encontrada');
    if (solicitacao.status !== 'pendente') {
      throw new ConflictException(
        'Esta solicitação já foi analisada — recarregue a fila.',
      );
    }
    return solicitacao;
  }

  /**
   * O autor pode ser um usuário ou o marcador da API de integração; a consulta
   * é fora do withTenant porque `usuarios` é global (sem RLS).
   */
  private async nomesDeUsuarios(ids: (string | null)[]) {
    const unicos = [...new Set(ids.filter((v): v is string => !!v))];
    if (unicos.length === 0) return new Map<string, string>();
    const usuarios = await this.prisma.usuario.findMany({
      where: { id: { in: unicos } },
      select: { id: true, nome: true },
    });
    return new Map(usuarios.map((u) => [u.id, u.nome]));
  }

  private paraLeitura(
    linha: {
      id: string;
      empresaId: string;
      clienteId: string;
      origem: OrigemAlteracaoCliente;
      status: string;
      alteracoes: unknown;
      justificativa: string | null;
      solicitadoPor: string | null;
      solicitadoEm: Date;
      analisadoPor: string | null;
      analisadoEm: Date | null;
      motivoRecusa: string | null;
      cliente?: { razaoSocial: string; codigoErp: string | null } | null;
    },
    nomes: Map<string, string>,
  ) {
    return {
      id: linha.id,
      empresaId: linha.empresaId,
      clienteId: linha.clienteId,
      clienteRazaoSocial: linha.cliente?.razaoSocial ?? null,
      clienteCodigoErp: linha.cliente?.codigoErp ?? null,
      origem: linha.origem,
      status: linha.status,
      alteracoes: linha.alteracoes,
      justificativa: linha.justificativa,
      solicitadoPor: linha.solicitadoPor,
      solicitadoPorNome: linha.solicitadoPor
        ? (nomes.get(linha.solicitadoPor) ?? null)
        : null,
      solicitadoEm: linha.solicitadoEm,
      analisadoPor: linha.analisadoPor,
      analisadoPorNome: linha.analisadoPor
        ? (nomes.get(linha.analisadoPor) ?? null)
        : null,
      analisadoEm: linha.analisadoEm,
      motivoRecusa: linha.motivoRecusa,
    };
  }

  /** Exposto para o ClientesService decidir entre aplicar e enfileirar. */
  usuarioAprova(user: AuthenticatedUser): boolean {
    return this.podeAprovar(user);
  }
}
