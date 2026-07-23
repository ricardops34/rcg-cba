"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { type Empresa, type Perfil } from "@plataforma/contracts";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { X } from "lucide-react";

interface UsuarioEmpresaLink {
  id: string;
  empresaId: string;
  perfilId: string;
  ativo: boolean;
  superiorId: string | null;
  codigoErp: string | null;
  nomeReduzido: string | null;
  telefone: string | null;
  celular: string | null;
  dataNascimento: string | null;
  empresa: Empresa;
  perfil: Perfil;
}

interface UsuarioDetail {
  id: string;
  usuarioEmpresas: UsuarioEmpresaLink[];
}

interface UsuarioOption {
  id: string;
  vinculoId: string | null;
  nome: string;
  nomeReduzido: string | null;
}

interface VinculoForm {
  perfilId: string;
  superiorId: string | null;
  nomeReduzido: string;
  codigoErp: string;
  telefone: string;
  celular: string;
}

function formFromLink(link: UsuarioEmpresaLink): VinculoForm {
  return {
    perfilId: link.perfilId,
    superiorId: link.superiorId,
    nomeReduzido: link.nomeReduzido ?? "",
    codigoErp: link.codigoErp ?? "",
    telefone: link.telefone ?? "",
    celular: link.celular ?? "",
  };
}

/**
 * Sistema é multiempresa: todo usuário precisa de um vínculo Usuário×Empresa
 * (com perfil RBAC + hierarquia/dados de vendedor) pra poder logar naquela
 * empresa — é aqui que esse vínculo é editado por completo (não tem mais um
 * cadastro de "colaborador" separado). Só dá pra editar o vínculo da empresa
 * ATIVA: a lista de perfis/usuários candidatos a superior é sempre isolada
 * (RLS) pela empresa em que você está logado; vínculos de outras empresas
 * ficam só como visualização.
 */
