"use client";

import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { instalarCapturaDeErros } from "@/lib/erro-report";

// Módulo (não dentro do componente) de propósito: o `logout()` do auth-store
// precisa limpar este mesmo cache fora de um componente React. A troca de
// usuário/empresa pelo botão "Trocar empresa" já força reload de página (zera
// tudo sozinho); mas sair e entrar como outra pessoa é navegação do lado do
// cliente (`router.replace`), e sem isto a consulta antiga de QUALQUER tela
// (não só WhatsApp) ficava em cache e aparecia, por alguns segundos, para o
// próximo usuário logado — de empresa diferente, inclusive (visto em
// 2026-10-14: instância de WhatsApp da BJSoftware na tela da RCG).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  // Captura o que não passa pelo `apiFetch` (erro de JavaScript na tela,
  // promessa rejeitada) e descarrega o buffer que sobrou de uma sessão em que
  // a API estava fora. Ver docs/planos/log-de-erros.md.
  useEffect(() => instalarCapturaDeErros(), []);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          {children}
          <Toaster richColors position="top-right" />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
