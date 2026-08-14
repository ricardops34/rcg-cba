import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConsultasService } from '../consultas/consultas.service';
import { ClientesService } from '../clientes/clientes.service';
import { ProdutosService } from '../produtos/produtos.service';
import { OrcamentosService } from '../orcamentos/orcamentos.service';
import { TitulosReceberService } from '../titulos-receber/titulos-receber.service';
import { SugestaoCompraService } from '../sugestao-compra/sugestao-compra.service';
import type { FerramentaChat } from './provedor-ia';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/**
 * Catálogo de ferramentas do agente.
 *
 * Regra inegociável: **nenhuma ferramenta toca o Prisma direto.** Cada uma
 * delega ao service que a tela já usa, passando o mesmo `AuthenticatedUser` da
 * requisição. Assim o `withTenant`/RLS, o escopo hierárquico de carteira e as
 * regras de comissão continuam valendo sem serem reimplementadas — e sem poder
 * ser esquecidas aqui.
 *
 * A permissão é checada **duas vezes**, de propósito:
 *
 * 1. na montagem do prompt, filtrando o catálogo — o modelo nem enxerga o que
 *    o usuário não pode fazer, então não promete o que não vai entregar;
 * 2. na execução, antes de chamar o service — porque um `tool_call` é texto
 *    gerado por um modelo e não é confiável como autorização.
 */

export interface Ferramenta {
  nome: string;
  descricao: string;
  parametros: Record<string, unknown>;
  /** `rotina.acao`, mesma semântica do @RequirePermission. */
  permissao: string;
  /** Ferramenta que grava não executa direto — vira pendência de confirmação. */
  escrita?: boolean;
  /** Resumo legível da ação, para o card de confirmação. */
  resumir?: (args: Record<string, unknown>) => string;
  executar: (
    args: Record<string, unknown>,
    user: AuthenticatedUser,
  ) => Promise<unknown>;
}

