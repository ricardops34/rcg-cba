import type { TituloReceberStatus } from "@plataforma/contracts";
import { Badge } from "@/components/ui/badge";

const LABEL: Record<TituloReceberStatus, string> = {
  aberto: "Aberto",
  vencido: "Vencido",
  baixado: "Baixado",
};

const VARIANT: Record<TituloReceberStatus, "secondary" | "destructive" | "success"> = {
  aberto: "secondary",
  vencido: "destructive",
  baixado: "success",
};

export function TituloStatusBadge({ status }: { status: TituloReceberStatus }) {
  return <Badge variant={VARIANT[status]}>{LABEL[status]}</Badge>;
}
