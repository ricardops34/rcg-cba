"use client";

import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, LoaderCircle } from "lucide-react";
import type { AvatarPadraoInput, CurrentUser } from "@plataforma/contracts";
import { ApiError, apiFetch, apiUpload, assetUrl } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { cn } from "@/lib/utils";

const AVATARES_PADRAO = [
  "corporativo-01",
  "corporativo-02",
  "corporativo-03",
  "corporativo-04",
] as const;

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  return `${partes[0]?.[0] ?? ""}${
    partes.length > 1 ? partes.at(-1)?.[0] ?? "" : ""
  }`.toUpperCase();
}

export function ProfilePhoto({
  user,
  onlyIfMissing = false,
  disabled = false,
}: {
  user: CurrentUser;
  onlyIfMissing?: boolean;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const setUser = useAuthStore((state) => state.setUser);
  const podeAlterar = !onlyIfMissing || !user.avatarUrl;

  const atualizarUsuario = (updated: CurrentUser) => {
    setUser(updated);
    queryClient.setQueryData(["auth", "me"], updated);
  };

  const upload = useMutation({
    mutationKey: ["perfil", "foto"],
    mutationFn: (file: File) => {
      if (file.size > 2 * 1024 * 1024) {
        throw new Error("Escolha uma foto de até 2 MB.");
      }
      return apiUpload<CurrentUser>("/auth/me/foto", file);
    },
    onSuccess: atualizarUsuario,
  });

  const selecionarAvatar = useMutation({
    mutationKey: ["perfil", "foto"],
    mutationFn: (avatar: AvatarPadraoInput["avatar"]) =>
      apiFetch<CurrentUser>("/auth/me/avatar-padrao", {
        method: "PATCH",
        body: { avatar } satisfies AvatarPadraoInput,
      }),
    onSuccess: atualizarUsuario,
  });

  const salvando = upload.isPending || selecionarAvatar.isPending;
  const erro = upload.error ?? selecionarAvatar.error;

  return (
    <Field>
      <div className="rounded-xl border bg-muted/20 p-3 sm:p-4">
        <div className="flex items-center gap-4">
          <Avatar className="size-16 ring-2 ring-background shadow-sm sm:size-20">
            <AvatarImage src={assetUrl(user.avatarUrl) ?? undefined} alt={`Foto de ${user.nome}`} />
            <AvatarFallback className="bg-primary/10 text-base font-semibold text-primary sm:text-lg">
              {iniciais(user.nome)}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {user.avatarUrl ? "Foto do perfil" : "Escolha como você quer aparecer"}
            </p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              {podeAlterar
                ? "Use um avatar corporativo ou envie uma foto sua."
                : "Sua foto já está cadastrada. Você poderá alterá-la em Meu perfil."}
            </p>

            {podeAlterar ? (
              <>
                <input
                  ref={inputRef}
                  className="sr-only"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={disabled || salvando}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) upload.mutate(file);
                    event.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  disabled={disabled || salvando}
                  onClick={() => inputRef.current?.click()}
                >
                  {upload.isPending ? (
                    <LoaderCircle className="animate-spin motion-reduce:animate-none" data-icon="inline-start" />
                  ) : (
                    <Camera data-icon="inline-start" />
                  )}
                  {upload.isPending ? "Enviando…" : user.avatarUrl ? "Enviar outra foto" : "Enviar minha foto"}
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {podeAlterar ? (
          <div className="mt-4 border-t pt-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Avatares corporativos</p>
            <div className="grid grid-cols-4 gap-2 sm:flex">
              {AVATARES_PADRAO.map((avatar) => {
                const src = `/avatares-padrao/${avatar}.jpg`;
                const selecionado = user.avatarUrl === src;
                const carregando = selecionarAvatar.isPending && selecionarAvatar.variables === avatar;

                return (
                  <button
                    key={avatar}
                    type="button"
                    className={cn(
                      "group relative size-14 overflow-hidden rounded-full border-2 bg-background outline-none transition-transform hover:scale-105 focus-visible:ring-3 focus-visible:ring-ring/50 sm:size-16",
                      selecionado ? "border-primary" : "border-transparent hover:border-primary/40",
                    )}
                    disabled={disabled || salvando}
                    aria-label={selecionado ? "Avatar corporativo selecionado" : "Usar este avatar corporativo"}
                    aria-pressed={selecionado}
                    onClick={() => selecionarAvatar.mutate(avatar)}
                  >
                    {/* Imagens locais pequenas (cerca de 35 KB), carregadas apenas nesta galeria. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="size-full object-cover" />
                    {selecionado || carregando ? (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
                        {carregando ? (
                          <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" />
                        ) : (
                          <Check className="size-5" strokeWidth={3} />
                        )}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {erro ? (
        <p role="alert" className="text-sm text-destructive">
          {erro instanceof ApiError || erro instanceof Error
            ? erro.message
            : "Não foi possível atualizar a foto."}
        </p>
      ) : null}
    </Field>
  );
}