const texto = (v: unknown): string => (typeof v === 'string' ? v : '');
const numero = (v: unknown, padrao: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : padrao;

@Injectable()
export class AgenteToolsService {
  constructor(
    private readonly consultas: ConsultasService,
    private readonly clientes: ClientesService,
    private readonly produtos: ProdutosService,
    private readonly orcamentos: OrcamentosService,
    private readonly titulos: TitulosReceberService,
    private readonly sugestao: SugestaoCompraService,
  ) {}

  private todas(): Ferramenta[] {
    return [
      {
        nome: 'buscar_cliente',
        descricao:
          'Busca clientes da carteira do usuário por nome, razão social ou código. ' +
          'Use para descobrir o id de um cliente antes de outras ferramentas.',
        permissao: 'clientes.visualizar',
        parametros: {
          type: 'object',
          properties: {
            busca: {
              type: 'string',
              description: 'Nome, razão social ou código',
            },
          },
          required: ['busca'],
        },
        executar: (a, user) =>
          this.clientes.findAll(user.empresaAtivaId, user, {
            page: 1,
            pageSize: 10,
            search: texto(a.busca),
            sortOrder: 'asc',
          } as never),
      },
      {
        nome: 'buscar_produto',
        descricao: 'Busca produtos do catálogo por descrição ou código.',
        permissao: 'produtos.visualizar',
        parametros: {
          type: 'object',
          properties: { busca: { type: 'string' } },
          required: ['busca'],
        },
        executar: (a, user) =>
          this.produtos.findAll(user.empresaAtivaId, {
            page: 1,
            pageSize: 10,
            search: texto(a.busca),
            sortOrder: 'asc',
          } as never),
      },
      {
        nome: 'posicao_cliente',
        descricao:
          'Posição completa de um cliente: notas de saída, títulos a receber, ' +
          'comodatos e mix de produtos comprados.',
        permissao: 'posicao-cliente.visualizar',
        parametros: {
          type: 'object',
          properties: { clienteId: { type: 'string' } },
          required: ['clienteId'],
        },
        executar: (a, user) =>
          this.clientes.posicao(user.empresaAtivaId, user, texto(a.clienteId)),
      },
      {
        nome: 'sugerir_compras',
        descricao:
          'Sugere produtos para um cliente com base no que clientes semelhantes ' +
          '(mesmo ramo/CNAE e cesta de compras parecida) compram e ele não. ' +
          'Devolve a evidência: quantos semelhantes compram e o ticket médio.',
        permissao: 'sugestao-compra.visualizar',
        parametros: {
          type: 'object',
          properties: {
            clienteId: { type: 'string' },
            limite: {
              type: 'number',
              description: 'Quantos produtos (padrão 10)',
            },
          },
          required: ['clienteId'],
        },
        executar: (a, user) =>
          this.sugestao.paraCliente(
            user.empresaAtivaId,
            user,
            texto(a.clienteId),
            {
              meses: 12,
              limite: numero(a.limite, 10),
              semelhantes: 30,
              baseSemelhanca: 'ambos',
            },
          ),
      },
      {
        nome: 'titulos_em_aberto',
        descricao:
          'Títulos a receber em aberto, com vencidos e a vencer. Aceita filtro por cliente.',
        permissao: 'titulos-receber.visualizar',
        parametros: {
          type: 'object',
          properties: { clienteId: { type: 'string' } },
        },
        executar: (a, user) =>
          this.titulos.findAll(user.empresaAtivaId, user, {
            page: 1,
            pageSize: 20,
            sortOrder: 'asc',
            ...(texto(a.clienteId) ? { clienteId: texto(a.clienteId) } : {}),
          } as never),
      },
      {
        nome: 'listar_orcamentos',
        descricao:
          'Lista orçamentos da carteira, com filtro opcional por cliente.',
        permissao: 'orcamentos.visualizar',
        parametros: {
          type: 'object',
          properties: { clienteId: { type: 'string' } },
        },
        executar: (a, user) =>
          this.orcamentos.findAll(user.empresaAtivaId, user, {
            page: 1,
            pageSize: 20,
            sortOrder: 'desc',
            ...(texto(a.clienteId) ? { clienteId: texto(a.clienteId) } : {}),
          } as never),
      },
      {
        nome: 'vendas_por_cliente',
        descricao:
          'Vendas do período somadas mês a mês por cliente. Informe ano/mês inicial e final ' +
          '(máximo 12 meses).',
        permissao: 'consulta-vendas-cliente.visualizar',
        parametros: {
          type: 'object',
          properties: {
            anoInicial: { type: 'number' },
            mesInicial: { type: 'number' },
            anoFinal: { type: 'number' },
            mesFinal: { type: 'number' },
          },
          required: ['anoInicial', 'mesInicial', 'anoFinal', 'mesFinal'],
        },
        executar: (a, user) =>
          this.consultas.vendasPorCliente(user.empresaAtivaId, user, {
            anoInicial: numero(a.anoInicial, new Date().getFullYear()),
            mesInicial: numero(a.mesInicial, 1),
            anoFinal: numero(a.anoFinal, new Date().getFullYear()),
            mesFinal: numero(a.mesFinal, 12),
          }),
      },
      {
        nome: 'vendas_por_produto',
        descricao:
          'Vendas do período somadas mês a mês por produto (máximo 12 meses).',
        permissao: 'consulta-vendas-produto.visualizar',
        parametros: {
          type: 'object',
          properties: {
            anoInicial: { type: 'number' },
            mesInicial: { type: 'number' },
            anoFinal: { type: 'number' },
            mesFinal: { type: 'number' },
          },
          required: ['anoInicial', 'mesInicial', 'anoFinal', 'mesFinal'],
        },
        executar: (a, user) =>
          this.consultas.vendasPorProduto(user.empresaAtivaId, user, {
            anoInicial: numero(a.anoInicial, new Date().getFullYear()),
            mesInicial: numero(a.mesInicial, 1),
            anoFinal: numero(a.anoFinal, new Date().getFullYear()),
            mesFinal: numero(a.mesFinal, 12),
          }),
      },
      // ---- escrita: não executa direto, vira pendência de confirmação ----
      {
        nome: 'criar_orcamento',
        descricao:
          'Cria um orçamento para um cliente. NÃO grava imediatamente: o usuário ' +
          'precisa confirmar na tela. Informe clienteId, título e os itens ' +
          '(produtoId e quantidade).',
        permissao: 'orcamentos.cadastrar',
        escrita: true,
        resumir: (a) => {
          const itens = Array.isArray(a.itens) ? a.itens : [];
          return `Orçamento "${texto(a.titulo) || 'sem título'}" com ${itens.length} item(ns)`;
        },
        parametros: {
          type: 'object',
          properties: {
            clienteId: { type: 'string' },
            titulo: { type: 'string' },
            itens: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  produtoId: { type: 'string' },
                  quantidade: { type: 'number' },
                },
                required: ['produtoId', 'quantidade'],
              },
            },
          },
          required: ['clienteId', 'titulo', 'itens'],
        },
        executar: (a, user) =>
          this.orcamentos.create(user.empresaAtivaId, user, a as never),
      },
    ];
  }

  private permitida(f: Ferramenta, user: AuthenticatedUser): boolean {
    return user.isAdmin || user.permissoes.includes(f.permissao);
  }

  /** Só o que o usuário pode fazer — é este recorte que vai para o modelo. */
  disponiveisPara(user: AuthenticatedUser): Ferramenta[] {
    return this.todas().filter((f) => this.permitida(f, user));
  }

  paraProvedor(user: AuthenticatedUser): FerramentaChat[] {
    return this.disponiveisPara(user).map((f) => ({
      nome: f.nome,
      descricao: f.descricao,
      parametros: f.parametros,
    }));
  }

  buscar(nome: string): Ferramenta | undefined {
    return this.todas().find((f) => f.nome === nome);
  }

  /**
   * Segunda trava. Chamada antes de qualquer execução, inclusive na
   * confirmação de uma pendência — a permissão pode ter sido revogada entre a
   * proposta e o clique em Confirmar.
   */
  garantirPermissao(f: Ferramenta, user: AuthenticatedUser): void {
    if (!this.permitida(f, user)) {
      throw new ForbiddenException(
        `Usuário não possui a permissão ${f.permissao} exigida por ${f.nome}`,
      );
    }
  }

  async executar(
    nome: string,
    args: Record<string, unknown>,
    user: AuthenticatedUser,
  ): Promise<unknown> {
    const ferramenta = this.buscar(nome);
    if (!ferramenta) {
      // Modelo alucinou um nome de ferramenta: o erro volta como resultado
      // para ele se corrigir, em vez de derrubar a conversa.
      throw new ForbiddenException(`Ferramenta desconhecida: ${nome}`);
    }
    this.garantirPermissao(ferramenta, user);
    return ferramenta.executar(args, user);
  }
}
