"use client";

/**
 * O que aconteceu enquanto o assistente estava escondido.
 *
 * Âmbar com "!" quando ele **espera uma decisão** (uma gravação parada até o
 * Confirmar); ponto verde quando é só resposta nova. A diferença importa: uma
 * some sozinha ao ler, a outra trava a ação até alguém agir.
 *
 * Vive num componente próprio porque os dois botões que abrem o assistente —
 * o flutuante e o da topbar — mostram o mesmo aviso.
 */
export function AgenteIndicador({
  pendente,
  compacto = false,
}: {
  pendente: boolean;
  /** Ajuste para o botão menor da topbar. */
  compacto?: boolean;
}) {
  if (pendente) {
    return (
      <span
        aria-hidden
        className={
          "absolute flex items-center justify-center rounded-full border-2 border-background bg-amber-500 font-bold text-white " +
          (compacto
            ? "right-0.5 top-0.5 size-4 text-[9px]"
            : "-right-0.5 -top-0.5 size-5 text-[10px]")
        }
      >
        !
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={
        "absolute rounded-full border-2 border-background bg-emerald-500 " +
        (compacto ? "right-1 top-1 size-2.5" : "right-0.5 top-0.5 size-3")
      }
    />
  );
}

/** Rótulo de leitor de tela, igual nos dois botões. */
export function rotuloAgente(pendente: boolean, novidade: boolean) {
  if (pendente) return "Abrir assistente — ação aguardando sua confirmação";
  if (novidade) return "Abrir assistente — resposta nova";
  return "Abrir assistente";
}
