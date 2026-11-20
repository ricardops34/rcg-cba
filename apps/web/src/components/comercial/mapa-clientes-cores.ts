import {
  SITUACAO_PIN_CLIENTE_ROTULO,
  type PosicaoClienteMapaPin,
  type SituacaoPinCliente,
} from "@plataforma/contracts";

/**
 * Cor de cada situação do pin no mapa da Posição de Cliente. Mesma leitura da
 * listagem: em aberto em azul (o "$" azul da tela), ativo em verde. Fica fora
 * do arquivo do Leaflet para a legenda não puxar o Leaflet para o carregamento
 * da página.
 */
export const COR_SITUACAO: Record<SituacaoPinCliente, string> = {
  bloqueado: "#b91c1c",
  titulo_vencido: "#ea580c",
  titulo_aberto: "#2563eb",
  ativo: "#16a34a",
  inativo: "#9ca3af",
};

/** Ordem da legenda: da pior situação para a melhor. */
export const ORDEM_SITUACAO: SituacaoPinCliente[] = [
  "bloqueado",
  "titulo_vencido",
  "titulo_aberto",
  "ativo",
  "inativo",
];

/** Lead no mapa: roxo, fora da escala de situação dos clientes. */
export const COR_LEAD = "#7c3aed";

const CINZA = "#9ca3af";

/**
 * Paleta para grupos sem ordem natural (vendedor, ramo): cores bem
 * distintas entre si e do cinza de "sem"/"outros".
 */
const PALETA = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#65a30d",
  "#92400e",
  "#4f46e5",
  "#0f766e",
  "#be123c",
];

/** O que a cor do pin conta (20/11/2026). */
export const COLORIR_POR = {
  financeiro: "Financeiro",
  situacao: "Situação",
  vendedor: "Vendedor",
  dias: "Dias sem compra",
  tipoPessoa: "Tipo de pessoa",
  cnae: "Ramo (CNAE)",
  curva: "Faturamento no período (curva ABC)",
} as const;
export type ColorirPor = keyof typeof COLORIR_POR;

export type GrupoLegenda = { chave: string; rotulo: string; cor: string; total: number };

export type Coloracao = {
  /** Grupos na ordem da legenda, com a contagem. */
  grupos: GrupoLegenda[];
  /** O grupo de cada pin (id → chave). */
  grupoDe: Map<string, string>;
};

const diasDesde = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

/** Grupos fixos, na ordem dada; só aparecem na legenda os que têm pin. */
function fixos(
  pins: PosicaoClienteMapaPin[],
  defs: Array<{ chave: string; rotulo: string; cor: string }>,
  chaveDe: (p: PosicaoClienteMapaPin) => string,
): Coloracao {
  const grupoDe = new Map<string, string>();
  const total = new Map<string, number>();
  for (const p of pins) {
    const k = chaveDe(p);
    grupoDe.set(p.id, k);
    total.set(k, (total.get(k) ?? 0) + 1);
  }
  return {
    grupoDe,
    grupos: defs.filter((d) => total.get(d.chave)).map((d) => ({ ...d, total: total.get(d.chave)! })),
  };
}

/**
 * Grupos pelo valor de um campo (vendedor, ramo): os mais frequentes ganham
 * cor própria, o resto cai em "Outros"; sem valor, "Sem …".
 */
