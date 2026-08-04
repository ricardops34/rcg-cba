"use client";

import { useSearchParams } from "next/navigation";
import { AtividadeForm } from "@/components/crud/atividade-form";

export default function NovaAtividadePage() {
  const searchParams = useSearchParams();
  const data = searchParams.get("data");
  const dataVencimentoInicial = data ? new Date(`${data}T00:00:00`) : undefined;

  return <AtividadeForm dataVencimentoInicial={dataVencimentoInicial} />;
}
