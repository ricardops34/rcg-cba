import { z } from "zod";

/**
 * Prospecção de leads pela base da Receita (docs/planos/2026-11-20-prospeccao-leads-receita.md).
 *
 * Supervisor e gerente **coletam** empresas por UF, municípios e CNAEs; a
 * coleta fica só com as **ativas que ainda não são clientes nem leads** e as
 * importa como leads `origem = receita`, sem vendedor, para a distribuição.
 *
 * A fonte é parâmetro (Administração > Base da Receita):
 * - **pública**: só aceita um município e um CNAE por busca (com vários ela
 *   responde "busca muito custosa"), então a coleta percorre cada combinação,
 *   com pausa entre buscas e teto de combinações;
 * - **própria**: sem trava (uso exclusivo), uma busca com todos os municípios
 *   e CNAEs, paginada.
 */

/**
 * Padrões dos limites da coleta. Os valores em uso são parâmetros da empresa
 * (PROSPECCAO_*), alterados em Administração > Base da Receita.
 */
export const PROSPECCAO_PADRAO_MAX_COMBINACOES = 60;
export const PROSPECCAO_PADRAO_MAX_EMPRESAS = 5000;
export const PROSPECCAO_PADRAO_PAUSA_MS = 1500;
/** Teto absoluto de itens escolhidos por coleta (a validação fina é do servidor). */
const MAX_ITENS = 2000;

export const prospeccaoColetaCriarSchema = z
  .object({
    uf: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, "UF com 2 letras"),
    /** Códigos IBGE dos municípios (7 dígitos). */
    municipios: z
      .array(z.string().regex(/^\d{7}$/, "Código IBGE com 7 dígitos"))
      .min(1, "Escolha ao menos um município")
      .max(MAX_ITENS),
    /** Códigos de subclasse CNAE (7 dígitos). */
    cnaes: z
      .array(z.string().regex(/^\d{7}$/, "CNAE com 7 dígitos"))
      .min(1, "Escolha ao menos um CNAE")
      .max(MAX_ITENS),
  });
export type ProspeccaoColetaCriar = z.infer<typeof prospeccaoColetaCriarSchema>;

export const leadColetaSituacaoSchema = z.enum(["rodando", "concluida", "erro"]);
export type LeadColetaSituacao = z.infer<typeof leadColetaSituacaoSchema>;

export const LEAD_COLETA_SITUACAO_LABEL: Record<LeadColetaSituacao, string> = {
  rodando: "Coletando",
  concluida: "Concluída",
  erro: "Interrompida",
};

export interface ProspeccaoColeta {
  id: string;
  usuarioNome: string | null;
  filtros: {
    uf: string;
    municipios: { codigo: string; nome: string }[];
    cnaes: { codigo: string; descricao: string | null }[];
  };
  situacao: LeadColetaSituacao;
  /** Empresas lidas na fonte, em todas as situações cadastrais. */
  encontrados: number;
  jaClientes: number;
  jaLeads: number;
  /** Baixadas, inaptas, suspensas e nulas — ficam de fora. */
  inativos: number;
  importados: number;
  /** Combinações município × CNAE já percorridas, de quantas. */
  progresso: { feitas: number; total: number } | null;
  erro: string | null;
  iniciadaEm: string;
  concluidaEm: string | null;
}

export interface ProspeccaoMunicipio {
  codigoIbge: string;
  nome: string;
}

export interface ProspeccaoCnae {
  codigo: string;
  descricao: string;
}
