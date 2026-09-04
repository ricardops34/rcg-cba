"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { Empresa } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { EmpresaForm } from "@/components/crud/empresa-form";
import { Skeleton } from "@/components/ui/skeleton";
import { PlataformaGuard } from "../../plataforma-guard";
import { AdministradoresSection } from "./administradores-section";

/**
 * Cadastro completo de **qualquer** empresa, pela administração do SaaS.
 *
 * É o mesmo `EmpresaForm` de Administração — mesmos campos, mesmo
 * `PATCH /empresas/:id`, mesmas validações. Só muda a lista para onde o botão
 * voltar leva, e a seção de assinatura, que o formulário mostra a quem
 * administra a plataforma.
 *
 * O que autoriza alcançar empresa que não é a da sessão está no servidor
 * (`garantirEscopo`, em EmpresasService): administrador de tenant só passa pela
 * própria; quem administra a plataforma passa por todas.
 */
export default function EditarEmpresaPlataformaPage() {
  const { id } = useParams<{ id: string }>();

  const {
    data: empresa,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["empresas", id],
    queryFn: () => apiFetch<Empresa>(`/empresas/${id}`),
  });

  return (
    <PlataformaGuard>
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      ) : isError || !empresa ? (
        <p className="text-sm text-muted-foreground">Empresa não encontrada.</p>
      ) : (
        <div className="space-y-4">
          <EmpresaForm empresa={empresa} listRoute="/plataforma/empresas" />
          <AdministradoresSection empresaId={empresa.id} />
        </div>
      )}
    </PlataformaGuard>
  );
}
