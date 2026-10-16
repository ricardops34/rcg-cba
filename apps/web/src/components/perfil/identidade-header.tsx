"use client";

import { useAuthStore } from "@/stores/auth-store";
import { assetUrl } from "@/lib/api-client";
import { avatarColorClass, initials } from "@/lib/avatar-color";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/**
 * Quem está logado, sempre à vista no topo. É só leitura: e-mail, empresa e
 * perfil quem muda é o administrador.
 */
export function IdentidadeHeader() {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;
  const empresa = user.empresas.find((e) => e.empresaId === user.empresaAtivaId);
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-xs sm:gap-4 sm:p-4">
      <Avatar className="size-14 shrink-0 ring-2 ring-background sm:size-16">
        <AvatarImage src={assetUrl(user.avatarUrl) ?? undefined} alt={user.nome} />
        <AvatarFallback className={avatarColorClass(user.nome)}>{initials(user.nome)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">{user.nome}</h1>
        <p className="truncate text-sm text-muted-foreground" title={user.email}>
          {user.email}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {empresa?.nomeFantasia}
          {empresa?.perfilNome ? (
            <>
              {" · "}
              <span className="font-medium text-primary">{empresa.perfilNome}</span>
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}
