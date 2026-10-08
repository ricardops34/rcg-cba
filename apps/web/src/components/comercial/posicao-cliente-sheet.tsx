"use client";

import { Sheet, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ResizableSheetContent } from "@/components/ui/resizable-sheet-content";
import { PosicaoClienteConteudo } from "@/components/comercial/posicao-cliente-conteudo";

/**
 * A posição detalhada do cliente em cortina, por cima da lista da Posição de
 * Cliente — o mesmo padrão de Visualizar/Alterar Cliente e Orçamentos.
 * Navegar para a página do detalhe e voltar recriava a lista.
 *
 * **Modal só quando a janela da Bia/WhatsApp está fechada** — o `<Sheet>`
 * decide isso sozinho (ver `components/ui/sheet.tsx`). Com a janela aberta, a
 * cortina abre não modal: uma cortina modal prende foco e clique, e o "Abrir"
 * dos contatos de WhatsApp, que abre a janela por cima desta cortina, ficaria
 * sem uso. Clique fora fecha a cortina, menos dentro da janela flutuante.
 * **Não force `modal={false}` aqui**: foi o que passou por cima dessa
 * decisão automática e tirou a trava de rolagem do fundo, dobrando a barra de
 * rolagem quando o conteúdo é mais alto que a tela (2026-10-08).
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
    <Sheet open={!!clienteId} onOpenChange={onOpenChange}>
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
