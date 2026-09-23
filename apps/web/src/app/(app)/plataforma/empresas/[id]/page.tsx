"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { Empresa } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { EmpresaForm } from "@/components/crud/empresa-form";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlataformaGuard } from "../../plataforma-guard";
import { AdministradoresSection } from "./administradores-section";
import { AssinaturaSection } from "./assinatura-section";
import { EstruturaEmpresaSection } from "./estrutura-empresa-section";
import { Building2, CreditCard, Layers, Users } from "lucide-react";

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
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold font-heading">{empresa.nomeFantasia}</h1>
              <p className="text-sm text-muted-foreground">{empresa.razaoSocial} — CNPJ/CPF: {empresa.cnpj}</p>
            </div>
          </div>

          <Tabs defaultValue="cadastro" className="w-full space-y-6">
            <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full max-w-3xl">
              <TabsTrigger value="cadastro" className="gap-2">
                <Building2 className="w-4 h-4" />
                Ficha & Cadastro
              </TabsTrigger>
              <TabsTrigger value="assinatura" className="gap-2">
                <CreditCard className="w-4 h-4" />
                Plano & Assinatura
              </TabsTrigger>
              <TabsTrigger value="funcionalidades" className="gap-2">
                <Layers className="w-4 h-4" />
                Módulos & Rotinas
              </TabsTrigger>
              <TabsTrigger value="usuarios" className="gap-2">
                <Users className="w-4 h-4" />
                Administradores
              </TabsTrigger>
            </TabsList>

            <TabsContent value="cadastro">
              <EmpresaForm empresa={empresa} listRoute="/plataforma/empresas" />
            </TabsContent>

            <TabsContent value="assinatura">
              <AssinaturaSection empresaId={empresa.id} />
            </TabsContent>

            <TabsContent value="funcionalidades">
              <EstruturaEmpresaSection empresaId={empresa.id} />
            </TabsContent>

            <TabsContent value="usuarios">
              <AdministradoresSection empresaId={empresa.id} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </PlataformaGuard>
  );
}
