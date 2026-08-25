import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  referenciasEm,
  remontar,
  type TipoReferencia,
} from './anonimizar-agente';

type Nomes = Record<TipoReferencia, Map<string, string>>;

/**
 * O lado de cá da fronteira: troca as referências opacas
 * (`«CLI:1234»`) pelos nomes reais, consultando a base.
 *
 * É a "montagem da resposta" da regra em `anonimizar-agente.ts`. Roda **depois**
 * de o modelo responder, e só sobre o texto que o usuário vai ler — o que vai
 * para o provedor continua sendo código.
 *
 * Uma consulta por tipo, com todas as referências do texto de uma vez: uma
 * resposta que cita 8 clientes não pode virar 8 idas ao banco.
 */
@Injectable()
export class AgenteReferenciasService {
  constructor(private readonly prisma: PrismaService) {}

  /** Remonta um texto. Sem referências, nem toca no banco. */
  async remontarTexto(
    empresaId: string,
    texto: string | null,
  ): Promise<string | null> {
    if (!texto) return texto;
    const refs = referenciasEm(texto);
    if (!refs.CLI.length && !refs.PRD.length && !refs.VND.length) return texto;

    const nomes = await this.buscarNomes(empresaId, refs);
    return remontar(texto, nomes);
  }

  /** Remonta vários textos com uma única rodada de consultas. */
  async remontarVarios(
    empresaId: string,
    textos: (string | null)[],
  ): Promise<(string | null)[]> {
    const refs = referenciasEm(textos.filter(Boolean).join('\n'));
    if (!refs.CLI.length && !refs.PRD.length && !refs.VND.length) return textos;

    const nomes = await this.buscarNomes(empresaId, refs);
    return textos.map((t) => (t ? remontar(t, nomes) : t));
  }

  /**
   * Traduz referências que voltaram nos **argumentos** de uma ferramenta.
   *
   * O modelo vê `cliente: "«CLI:1234»"` no resultado, então é natural que ele
   * devolva isso como `clienteId` na chamada seguinte. Sem esta tradução a
   * ferramenta receberia a referência como se fosse um id e responderia
   * "cliente não encontrado" — um beco sem saída que o modelo tentaria de novo
   * até estourar o limite de passos.
   */
  async resolverIds(
    empresaId: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const serializado = JSON.stringify(args);
    const refs = referenciasEm(serializado);
    if (!refs.CLI.length && !refs.PRD.length && !refs.VND.length) return args;

    const ids = await this.buscarIds(empresaId, refs);

    const traduzir = (v: unknown): unknown => {
      if (typeof v === 'string') {
        const casado = /^«(CLI|PRD|VND):([^»]+)»$/.exec(v.trim());
        if (!casado) return v;
        const [, tipo, chave] = casado;
        return ids[tipo as TipoReferencia].get(chave) ?? v;
      }
      if (Array.isArray(v)) return v.map(traduzir);
      if (v && typeof v === 'object') {
        return Object.fromEntries(
          Object.entries(v as Record<string, unknown>).map(([k, val]) => [
            k,
            traduzir(val),
          ]),
        );
      }
      return v;
    };

    return traduzir(args) as Record<string, unknown>;
  }

  /** Referência → id interno, para o caminho de volta dos argumentos. */
  private async buscarIds(
    empresaId: string,
    refs: Record<TipoReferencia, string[]>,
  ): Promise<Nomes> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const [clientes, produtos, vendedores] = await Promise.all([
        refs.CLI.length
          ? tx.cliente.findMany({
              where: {
                empresaId,
                OR: [{ codigoErp: { in: refs.CLI } }, { id: { in: refs.CLI } }],
              },
              select: { id: true, codigoErp: true },
            })
          : [],
        refs.PRD.length
          ? tx.produto.findMany({
              where: {
                empresaId,
                OR: [{ codigoErp: { in: refs.PRD } }, { id: { in: refs.PRD } }],
              },
              select: { id: true, codigoErp: true },
            })
          : [],
        refs.VND.length
          ? tx.vendedor.findMany({
              where: {
                empresaId,
                OR: [{ codigoErp: { in: refs.VND } }, { id: { in: refs.VND } }],
              },
              select: { id: true, codigoErp: true },
            })
          : [],
      ]);

      const ids: Nomes = { CLI: new Map(), PRD: new Map(), VND: new Map() };
      const registrar = (
        tipo: TipoReferencia,
        linhas: { id: string; codigoErp: string | null }[],
      ) => {
        for (const l of linhas) {
          if (l.codigoErp) ids[tipo].set(l.codigoErp, l.id);
          ids[tipo].set(l.id, l.id);
        }
      };
      registrar('CLI', clientes);
      registrar('PRD', produtos);
      registrar('VND', vendedores);
      return ids;
    });
  }

  /**
   * A referência é o `codigoErp` quando existe e o `id` quando não — então a
   * busca cobre os dois campos, sem tentar adivinhar qual é qual pelo formato.
   */
  private async buscarNomes(
    empresaId: string,
    refs: Record<TipoReferencia, string[]>,
  ): Promise<Nomes> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const [clientes, produtos, vendedores] = await Promise.all([
        refs.CLI.length
          ? tx.cliente.findMany({
              where: {
                empresaId,
                OR: [{ codigoErp: { in: refs.CLI } }, { id: { in: refs.CLI } }],
              },
              select: {
                id: true,
                codigoErp: true,
                razaoSocial: true,
                nomeFantasia: true,
              },
            })
          : [],
        refs.PRD.length
          ? tx.produto.findMany({
              where: {
                empresaId,
                OR: [{ codigoErp: { in: refs.PRD } }, { id: { in: refs.PRD } }],
              },
              select: { id: true, codigoErp: true, descricao: true },
            })
          : [],
        refs.VND.length
          ? tx.vendedor.findMany({
              where: {
                empresaId,
                OR: [{ codigoErp: { in: refs.VND } }, { id: { in: refs.VND } }],
              },
              select: { id: true, codigoErp: true, nome: true },
            })
          : [],
      ]);

      const nomes: Nomes = { CLI: new Map(), PRD: new Map(), VND: new Map() };

      for (const c of clientes) {
        // Nome fantasia é como o vendedor chama o cliente; a razão social é o
        // que está no contrato. Mostrar os dois quando diferem evita a dúvida
        // de "é esse mesmo?" sem obrigar a abrir a ficha.
        const nome =
          c.nomeFantasia && c.nomeFantasia !== c.razaoSocial
            ? `${c.razaoSocial} (${c.nomeFantasia})`
            : c.razaoSocial;
        if (c.codigoErp) nomes.CLI.set(c.codigoErp, nome);
        nomes.CLI.set(c.id, nome);
      }
      for (const p of produtos) {
        if (p.codigoErp) nomes.PRD.set(p.codigoErp, p.descricao);
        nomes.PRD.set(p.id, p.descricao);
      }
      for (const v of vendedores) {
        if (v.codigoErp) nomes.VND.set(v.codigoErp, v.nome);
        nomes.VND.set(v.id, v.nome);
      }

      return nomes;
    });
  }
}
