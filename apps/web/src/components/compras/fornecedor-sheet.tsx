"use client";

import { useQuery } from "@tanstack/react-query";
import type { Fornecedor } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ResizableSheetContent } from "@/components/ui/resizable-sheet-content";

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value || "—"}</p>
    </div>
  );
}

/**
 * Detalhe do fornecedor numa cortina lateral, e não numa rota própria: é um
 * espelho de campos cadastrais, sem nada para editar nem sub-tela — abrir e
 * fechar sem perder a busca e o scroll da lista é o que a consulta pede.
 */
export function FornecedorSheet({
  id,
  onOpenChange,
}: {
  id: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: f, isLoading, isError } = useQuery({
    queryKey: ["fornecedores", id],
    queryFn: () => apiFetch<Fornecedor>(`/fornecedores/${id}`),
    enabled: !!id,
  });

  return (
    <Sheet open={!!id} onOpenChange={onOpenChange}>
      <ResizableSheetContent defaultWidth={640}>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {f ? (
              <>
                {f.nomeFantasia || f.razaoSocial}
                {!f.ativo && <Badge variant="destructive">Inativo</Badge>}
              </>
            ) : (
              "Fornecedor"
            )}
          </SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-4">
          {isLoading && <Skeleton className="h-64 w-full rounded-xl" />}
          {isError && <p className="text-sm text-muted-foreground">Fornecedor não encontrado.</p>}
          {f && (
            <div className="space-y-4">
              <Card>
                <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Info label="Código do ERP" value={f.codigoErp} />
                  <Info label="Tipo" value={f.tipoPessoa === "fisica" ? "Pessoa física" : "Pessoa jurídica"} />
                  <Info label="Razão social" value={f.razaoSocial} />
                  <Info label="Nome fantasia" value={f.nomeFantasia} />
                  <Info label="CNPJ/CPF" value={f.cnpjCpf} />
                  <Info label="Inscrição estadual" value={f.inscricaoEstadual} />
                  <Info label="Inscrição municipal" value={f.inscricaoMunicipal} />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Info label="Contato" value={f.contato} />
                  <Info label="E-mail" value={f.email} />
                  <Info label="Telefone" value={f.telefone} />
                  <Info label="Celular" value={f.celular} />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Info label="Endereço" value={f.endereco} />
                  <Info label="Complemento" value={f.complemento} />
                  <Info label="Bairro" value={f.bairro} />
                  <Info label="CEP" value={f.cep} />
                  <Info label="Município" value={f.municipio} />
                  <Info label="UF" value={f.uf} />
                </CardContent>
              </Card>

              {f.observacao && (
                <Card>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">Observação</p>
                    <p className="whitespace-pre-wrap text-sm">{f.observacao}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </ResizableSheetContent>
    </Sheet>
  );
}
