"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";

interface Vinculo {
  id: string;
  empresaId: string;
  perfilId: string;
  superiorId: string | null;
  codigoErp: string | null;
  nomeReduzido: string | null;
  telefone: string | null;
  celular: string | null;
  dataNascimento: string | null;
}

interface UsuarioOption {
  id: string;
  vinculoId: string | null;
  nome: string;
  nomeReduzido: string | null;
}

interface Dados {
  superiorId: string | null;
  nomeReduzido: string;
  codigoErp: string;
  telefone: string;
  celular: string;
  /** AAAA-MM-DD, ou vazio. */
  dataNascimento: string;
}

const dadosDo = (v: Vinculo): Dados => ({
  superiorId: v.superiorId,
  nomeReduzido: v.nomeReduzido ?? "",
  codigoErp: v.codigoErp ?? "",
  telefone: v.telefone ?? "",
  celular: v.celular ?? "",
  dataNascimento: v.dataNascimento?.slice(0, 10) ?? "",
});

/**
 * Superior, nome reduzido, código ERP, telefones e nascimento do usuário. O usuário é um
 * só no grupo econômico e esses dados também (decisão de 30/09/2026): grava-se
 * pelo vínculo da empresa ativa, e a API replica nas demais empresas do grupo
 * a que ele tem acesso (`UsuariosService.sincronizarDadosNoGrupo`).
 */
export function UsuarioDadosGrupo({ usuarioId }: { usuarioId: string }) {
  const qc = useQueryClient();
  const empresaAtivaId = useAuthStore((s) => s.user?.empresaAtivaId);
  const [edicao, setEdicao] = useState<{ base: string; valor: Dados } | null>(null);

  const detalhe = useQuery({
    queryKey: ["usuarios", usuarioId],
    queryFn: () => apiFetch<{ usuarioEmpresas: Vinculo[] }>(`/usuarios/${usuarioId}`),
  });
  // Candidatos a superior: usuários da empresa ativa (a lista é isolada por RLS).
  const superiores = useQuery({
    queryKey: ["usuarios", "select", empresaAtivaId],
    queryFn: () => apiFetch<{ data: UsuarioOption[] }>("/usuarios", { query: { pageSize: 100 } }),
  });

  const vinculo = detalhe.data?.usuarioEmpresas.find((v) => v.empresaId === empresaAtivaId);
  const salvo = vinculo ? dadosDo(vinculo) : null;
  const base = JSON.stringify(salvo);
  const dados = edicao?.base === base ? edicao.valor : salvo;
  const editar = (parcial: Partial<Dados>) => dados && setEdicao({ base, valor: { ...dados, ...parcial } });

  const salvar = useMutation({
    mutationFn: () =>
      apiFetch(`/usuarios/${usuarioId}/empresas/${empresaAtivaId}`, {
        method: "POST",
        body: { perfilId: vinculo!.perfilId, ...dados!, dataNascimento: dados!.dataNascimento || null },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["usuarios", usuarioId] });
      toast.success("Dados salvos em todas as empresas do grupo");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erro ao salvar os dados"),
  });

  if (detalhe.isLoading) return <Skeleton className="h-40 w-full rounded-xl" />;
  if (!vinculo || !dados) {
    return (
      <p className="text-sm text-muted-foreground">
        O usuário não tem acesso à empresa em que você está. Marque-a na aba “Empresas e perfil” para editar
        estes dados.
      </p>
    );
  }

  const opcoesSuperior = (superiores.data?.data ?? []).filter((u) => u.id !== usuarioId && u.vinculoId);

  return (
    <FieldGroup>
      <FieldDescription>Os mesmos em todas as empresas do grupo a que o usuário tem acesso.</FieldDescription>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="nascimento">Data de nascimento</FieldLabel>
          <Input id="nascimento" type="date" value={dados.dataNascimento} onChange={(e) => editar({ dataNascimento: e.target.value })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="celular">WhatsApp (com DDD)</FieldLabel>
          <Input id="celular" value={dados.celular} onChange={(e) => editar({ celular: e.target.value })} />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="superior">Superior direto (opcional)</FieldLabel>
        <Select value={dados.superiorId ?? "none"} onValueChange={(v) => editar({ superiorId: v === "none" ? null : v })}>
          <SelectTrigger id="superior" className="w-full">
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="nome-reduzido">Nome reduzido</FieldLabel>
          <Input id="nome-reduzido" placeholder="Ex.: CARLOS" value={dados.nomeReduzido} onChange={(e) => editar({ nomeReduzido: e.target.value })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="codigo-erp">Código ERP</FieldLabel>
          <Input id="codigo-erp" placeholder="Ex.: 000315" value={dados.codigoErp} onChange={(e) => editar({ codigoErp: e.target.value })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="telefone">Telefone</FieldLabel>
          <Input id="telefone" value={dados.telefone} onChange={(e) => editar({ telefone: e.target.value })} />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="button" disabled={JSON.stringify(dados) === base || salvar.isPending} onClick={() => salvar.mutate()}>
          {salvar.isPending ? "Salvando…" : "Salvar dados"}
        </Button>
      </div>
    </FieldGroup>
  );
}
