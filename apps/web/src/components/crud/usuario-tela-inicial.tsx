"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const DO_PERFIL = "perfil";

interface TelasIniciais {
  rotinaInicialId: string | null;
  rotinaInicialPerfilNome: string | null;
  opcoes: { rotinaId: string; rotinaIds: string[]; rotulo: string }[];
}

/**
 * A tela que abre quando o usuário entra na empresa ativa — a mesma escolha
 * que ele faz em "Meu perfil". As opções vêm da API a partir das permissões
 * do usuário editado (não das de quem edita), e ela confere de novo ao gravar.
 */
export function UsuarioTelaInicial({ usuarioId }: { usuarioId: string }) {
  const qc = useQueryClient();
  const queryKey = ["usuarios", usuarioId, "telas-iniciais"];
  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => apiFetch<TelasIniciais>(`/usuarios/${usuarioId}/telas-iniciais`),
  });

  const salvar = useMutation({
    mutationFn: (rotinaId: string | null) =>
      apiFetch<TelasIniciais>(`/usuarios/${usuarioId}/rotina-inicial`, {
        method: "PATCH",
        body: { rotinaId },
      }),
    onSuccess: (atualizado) => {
      qc.setQueryData(queryKey, atualizado);
      toast.success("Tela inicial atualizada");
    },
    onError: (erro) =>
      toast.error(erro instanceof ApiError ? erro.message : "Não foi possível salvar a tela inicial"),
  });

  if (isLoading) return <Skeleton className="h-14 w-full" />;
  if (isError || !data) {
    return <p className="text-sm text-muted-foreground">O usuário não tem acesso à empresa em que você está.</p>;
  }

  const escolhida = data.opcoes.find((o) => data.rotinaInicialId && o.rotinaIds.includes(data.rotinaInicialId));
  const padrao = data.rotinaInicialPerfilNome
    ? `Padrão do perfil (${data.rotinaInicialPerfilNome})`
    : "Padrão do perfil (Início)";

  return (
    <Field>
      <FieldLabel htmlFor="tela-inicial-usuario">Tela inicial</FieldLabel>
      <Select
        value={escolhida?.rotinaId ?? DO_PERFIL}
        disabled={salvar.isPending}
        onValueChange={(v) => salvar.mutate(v === DO_PERFIL ? null : v)}
      >
        <SelectTrigger id="tela-inicial-usuario" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DO_PERFIL}>{padrao}</SelectItem>
          {data.opcoes.map((o) => (
            <SelectItem key={o.rotinaId} value={o.rotinaId}>
              {o.rotulo}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription>
        Abre quando o usuário entra nesta empresa. Só aparecem as telas a que ele tem acesso; o próprio usuário
        também pode trocar em Meu perfil.
      </FieldDescription>
    </Field>
  );
}