export function UsuarioEmpresasSection({ usuarioId }: { usuarioId: string }) {
  const qc = useQueryClient();
  const empresaAtivaId = useAuthStore((s) => s.user?.empresaAtivaId);
  const [novoPerfilId, setNovoPerfilId] = useState<string>("");
  const [form, setForm] = useState<VinculoForm | null>(null);

  const detailQuery = useQuery({
    queryKey: ["usuarios", usuarioId],
    queryFn: () => apiFetch<UsuarioDetail>(`/usuarios/${usuarioId}`),
  });

  const perfisQuery = useQuery({
    queryKey: ["perfis", "select"],
    queryFn: () => apiFetch<{ data: Perfil[] }>("/perfis", { query: { pageSize: 100 } }),
  });

  const superioresQuery = useQuery({
    queryKey: ["usuarios", "select", empresaAtivaId],
    queryFn: () => apiFetch<{ data: UsuarioOption[] }>("/usuarios", { query: { pageSize: 200 } }),
  });

  const links = detailQuery.data?.usuarioEmpresas ?? [];
  const linkAtivo = links.find((l) => l.empresaId === empresaAtivaId) ?? null;

  // Sincroniza o form local com o vínculo da empresa ativa sempre que os
  // dados chegam ou o usuário/empresa ativa muda — edição é sempre a partir
  // do estado salvo, sem autosave por campo (diferente do select de perfil).
  useEffect(() => {
    setForm(linkAtivo ? formFromLink(linkAtivo) : null);
  }, [linkAtivo?.id, linkAtivo?.superiorId, linkAtivo?.nomeReduzido, linkAtivo?.codigoErp, linkAtivo?.telefone, linkAtivo?.celular]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["usuarios", usuarioId] });

  const vincular = useMutation({
    mutationFn: (body: Partial<VinculoForm> & { perfilId: string }) =>
      apiFetch(`/usuarios/${usuarioId}/empresas/${empresaAtivaId}`, {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      invalidate();
      setNovoPerfilId("");
      toast.success("Vínculo salvo");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erro ao salvar vínculo"),
  });

  const desvincular = useMutation({
    mutationFn: (empresaId: string) =>
      apiFetch(`/usuarios/${usuarioId}/empresas/${empresaId}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      toast.success("Vínculo removido");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erro ao remover vínculo"),
  });

  const jaVinculadoNaAtiva = !!linkAtivo;
  const opcoesSuperior = (superioresQuery.data?.data ?? []).filter(
    (u) => u.id !== usuarioId && u.vinculoId,
  );

  return (
    <div className="space-y-2">
      <FieldLabel>Empresas vinculadas</FieldLabel>
      <FieldDescription>
        Sistema multiempresa: o usuário só consegue logar nas empresas listadas aqui, cada uma com seu
        próprio perfil.
      </FieldDescription>

      {detailQuery.isLoading && <Skeleton className="h-16 w-full rounded-xl" />}

      {!detailQuery.isLoading && (
        <div className="space-y-1.5">
          {links.map((link) => {
            const ativa = link.empresaId === empresaAtivaId;
            return (
              <div key={link.empresaId} className="space-y-2 rounded-xl border border-border/70 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{link.empresa.nomeFantasia}</p>
                    {!ativa && <p className="text-xs text-muted-foreground">{link.perfil.nome}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {ativa && <Badge variant="outline">Empresa ativa</Badge>}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      disabled={desvincular.isPending}
                      onClick={() => {
                        if (confirm(`Remover o vínculo com "${link.empresa.nomeFantasia}"?`)) {
                          desvincular.mutate(link.empresaId);
                        }
                      }}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                </div>

                {ativa && form && (
                  <FieldGroup className="gap-2">
                    <Field>
                      <FieldLabel className="text-xs">Perfil</FieldLabel>
                      <Select
                        value={form.perfilId}
                        onValueChange={(v) => setForm({ ...form, perfilId: v })}
                      >
                        <SelectTrigger className="h-8 w-full text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {perfisQuery.data?.data.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field>
                      <FieldLabel className="text-xs">Superior direto (opcional)</FieldLabel>
                      <Select
                        value={form.superiorId ?? "none"}
                        onValueChange={(v) =>
                          setForm({ ...form, superiorId: v === "none" ? null : v })
                        }
                      >
                        <SelectTrigger className="h-8 w-full text-xs">
                          <SelectValue placeholder="Sem superior" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem superior</SelectItem>
                          {opcoesSuperior.map((u) => (
                            <SelectItem key={u.vinculoId} value={u.vinculoId!}>
                              {u.nomeReduzido || u.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>

                    <div className="grid grid-cols-2 gap-2">
                      <Field>
                        <FieldLabel className="text-xs">Nome reduzido</FieldLabel>
                        <Input
                          className="h-8 text-xs"
                          placeholder="Ex.: CARLOS"
                          value={form.nomeReduzido}
                          onChange={(e) => setForm({ ...form, nomeReduzido: e.target.value })}
                        />
                      </Field>
                      <Field>
                        <FieldLabel className="text-xs">Código ERP</FieldLabel>
                        <Input
                          className="h-8 text-xs"
                          placeholder="Ex.: 000315"
                          value={form.codigoErp}
                          onChange={(e) => setForm({ ...form, codigoErp: e.target.value })}
                        />
                      </Field>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Field>
                        <FieldLabel className="text-xs">Telefone</FieldLabel>
                        <Input
                          className="h-8 text-xs"
                          value={form.telefone}
                          onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                        />
                      </Field>
                      <Field>
                        <FieldLabel className="text-xs">Celular</FieldLabel>
                        <Input
                          className="h-8 text-xs"
                          value={form.celular}
                          onChange={(e) => setForm({ ...form, celular: e.target.value })}
                        />
                      </Field>
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={vincular.isPending}
                      onClick={() => vincular.mutate(form)}
                    >
                      Salvar vínculo
                    </Button>
                  </FieldGroup>
                )}
              </div>
            );
          })}

          {links.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma empresa vinculada ainda.</p>
          )}
        </div>
      )}

      {!jaVinculadoNaAtiva && !detailQuery.isLoading && (
        <div className="flex flex-col gap-2 pt-1">
          <Select value={novoPerfilId} onValueChange={setNovoPerfilId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Perfil na empresa ativa..." />
            </SelectTrigger>
            <SelectContent>
              {perfisQuery.data?.data.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            Superior, nome reduzido e demais dados dá pra completar depois de vincular.
          </FieldDescription>
          <Button
            type="button"
            variant="outline"
            disabled={!novoPerfilId || vincular.isPending}
            onClick={() => vincular.mutate({ perfilId: novoPerfilId })}
          >
            Vincular
          </Button>
        </div>
      )}
    </div>
  );
}
