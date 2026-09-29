import type {
  SituacaoIntegracaoOrcamento,
  StatusOrcamento,
} from "@plataforma/contracts";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Hourglass,
  Lock,
  MinusCircle,
  Receipt,
  XCircle,
  type LucideIcon,
} from "lucide-react";

export const STATUS_ORCAMENTO: { value: StatusOrcamento; label: string }[] = [
  { value: "rascunho", label: "Rascunho" },
  { value: "enviado", label: "Enviado" },
  { value: "aprovado", label: "Aprovado" },
  { value: "recusado", label: "Recusado" },
  { value: "expirado", label: "Expirado" },
];

export const STATUS_ORCAMENTO_LABEL = Object.fromEntries(
  STATUS_ORCAMENTO.map((s) => [s.value, s.label]),
) as Record<StatusOrcamento, string>;

export const STATUS_ORCAMENTO_VARIANT: Record<StatusOrcamento, "default" | "outline" | "destructive"> = {
  rascunho: "outline",
  enviado: "outline",
  aprovado: "default",
  recusado: "destructive",
  expirado: "outline",
};

/** Cor usada nos chips da Agenda — mesmo critério de TIPO_COR (atividade-tipo.ts). */
export const STATUS_ORCAMENTO_COR: Record<StatusOrcamento, string> = {
  rascunho: "bg-slate-400",
  enviado: "bg-blue-500",
  aprovado: "bg-emerald-500",
  recusado: "bg-red-500",
  expirado: "bg-amber-500",
};

const NEUTRO = "border-border/70 bg-muted/40 text-muted-foreground";
const ATENCAO = "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400";
const ERRO = "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400";
const OK = "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
const INFO = "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400";

/**
 * Ícone e cores de cada situação do orçamento perante o ERP (ver
 * situacaoIntegracaoOrcamento em contracts): `cor` no ícone da listagem,
 * `classe` no quadro da aba "Aprovação e integração".
 */
export const SITUACAO_INTEGRACAO_VISUAL: Record<
  SituacaoIntegracaoOrcamento,
  { icone: LucideIcon; cor: string; classe: string }
> = {
  nao_enviado: { icone: MinusCircle, cor: "text-muted-foreground", classe: NEUTRO },
  aguardando: { icone: Clock, cor: "text-amber-500", classe: ATENCAO },
  erro_integracao: { icone: AlertTriangle, cor: "text-red-600", classe: ERRO },
  pendente: { icone: Hourglass, cor: "text-blue-500", classe: INFO },
  liberado: { icone: CheckCircle2, cor: "text-emerald-600", classe: OK },
  bloqueado_credito: { icone: Lock, cor: "text-red-600", classe: ERRO },
  bloqueado_estoque: { icone: Lock, cor: "text-red-600", classe: ERRO },
  bloqueado_desconto: { icone: Lock, cor: "text-red-600", classe: ERRO },
  faturado_parcial: { icone: Receipt, cor: "text-blue-500", classe: INFO },
  faturado: { icone: Receipt, cor: "text-emerald-600", classe: OK },
  cancelado: { icone: XCircle, cor: "text-red-600", classe: ERRO },
};
