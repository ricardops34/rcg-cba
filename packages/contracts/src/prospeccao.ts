import { z } from "zod";

/**
 * Prospecção de leads pela base da Receita (docs/planos/2026-11-20-prospeccao-leads-receita.md).
 *
 * Supervisor e gerente **coletam** empresas por UF, municípios e CNAEs; a
 * coleta fica só com as **ativas que ainda não são clientes nem leads** e as
 * importa como leads `origem = receita`, sem vendedor, para a distribuição.
 *
 * A fonte (MinhaReceita pública, ou a base própria quando existir) só aceita
 * **um município e um CNAE por busca** — a pública recusa a busca com vários
 * CNAEs ("busca muito custosa"). Por isso a coleta percorre cada combinação, e
 * o número de combinações tem teto.
 */

/** Teto de combinações município × CNAE numa coleta. */
export const PROSPECCAO_MAX_COMBINACOES = 60;
/** Teto de empresas lidas numa coleta (todas as situações). */
export const PROSPECCAO_MAX_EMPRESAS = 5000;

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
      .max(PROSPECCAO_MAX_COMBINACOES),
    /** Códigos de subclasse CNAE (7 dígitos). */
    cnaes: z
      .array(z.string().regex(/^\d{7}$/, "CNAE com 7 dígitos"))
      .min(1, "Escolha ao menos um CNAE")
      .max(PROSPECCAO_MAX_COMBINACOES),
  })
  .refine((v) => v.municipios.length * v.cnaes.length <= PROSPECCAO_MAX_COMBINACOES, {
    message: `No máximo ${PROSPECCAO_MAX_COMBINACOES} combinações de município × CNAE por coleta`,
    path: ["cnaes"],
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
