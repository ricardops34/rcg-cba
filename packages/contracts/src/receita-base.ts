import { z } from "zod";

/**
 * Administração > Base da Receita (docs/planos/2026-11-20-prospeccao-leads-receita.md).
 *
 * A base própria é o minha-receita com os patches da plataforma
 * (docker/minha-receita): a carga grava só os estados e situações escolhidos,
 * e um serviço de controle interno informa o estado e dispara a carga. Tudo o
 * que a prospecção usa é parâmetro da empresa (RECEITA_* e PROSPECCAO_*),
 * alterado nesta tela, como nas outras rotinas da Administração.
 *
 * A base é uma só para a instalação: cada empresa marca os estados e situações
 * que quer, e a carga grava a **união** — uma empresa nunca tira da base o que
 * a outra usa.
 */

export const RECEITA_SITUACOES = [
  { codigo: "02", rotulo: "Ativa" },
  { codigo: "03", rotulo: "Suspensa" },
  { codigo: "04", rotulo: "Inapta" },
  { codigo: "08", rotulo: "Baixada" },
  { codigo: "01", rotulo: "Nula" },
] as const;
export type ReceitaSituacao = (typeof RECEITA_SITUACOES)[number]["codigo"];
const situacaoSchema = z.enum(["01", "02", "03", "04", "08"]);

export const UFS_BRASIL = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
  "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;

export const prospeccaoFonteSchema = z.enum(["publica", "propria"]);
export type ProspeccaoFonte = z.infer<typeof prospeccaoFonteSchema>;
export const PROSPECCAO_FONTE_LABEL: Record<ProspeccaoFonte, string> = {
  publica: "MinhaReceita pública",
  propria: "Base própria",
};

const urlOuVazio = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || /^https?:\/\/\S+$/.test(v), "URL começa com http:// ou https://");

/** O que a tela grava. O token só vai quando é para trocar. */
export const receitaBaseConfigSalvarSchema = z.object({
  /** Estados que esta empresa quer na base própria (vazio = nenhum). */
  ufs: z.array(z.enum(UFS_BRASIL)).max(27),
  /** Situações cadastrais mantidas na carga (ao menos uma). */
  situacoes: z.array(situacaoSchema).min(1, "Escolha ao menos uma situação"),
  /** URL da API de consulta da base própria (vazio = a do ambiente). */
  propriaUrl: urlOuVazio,
  /** URL do serviço de controle (vazio = a do ambiente). */
  controleUrl: urlOuVazio,
  /** Token do controle; vazio/ausente mantém o atual. Gravado cifrado. */
  controleToken: z.string().trim().max(200).nullable().optional(),
  /** De onde a coleta de leads busca as empresas. */
  fonte: prospeccaoFonteSchema,
  /** Fonte pública: teto de buscas (município × CNAE) por coleta. */
  maxCombinacoes: z.number().int().min(1).max(2000),
  /** Teto de empresas lidas por coleta (todas as situações). */
  maxEmpresas: z.number().int().min(100).max(500000),
  /** Fonte pública: pausa entre buscas, em milissegundos. */
  pausaMs: z.number().int().min(0).max(60000),
  /**
   * Download da carga: o servidor da Receita oscila (recusou conexão várias
   * vezes em 2026-11-21). Conexões simultâneas, tentativas por parte do
   * arquivo e segundos entre elas.
   */
  downloadConexoes: z.number().int().min(1).max(32),
  downloadRetentativas: z.number().int().min(1).max(1000),
  downloadEsperaS: z.number().int().min(0).max(600),
});
export type ReceitaBaseConfigSalvar = z.infer<typeof receitaBaseConfigSalvarSchema>;

export interface ReceitaBaseConfig extends Omit<ReceitaBaseConfigSalvar, "controleToken"> {
  /** Há token gravado (o valor nunca volta para a tela). */
  temControleToken: boolean;
  /** Valores do ambiente usados quando o parâmetro está vazio. */
  padroes: { propriaUrl: string | null; controleUrl: string | null; temControleToken: boolean };
}

