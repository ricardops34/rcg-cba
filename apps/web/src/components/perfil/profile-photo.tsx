"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CurrentUser } from "@plataforma/contracts";
import { apiUpload, assetUrl, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function ProfilePhoto({ user, onlyIfMissing = false, disabled = false }: { user: CurrentUser; onlyIfMissing?: boolean; disabled?: boolean }) {
  const queryClient = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);
  const upload = useMutation({
    mutationKey: ["perfil", "foto"],
    mutationFn: (file: File) => {
      if (file.size > 2 * 1024 * 1024) throw new Error("Escolha uma foto de até 2 MB.");
      return apiUpload<CurrentUser>("/auth/me/foto", file);
    },
    onSuccess: (updated) => {
      setUser(updated);
      queryClient.setQueryData(["auth", "me"], updated);
    },
  });
  return (
    <Field>
      <Avatar className="size-20">
        <AvatarImage src={assetUrl(user.avatarUrl) ?? undefined} alt={`Foto de ${user.nome}`} />
        <AvatarFallback>{user.nome.slice(0, 1)}</AvatarFallback>
      </Avatar>
      {(!onlyIfMissing || !user.avatarUrl) && <>
        <FieldLabel htmlFor="perfil-foto">{user.avatarUrl ? "Alterar fotografia" : "Adicionar fotografia"}</FieldLabel>
        <Input id="perfil-foto" type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled || upload.isPending} onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) upload.mutate(file);
          event.target.value = "";
        }} />
        <p className="text-xs text-muted-foreground">{upload.isPending ? "Enviando fotografia…" : "Opcional. PNG, JPEG ou WEBP, até 2 MB."}</p>
      </>}
      {upload.isError && <p role="alert" className="text-sm text-destructive">{upload.error instanceof ApiError || upload.error instanceof Error ? upload.error.message : "Não foi possível enviar a foto."}</p>}
    </Field>
  );
}
