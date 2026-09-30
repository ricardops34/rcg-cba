"use client";

import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { House } from "lucide-react";
import { toast } from "sonner";
import type { CurrentUser } from "@plataforma/contracts";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { useMenu, type MenuItem } from "@/hooks/use-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DO_PERFIL = "perfil";

interface Opcao {
  /** Rotina gravada ao escolher — a primeira visível do menu. */
  rotinaId: string;
  /** Todas as rotinas visíveis do menu: qualquer uma delas abre a mesma tela. */
  rotinaIds: string[];
  rotulo: string;
}

/**
 * Uma opção por tela (menu com rota), não por rotina: as rotinas de um mesmo
 * menu abrem a mesma rota. Sai do mesmo `useMenu` da barra lateral, então só
 * aparece o que o usuário enxerga — a API confere de novo ao gravar.
 */
function opcoesDoMenu(modulos: { nome: string; menus: MenuItem[] }[]) {
  const opcoes: Opcao[] = [];
  const visitar = (caminho: string, menu: MenuItem) => {
    const rotulo = `${caminho} › ${menu.nome}`;
    if (menu.rota && menu.rotinas.length > 0) {
      opcoes.push({
        rotinaId: menu.rotinas[0].id,
        rotinaIds: menu.rotinas.map((r) => r.id),
        rotulo,
      });
    }
    menu.submenus?.forEach((sub) => visitar(rotulo, sub));
  };
  modulos.forEach((modulo) => modulo.menus.forEach((menu) => visitar(modulo.nome, menu)));
  return opcoes;
}

export function TelaInicialCard() {
  const { user, setUser } = useAuthStore();
  const queryClient = useQueryClient();
  const { data: modulos, isLoading } = useMenu();
  const opcoes = useMemo(() => opcoesDoMenu(modulos ?? []), [modulos]);

  const escolhida = opcoes.find((o) => user?.rotinaInicialId && o.rotinaIds.includes(user.rotinaInicialId));
  const valor = escolhida?.rotinaId ?? DO_PERFIL;
  const padrao = user?.rotinaInicialPerfilNome
    ? `Padrão do perfil (${user.rotinaInicialPerfilNome})`
    : "Padrão do perfil (Início)";

  const salvar = useMutation({
    mutationFn: (rotinaId: string | null) =>
      apiFetch<CurrentUser>("/auth/me/rotina-inicial", {
        method: "PATCH",
        body: { rotinaId },
      }),
    onSuccess: (atualizado) => {
      setUser(atualizado);
      queryClient.setQueryData(["auth", "me"], atualizado);
      toast.success("Tela inicial atualizada");
    },
    onError: (erro) =>
      toast.error(erro instanceof ApiError ? erro.message : "Não foi possível salvar a tela inicial"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <House className="size-4 text-primary" />
          Tela inicial
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-14 w-full" />
        ) : (
          <Field>
            <FieldLabel htmlFor="tela-inicial">Abrir ao entrar em {user?.empresas.find((e) => e.empresaId === user.empresaAtivaId)?.nomeFantasia}</FieldLabel>
            <Select
              value={valor}
              disabled={salvar.isPending}
              onValueChange={(v) => salvar.mutate(v === DO_PERFIL ? null : v)}
            >
              <SelectTrigger id="tela-inicial">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DO_PERFIL}>{padrao}</SelectItem>
                {opcoes.map((o) => (
                  <SelectItem key={o.rotinaId} value={o.rotinaId}>
                    {o.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Só aparecem as telas a que você tem acesso. Se perder o acesso à escolhida, o sistema volta
              para o padrão do perfil.
            </p>
          </Field>
        )}
      </CardContent>
    </Card>
  );
}
