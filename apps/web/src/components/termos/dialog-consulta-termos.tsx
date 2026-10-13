"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, FileText, ShieldCheck } from "lucide-react";
import {
  TERMOS_USO_PLATAFORMA_PADRAO,
  gerarSugestaoTermosEmpresa,
  type Empresa,
} from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VisualizadorTermos } from "./visualizador-termos";

interface DialogConsultaTermosProps {
  rotulo?: string;
  variant?: "outline" | "default" | "secondary" | "ghost";
  className?: string;
}

export function DialogConsultaTermos({
  rotulo = "Consultar termos de uso",
  variant = "outline",
  className,
}: DialogConsultaTermosProps) {
  const [aberto, setAberto] = useState(false);

  const { data: empresa } = useQuery({
    queryKey: ["empresas", "ativa"],
    queryFn: () => apiFetch<Empresa>("/empresas/ativa"),
    enabled: aberto,
  });

  const nomeEmpresa = empresa?.nomeFantasia || empresa?.razaoSocial || "Empresa";
  const termosEmpresa =
    empresa?.termosUso?.trim() ||
    gerarSugestaoTermosEmpresa({
      nomeFantasia: empresa?.nomeFantasia,
      razaoSocial: empresa?.razaoSocial,
      cnpj: empresa?.cnpj,
    });

  const temTermosCustomizados = Boolean(empresa?.termosUso?.trim());

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant={variant} className={className}>
          <FileText className="size-4" />
          {rotulo}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-primary" />
            Termos de Uso e Normas
          </DialogTitle>
          <DialogDescription>
            Consulte os termos oficiais da plataforma e as normas comerciais da sua empresa.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="empresa" className="mt-2 w-full">
          <TabsList className="grid grid-cols-2 mb-4">
            <TabsTrigger value="empresa" className="gap-2 text-xs sm:text-sm">
              <Building2 className="size-4" />
              <span>{nomeEmpresa}</span>
            </TabsTrigger>
            <TabsTrigger value="plataforma" className="gap-2 text-xs sm:text-sm">
              <ShieldCheck className="size-4" />
              <span>Plataforma (Fixo)</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="empresa" className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Regras de negócio de:</span>
                <span className="font-semibold text-foreground">{nomeEmpresa}</span>
              </div>
              <Badge variant={temTermosCustomizados ? "outline" : "secondary"} className="text-[10px]">
                {temTermosCustomizados ? "Normas Personalizadas" : "Diretrizes Padrão"}
              </Badge>
            </div>

            <div className="rounded-lg border bg-card p-5 shadow-xs">
              <VisualizadorTermos conteudo={termosEmpresa} />
            </div>
          </TabsContent>

          <TabsContent value="plataforma" className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2 text-xs">
              <span className="text-muted-foreground">
                Documento imutável comum a todos os usuários da infraestrutura.
              </span>
              <Badge variant="secondary" className="text-[10px]">
                Global · Fixo
              </Badge>
            </div>

            <div className="rounded-lg border bg-card p-5 shadow-xs">
              <VisualizadorTermos conteudo={TERMOS_USO_PLATAFORMA_PADRAO} />
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