export type ReceitaCargaEtapa =
  | ""
  | "download"
  | "verificacao"
  | "transform"
  | "limpeza"
  | "concluida"
  | "erro";

export const RECEITA_CARGA_ETAPA_LABEL: Record<ReceitaCargaEtapa, string> = {
  "": "Nunca carregada",
  download: "Baixando da Receita",
  verificacao: "Conferindo os arquivos baixados",
  transform: "Gravando na base (com o filtro)",
  limpeza: "Apagando os arquivos baixados",
  concluida: "Concluída",
  erro: "Interrompida",
};

export interface ReceitaBaseEstado {
  /** Controle respondeu. Falso = serviço fora do ar ou mal configurado. */
  disponivel: boolean;
  erro: string | null;
  carga: {
    rodando: boolean;
    etapa: ReceitaCargaEtapa;
    mes: string;
    ufs: string[] | null;
    situacoes: string[] | null;
    iniciadaEm: string | null;
    concluidaEm: string | null;
    erro: string;
    log: string[] | null;
  } | null;
  base: { mes: string; empresas: number; tamanhoBytes: number } | null;
  /** Mês mais recente publicado pela Receita (AAAA-MM). */
  mesMaisRecente: string | null;
  /** O que a próxima carga gravaria: a união das empresas. */
  proximaCarga: {
    ufs: string[];
    situacoes: string[];
    empresas: { nome: string; ufs: string[] }[];
  };
  /** Tabelas de referência da plataforma com os códigos da Receita. */
  referencias: ReceitaReferenciasResumo;
}

/**
 * Tabelas de referência compartilhadas com a Receita
 * (docs/planos/2026-11-21-tabelas-referencia-compartilhadas.md): a plataforma
 * é a fonte única; município guarda o código da Receita, natureza jurídica e
 * CNAE usam o código oficial, e os CEPs da base própria entram na tabela de CEPs.
 */
export interface ReceitaReferenciasResumo {
  municipios: number;
  municipiosComCodigoReceita: number;
  naturezas: number;
  cnaes: number;
  /** CEPs gravados a partir da base própria (origem "receita"). */
  cepsReceita: number;
}

/** Resultado de "Atualizar referências". */
export interface ReceitaReferenciasResultado {
  mes: string;
  /** Municípios que receberam ou mudaram o código da Receita. */
  municipiosAtualizados: number;
  /** Casados pela tabela do Tesouro (código da Receita ↔ IBGE). */
  municipiosPeloTesouro: number;
  /** Casados pelo nome + UF, para o que o Tesouro ainda não traz. */
  municipiosPeloNome: { nome: string; uf: string | null; codigoReceita: string }[];
  /** Municípios da plataforma que ficaram sem código da Receita. */
  municipiosSemCodigo: { nome: string; uf: string | null }[];
  naturezasNovas: number;
  naturezasAtualizadas: number;
  /** CNAEs que a Receita usa e a tabela (do IBGE) não tinha. */
  cnaesNovos: { codigo: string; descricao: string }[];
}

/** Resultado de "Atualizar CEPs". */
export interface ReceitaCepsResultado {
  /** CEPs distintos na base própria. */
  lidos: number;
  novos: number;
  /** Já estavam na tabela (ViaCEP ou carga anterior): não são alterados. */
  jaExistiam: number;
  /** Sem município da plataforma para o código da Receita. */
  semMunicipio: number;
}

export const receitaBaseCargaSchema = z.object({
  /** AAAA-MM; vazio = o mais recente publicado. */
  mes: z
    .string()
    .trim()
    .regex(/^(\d{4}-\d{2})?$/, "Mês no formato AAAA-MM")
    .optional(),
});
export type ReceitaBaseCarga = z.infer<typeof receitaBaseCargaSchema>;

/** Limites e fonte da coleta, para a tela de Prospecção. */
export interface ProspeccaoLimites {
  fonte: ProspeccaoFonte;
  maxCombinacoes: number;
  maxEmpresas: number;
}
