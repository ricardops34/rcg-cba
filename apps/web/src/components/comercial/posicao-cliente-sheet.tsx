"use client";

import { Sheet, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ResizableSheetContent } from "@/components/ui/resizable-sheet-content";
import { PosicaoClienteConteudo } from "@/components/comercial/posicao-cliente-conteudo";

/**
 * A posição detalhada do cliente em cortina, por cima da lista da Posição de
 * Cliente — o mesmo padrão de Visualizar/Alterar Cliente e Orçamentos.
 * Navegar para a página do detalhe e voltar recriava a lista.
 *
 * **Não modal, de propósito.** O "Abrir" dos contatos de WhatsApp abre a
 * janela de atendimento por cima desta cortina; uma cortina modal prende o
 * foco e o clique, e a janela ficaria sem uso. Clique fora fecha a cortina,
 * menos dentro da janela flutuante.
 *
 * A página `/comercial/posicao-cliente/[id]` continua existindo para quem
 * chega por link (assistente, favoritos).
 */
export function PosicaoClienteSheet({
  clienteId,
  onOpenChange,
}: {
  clienteId: string | null;
  onOpenChange: (aberto: boolean) => void;
}) {
  return (
    <Sheet open={!!clienteId} onOpenChange={onOpenChange} modal={false}>
      <ResizableSheetContent
        defaultWidth={1100}
        storageKey="plataforma-cortina-largura-posicao-cliente"
        onInteractOutside={(e) => {
          const alvo = e.target as HTMLElement | null;
          if (alvo?.closest("[data-janela-flutuante]")) e.preventDefault();
        }}
      >
        <SheetHeader className="pr-12">
          <SheetTitle>Posição do cliente</SheetTitle>
          <SheetDescription className="sr-only">
            Notas, títulos, mix e histórico do cliente
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">
          {clienteId ? (
            <PosicaoClienteConteudo clienteId={clienteId} mostrarVoltar={false} />
          ) : null}
        </div>
      </ResizableSheetContent>
    </Sheet>
  );
}
