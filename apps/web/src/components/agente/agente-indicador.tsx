"use client";

/**
 * O que aconteceu enquanto o assistente estava escondido.
 *
 * Âmbar com "!" quando ele **espera uma decisão** (uma gravação parada até o
 * Confirmar); ponto verde quando é só resposta nova. A diferença importa: uma
 * some sozinha ao ler, a outra trava a ação até alguém agir.
 *
 * Vive num componente próprio, e não solto dentro do botão da topbar, porque
 * anda junto com `rotuloAgente`: o que o olho vê e o que o leitor de tela ouve
 * têm de contar a mesma coisa.
 */
export function AgenteIndicador({ pendente }: { pendente: boolean }) {
  if (pendente) {
    return (
      <span
        aria-hidden
        className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full border-2 border-background bg-amber-500 text-[9px] font-bold text-white"
      >
        !
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="absolute right-1 top-1 size-2.5 rounded-full border-2 border-background bg-emerald-500"
    />
  );
}

/** Rótulo de leitor de tela do botão que abre o assistente. */
export function rotuloAgente(pendente: boolean, novidade: boolean) {
  if (pendente) return "Abrir assistente — ação aguardando sua confirmação";
  if (novidade) return "Abrir assistente — resposta nova";
  return "Abrir assistente";
}
