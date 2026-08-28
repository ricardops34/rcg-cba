"use client";

import Image from "next/image";
import { useAuthStore } from "@/stores/auth-store";

/** Cor usada quando a empresa liga a faixa e não escolhe cor. */
const COR_PADRAO = "#bd1e7d";

/**
 * Faixa institucional do topo — associação, certificação, selo de grupo.
 *
 * Era fixa no código (magenta e a arte da allia, iguais para todas as
 * empresas, no login e aqui dentro). Virou configuração por empresa em
 * Administração > Empresas: marca de terceiro não vale para todo mundo, e a
 * empresa que não é associada não deve exibir nada.
 *
 * Sai da empresa **ativa** do usuário, que já vem no `me()` — trocar de
 * empresa troca a faixa junto, sem requisição a mais. Empresa com a faixa
 * desligada, ou sem imagem enviada, simplesmente não renderiza: uma tarja de
 * cor sozinha no topo pareceria defeito.
 */
export function FaixaInstitucional() {
  const user = useAuthStore((s) => s.user);
  const empresa = user?.empresas.find((e) => e.empresaId === user.empresaAtivaId);

  if (!empresa?.bannerAtivo || !empresa.bannerImagemUrl) return null;

  return (
    <div
      className="flex h-10 shrink-0 items-center justify-center"
      style={{ backgroundColor: empresa.bannerCor ?? COR_PADRAO }}
    >
      {/* A arte é enviada pelo admin, então a origem varia e o next/image
          otimizado exigiria configurar remotePatterns por ambiente. `unoptimized`
          serve o arquivo como está — são poucos KB, servidos pelo próprio
          backend em /uploads. */}
      <Image
        src={empresa.bannerImagemUrl}
        alt={`${empresa.nomeFantasia} — faixa institucional`}
        width={208}
        height={38}
        priority
        unoptimized
        className="h-6 w-auto"
      />
    </div>
  );
}
