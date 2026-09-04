"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { Empresa } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { EmpresaForm } from "@/components/crud/empresa-form";
import { EmpresaWhatsappSection } from "@/components/crud/empresa-whatsapp-section";
import { useAuthStore } from "@/stores/auth-store";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditarEmpresaPage() {
  const { id } = useParams<{ id: string }>();
  const empresaAtivaId = useAuthStore((s) => s.user?.empresaAtivaId);

  const { data: empresa, isLoading, isError } = useQuery({
    queryKey: ["empresas", id],
    queryFn: () => apiFetch<Empresa>(`/empresas/${id}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !empresa) {
    return <p className="text-sm text-muted-foreground">Empresa não encontrada.</p>;
  }

  // O pareamento e da empresa **da sessao**: parear o WhatsApp de outra
  // empresa nao faz sentido (o celular esta com ela), e a API so alcanca a
  // sessao do proprio tenant de qualquer forma.
  const daSessao = empresa.id === empresaAtivaId;

  return (
    <div className="space-y-4">
      <EmpresaForm empresa={empresa} />
      {daSessao && <EmpresaWhatsappSection empresaId={empresa.id} />}
    </div>
  );
}