function porValor(
  pins: PosicaoClienteMapaPin[],
  valorDe: (p: PosicaoClienteMapaPin) => string | null,
  rotuloSem: string,
): Coloracao {
  const total = new Map<string, number>();
  for (const p of pins) {
    const v = valorDe(p);
    if (v) total.set(v, (total.get(v) ?? 0) + 1);
  }
  const ordenados = [...total.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const comCor = new Map(ordenados.slice(0, PALETA.length).map(([v], i) => [v, PALETA[i]]));
  const grupoDe = new Map<string, string>();
  let outros = 0;
  let sem = 0;
  for (const p of pins) {
    const v = valorDe(p);
    if (!v) {
      grupoDe.set(p.id, "__sem");
      sem++;
    } else if (comCor.has(v)) {
      grupoDe.set(p.id, v);
    } else {
      grupoDe.set(p.id, "__outros");
      outros++;
    }
  }
  const grupos: GrupoLegenda[] = ordenados
    .slice(0, PALETA.length)
    .map(([v, n]) => ({ chave: v, rotulo: v, cor: comCor.get(v)!, total: n }));
  if (outros) grupos.push({ chave: "__outros", rotulo: "Outros", cor: "#475569", total: outros });
  if (sem) grupos.push({ chave: "__sem", rotulo: rotuloSem, cor: CINZA, total: sem });
  return { grupoDe, grupos };
}

/** Curva ABC pelo faturamento do período: A = 80% do total, B = até 95%, C = o resto. */
function curvaAbc(pins: PosicaoClienteMapaPin[]): Coloracao {
  const comVenda = pins.filter((p) => p.vendaPeriodo > 0).sort((a, b) => b.vendaPeriodo - a.vendaPeriodo);
  const soma = comVenda.reduce((s, p) => s + p.vendaPeriodo, 0);
  const classe = new Map<string, string>();
  let acumulado = 0;
  for (const p of comVenda) {
    // Classe pelo acumulado *antes* do cliente: o que cruza os 80% ainda é A.
    classe.set(p.id, acumulado < soma * 0.8 ? "A" : acumulado < soma * 0.95 ? "B" : "C");
    acumulado += p.vendaPeriodo;
  }
  return fixos(
    pins,
    [
      { chave: "A", rotulo: "A — 80% do faturamento", cor: "#16a34a" },
      { chave: "B", rotulo: "B — os 15% seguintes", cor: "#2563eb" },
      { chave: "C", rotulo: "C — os 5% finais", cor: "#d97706" },
      { chave: "sem", rotulo: "Sem venda no período", cor: CINZA },
    ],
    (p) => classe.get(p.id) ?? "sem",
  );
}

export function colorir(pins: PosicaoClienteMapaPin[], modo: ColorirPor): Coloracao {
  switch (modo) {
    case "financeiro":
      return fixos(
        pins,
        ORDEM_SITUACAO.map((s) => ({ chave: s, rotulo: SITUACAO_PIN_CLIENTE_ROTULO[s], cor: COR_SITUACAO[s] })),
        (p) => p.situacao,
      );
    case "situacao":
      return fixos(
        pins,
        [
          { chave: "ativo", rotulo: "Ativo", cor: "#16a34a" },
          { chave: "inativo", rotulo: "Inativo", cor: CINZA },
          { chave: "bloqueado", rotulo: "Bloqueado", cor: "#b91c1c" },
        ],
        (p) => (p.bloqueado ? "bloqueado" : p.ativo ? "ativo" : "inativo"),
      );
    case "vendedor":
      return porValor(pins, (p) => p.vendedorNome, "Sem vendedor");
    case "dias":
      return fixos(
        pins,
        [
          { chave: "30", rotulo: "Até 30 dias", cor: "#16a34a" },
          { chave: "60", rotulo: "31 a 60 dias", cor: "#65a30d" },
          { chave: "90", rotulo: "61 a 90 dias", cor: "#d97706" },
          { chave: "mais", rotulo: "Mais de 90 dias", cor: "#dc2626" },
          { chave: "nunca", rotulo: "Nunca comprou", cor: CINZA },
        ],
        (p) => {
          if (!p.ultimaCompra) return "nunca";
          const d = diasDesde(p.ultimaCompra);
          return d <= 30 ? "30" : d <= 60 ? "60" : d <= 90 ? "90" : "mais";
        },
      );
    case "tipoPessoa":
      return fixos(
        pins,
        [
          { chave: "juridica", rotulo: "Pessoa jurídica", cor: "#2563eb" },
          { chave: "fisica", rotulo: "Pessoa física", cor: "#db2777" },
        ],
        (p) => p.tipoPessoa,
      );
    case "cnae":
      return porValor(
        pins,
        (p) => (p.cnaeDescricao ? `${p.cnaeCodigo ?? ""} ${p.cnaeDescricao}`.trim() : null),
        "Sem CNAE cadastrado",
      );
    case "curva":
      return curvaAbc(pins);
  }
}
