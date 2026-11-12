"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Rows3 } from "lucide-react";
import { toast } from "sonner";
import { TAMANHOS_PAGINA, type CurrentUser } from "@plataforma/contracts";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { esquecerTamanhosLembrados } from "@/hooks/use-tamanho-pagina";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DO_PERFIL = "perfil";

/**
 * Itens por página das listagens. Vale para todas as telas paginadas; a
 * troca feita no seletor de uma tela continua valendo naquela tela até a
 * próxima vez que o usuário salvar aqui (ver useTamanhoPagina).
 */
export function TamanhoPaginaCard() {
  const { user, setUser } = useAuthStore();
  const queryClient = useQueryClient();

  const valor = user?.tamanhoPaginaUsuario ? String(user.tamanhoPaginaUsuario) : DO_PERFIL;
  const padrao = user?.tamanhoPaginaPerfil
    ? `Padrão do perfil (${user.tamanhoPaginaPerfil} por página)`
    : "Padrão do perfil (o de cada tela)";

  const salvar = useMutation({
    mutationFn: (tamanhoPagina: number | null) =>
      apiFetch<CurrentUser>("/auth/me/tamanho-pagina", {
        method: "PATCH",
        body: { tamanhoPagina },
      }),
    onSuccess: (atualizado) => {
      esquecerTamanhosLembrados(atualizado.id);
      setUser(atualizado);
      queryClient.setQueryData(["auth", "me"], atualizado);
      toast.success("Tamanho das listagens atualizado");
    },
    onError: (erro) =>
      toast.error(
        erro instanceof ApiError ? erro.message : "Não foi possível salvar o tamanho das listagens",
      ),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Rows3 className="size-4 text-primary" />
          Listagens
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Field>
          <FieldLabel htmlFor="tamanho-pagina">Itens por página</FieldLabel>
          <Select
            value={valor}
            disabled={salvar.isPending}
            onValueChange={(v) => salvar.mutate(v === DO_PERFIL ? null : Number(v))}
          >
            <SelectTrigger id="tamanho-pagina">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DO_PERFIL}>{padrao}</SelectItem>
              {TAMANHOS_PAGINA.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} por página
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Vale para todas as listagens. Se você trocar o tamanho numa tela, ela lembra a sua troca;
            salvar aqui de novo volta todas para este número.
          </p>
        </Field>
      </CardContent>
    </Card>
  );
}
