import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PrismaService,
  type TenantTx,
} from '../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import { resolverEscopoVendedores } from '../../common/escopo/escopo-vendedores';
import { registrarAtividadeAlteracaoCliente } from './registrar-atividade-alteracao-cliente';
import {
  clienteUpdateSchema,
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
      await this.aplicarNoCliente(tx, clienteId, diff, autorId);
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
    if (!pendente) {
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
    clienteId: string,
    diff: DiffAlteracao,
    autorId: string | null,
  ) {
    const bruto: Record<string, unknown> = {};
    for (const [campo, { para }] of Object.entries(diff)) bruto[campo] = para;

    const dados = clienteUpdateSchema.parse(bruto);
    await tx.cliente.update({
      where: { id: clienteId },
      data: { ...(dados as object), updatedBy: autorId } as never,
    });
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
    },
  ) {
    const { empresaId, clienteId, alteracaoId, diff, origem, autor } = params;
    await tx.clienteHistorico.createMany({
      data: Object.entries(diff).map(([campo, { de, para }]) => ({
        empresaId,
        clienteId,
        alteracaoId,
        campo,
        valorAnterior: de == null ? null : String(de),
        valorNovo: para == null ? null : String(para),
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
      const where = {
        empresaId,
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

  async aprovar(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const solicitacao = await this.buscarPendenteNoEscopo(
        tx,
        empresaId,
        user,
        id,
      );
      const diff = solicitacao.alteracoes as DiffAlteracao;

      // O cliente pode ter mudado entre a solicitação e a aprovação (outra
      // solicitação aprovada antes, por exemplo). Aprovar às cegas sobrescreveria
      // em silêncio — melhor recusar e mandar reabrir com o estado atual.
      const cliente = await tx.cliente.findFirst({
        where: { id: solicitacao.clienteId, empresaId, deletedAt: null },
      });
      if (!cliente) throw new NotFoundException('Cliente não encontrado');

      const conflitos = Object.entries(diff).filter(
        ([campo, { de }]) =>
          serializar((cliente as Record<string, unknown>)[campo]) !== de,
      );
      if (conflitos.length > 0) {
        throw new ConflictException(
          `O cadastro mudou depois desta solicitação (${conflitos
            .map(([campo]) => campo)
            .join(', ')}). Peça para refazer a alteração.`,
        );
      }

      await this.aplicarNoCliente(tx, solicitacao.clienteId, diff, user.id);
      await this.gravarHistorico(tx, {
        empresaId,
        clienteId: solicitacao.clienteId,
        alteracaoId: solicitacao.id,
        diff,
        origem: solicitacao.origem,
        autor: user.id,
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
        origem: l.origem,
        autor: l.autor,
        autorNome: l.autor ? (nomes.get(l.autor) ?? null) : null,
        criadoEm: l.criadoEm,
      }));
    });
  }

  // ------------------------------------------------------------------

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
