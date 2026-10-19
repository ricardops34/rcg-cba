import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  PrismaService,
  type TenantTx,
} from '../../common/prisma/prisma.service';
import {
  abrirParametro,
  cifrarParametro,
  estaCifrado,
} from './parametros-cripto';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import type {
  ParametroEmpresaCreate,
  ParametroEmpresaQuery,
  ParametroEmpresaUpdate,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

const SORT_FIELDS = new Set(['parametro', 'tipo', 'ativo', 'createdAt']);

/** Chave usada pela integração de produtos quando o ERP não informa armazém. */
export const PARAMETRO_ARMAZEM_PADRAO = 'ARMAZEM_PADRAO';
export const PARAMETRO_TABELA_PRECO_PADRAO = 'TABELA_PRECO_PADRAO';
export const PARAMETRO_TABELA_PRECO_CAPITAL = 'TABELA_PRECO_CAPITAL';
export const PARAMETRO_TABELA_PRECO_INTERIOR = 'TABELA_PRECO_INTERIOR';
export const PARAMETRO_ORCAMENTO_EXIBIR_FOTOS =
  'ORCAMENTO_EXIBIR_FOTOS_PRODUTOS';
/** Se o vendedor pode trocar a tabela de preços no orçamento. */
export const PARAMETRO_ORCAMENTO_ALTERA_TABELA_PRECO =
  'ORCAMENTO_ALTERA_TABELA_PRECO';
/** Endereço base do link público do orçamento; vazio usa o endereço do sistema. */
export const PARAMETRO_ORCAMENTO_LINK_URL_BASE = 'ORCAMENTO_LINK_URL_BASE';
export const PARAMETRO_BOLETO_PRAZO_MAXIMO_REEMISSAO =
  'BOLETO_PRAZO_MAXIMO_REEMISSAO';
/** Gravado pela integração (POST /integracao/comunicacao), em ISO 8601. */
export const PARAMETRO_ULTIMA_COMUNICACAO_ERP = 'ULTIMA_COMUNICACAO_ERP';

type ParametroRow = {
  id: string;
  empresaId: string;
  parametro: string;
  tipo: string;
  tamanho: number | null;
  conteudo: string | null;
  descricao: string | null;
  ativo: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
};

/**
 * Parâmetros do sistema por empresa. Duas responsabilidades:
 *
 * - **CRUD** da tela de Administração > Parâmetros;
 * - **leitura tipada** para o resto do backend (`obterNumero`, `obterBoolean`,
 *   `obterTexto`), que converte o `conteudo` textual conforme o `tipo` e cai
 *   num default quando o parâmetro não existe ou está vazio.
 */
@Injectable()
export class ParametrosService {
  private readonly logger = new Logger(ParametrosService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Conteúdo de tipo senha nunca sai da API — só a informação de que existe. */
  private paraLeitura(row: ParametroRow) {
    const ehSenha = row.tipo === 'senha';
    return {
      ...row,
      conteudo: ehSenha ? null : row.conteudo,
      preenchido: !!row.conteudo,
    };
  }

  /**
   * Rejeita conteúdo que não corresponde ao tipo declarado — sem isso um
   * 'abc' num parâmetro numérico só apareceria como erro lá na frente, em
   * quem consome.
   */
  private validarConteudo(
    tipo: string | undefined,
    conteudo: string | null | undefined,
    tamanho: number | null | undefined,
  ) {
    if (conteudo == null || conteudo === '') return;
    if (tipo === 'numero' && Number.isNaN(Number(conteudo))) {
      throw new BadRequestException('Conteúdo deve ser um número');
    }
    if (tipo === 'booleano' && !['true', 'false'].includes(conteudo)) {
      throw new BadRequestException('Conteúdo deve ser "true" ou "false"');
    }
    if (tipo === 'data' && Number.isNaN(new Date(conteudo).getTime())) {
      throw new BadRequestException('Conteúdo deve ser uma data válida');
    }
    if (tamanho && conteudo.length > tamanho) {
      throw new BadRequestException(
        `Conteúdo excede o tamanho do parâmetro (${tamanho})`,
      );
    }
  }

  findAll(empresaId: string, query: ParametroEmpresaQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        deletedAt: null,
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.tipo ? { tipo: query.tipo } : {}),
        ...(query.search
          ? {
              OR: [
                {
                  parametro: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  descricao: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
              ],
            }
          : {}),
      };
      const sortField =
        query.sortBy && SORT_FIELDS.has(query.sortBy)
          ? query.sortBy
          : 'parametro';
      const [data, total] = await Promise.all([
        tx.parametroEmpresa.findMany({
          where,
          ...paginationToSkipTake(query),
          orderBy: { [sortField]: query.sortOrder },
        }),
        tx.parametroEmpresa.count({ where }),
      ]);
      return buildPaginatedResult(
        data.map((r) => this.paraLeitura(r)),
        total,
        query,
      );
    });
  }

  async findOne(empresaId: string, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const row = await tx.parametroEmpresa.findFirst({
        where: { id, empresaId, deletedAt: null },
      });
      if (!row) throw new NotFoundException('Parâmetro não encontrado');
      return this.paraLeitura(row);
    });
  }

  create(
    empresaId: string,
    user: AuthenticatedUser,
    input: ParametroEmpresaCreate,
  ) {
    this.validarConteudo(input.tipo, input.conteudo, input.tamanho);
    return this.prisma.withTenant(empresaId, async (tx) => {
      // A chave é única por empresa **inclusive entre os excluídos** (o
      // `@@unique` do banco). Excluído com a mesma chave é reativado com os
      // dados novos; antes o `create` batia no índice e dava 500.
      const existente = await tx.parametroEmpresa.findFirst({
        where: { empresaId, parametro: input.parametro },
        select: { id: true, deletedAt: true },
      });
      if (existente && !existente.deletedAt) {
        throw new ConflictException(
          `Já existe o parâmetro '${input.parametro}' nesta empresa`,
        );
      }
      const dados = {
        ...input,
        conteudo:
          input.tipo === 'senha' && input.conteudo
            ? cifrarParametro(input.conteudo)
            : (input.conteudo ?? null),
        descricao: input.descricao ?? null,
        tamanho: input.tamanho ?? null,
        updatedBy: user.id,
      };
      const row = existente
        ? await tx.parametroEmpresa.update({
            where: { id: existente.id },
            data: { ...dados, deletedAt: null, deletedBy: null },
          })
        : await tx.parametroEmpresa.create({
            data: { ...dados, empresaId, createdBy: user.id },
          });
      return this.paraLeitura(row);
    });
  }

  async update(
    empresaId: string,
    user: AuthenticatedUser,
    id: string,
    input: ParametroEmpresaUpdate,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const atual = await tx.parametroEmpresa.findFirst({
        where: { id, empresaId, deletedAt: null },
      });
      if (!atual) throw new NotFoundException('Parâmetro não encontrado');

      // O código procura o parâmetro pela chave (`SMTP_SENHA`, `SMS_TOKEN`...):
      // renomear desligava o recurso em silêncio, e uma chave repetida dava
      // 500 no índice. Para outra chave, cadastra-se um parâmetro novo.
      if (
        input.parametro !== undefined &&
        input.parametro !== atual.parametro
      ) {
        throw new BadRequestException(
          'A chave do parâmetro não pode ser alterada. Cadastre um parâmetro novo com a outra chave.',
        );
      }

      this.validarConteudo(
        input.tipo ?? atual.tipo,
        input.conteudo,
        input.tamanho !== undefined ? input.tamanho : atual.tamanho,
      );

      // Sair do tipo senha descarta o segredo gravado: sem isso, trocar o tipo
      // para texto (sem mandar conteúdo) passava a devolver a senha no GET.
      const tipoFinal = input.tipo ?? atual.tipo;
      const deixaDeSerSenha = atual.tipo === 'senha' && tipoFinal !== 'senha';

      let conteudo: { conteudo?: string | null } = {};
      if (deixaDeSerSenha) {
        conteudo = { conteudo: input.conteudo || null };
      } else if (tipoFinal === 'senha') {
        // Senha em branco no formulário significa "manter a atual", e não
        // "apagar" — o valor nunca é exibido para ser redigitado. O que fica
        // gravado vai sempre cifrado (inclusive o texto de um parâmetro que
        // acabou de virar senha).
        const valor = input.conteudo || atual.conteudo;
        conteudo = {
          conteudo: !valor
            ? null
            : estaCifrado(valor)
              ? valor
              : cifrarParametro(valor),
        };
      }

      const row = await tx.parametroEmpresa.update({
        where: { id },
        data: { ...input, ...conteudo, updatedBy: user.id },
      });
      return this.paraLeitura(row);
    });
  }

  async remove(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const atual = await tx.parametroEmpresa.findFirst({
        where: { id, empresaId, deletedAt: null },
        select: { id: true },
      });
      if (!atual) throw new NotFoundException('Parâmetro não encontrado');
      await tx.parametroEmpresa.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: user.id, ativo: false },
      });
      return { success: true };
    });
  }

  // ------------------------------------------------------------------
  // Leitura tipada, para o resto do backend
  // ------------------------------------------------------------------

  /**
   * Conteúdo de um parâmetro ativo, ou null — já decifrado, quando é segredo.
   * Aceita tx pra reaproveitar a transação.
   *
   * Segredo que não decifra (chave mestra ausente ou trocada) vira null, como
   * um parâmetro vazio: a tela mostra a senha como não preenchida, o envio fica
   * desligado e o motivo vai ao log — em vez de cada tela de E-mail/SMS e cada
   * envio quebrar com erro interno.
   */
  private async conteudoDe(
    empresaId: string,
    parametro: string,
    tx?: TenantTx,
  ): Promise<string | null> {
    const buscar = async (t: TenantTx) => {
      const row = await t.parametroEmpresa.findFirst({
        where: { empresaId, parametro, ativo: true, deletedAt: null },
        select: { conteudo: true },
      });
      return row?.conteudo ?? null;
    };
    const guardado = tx
      ? await buscar(tx)
      : await this.prisma.withTenant(empresaId, (t) => buscar(t));
    if (!guardado || !estaCifrado(guardado)) return guardado;
    try {
      return abrirParametro(guardado);
    } catch (erro) {
      this.logger.error(
        `Parâmetro ${parametro} da empresa ${empresaId} não decifrou: ${(erro as Error).message}`,
      );
      return null;
    }
  }

  async obterNumero(
    empresaId: string,
    parametro: string,
    padrao: number,
    tx?: TenantTx,
  ): Promise<number> {
    const conteudo = await this.conteudoDe(empresaId, parametro, tx);
    if (conteudo == null || conteudo === '') return padrao;
    const n = Number(conteudo);
    return Number.isNaN(n) ? padrao : n;
  }

  async obterBoolean(
    empresaId: string,
    parametro: string,
    padrao: boolean,
    tx?: TenantTx,
  ): Promise<boolean> {
    const conteudo = await this.conteudoDe(empresaId, parametro, tx);
    if (conteudo == null || conteudo === '') return padrao;
    return conteudo === 'true';
  }

  async obterTexto(
    empresaId: string,
    parametro: string,
    padrao: string | null = null,
    tx?: TenantTx,
  ): Promise<string | null> {
    const conteudo = await this.conteudoDe(empresaId, parametro, tx);
    return conteudo == null || conteudo === '' ? padrao : conteudo;
  }
}
