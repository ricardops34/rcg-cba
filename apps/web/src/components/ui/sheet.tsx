"use client"

import * as React from "react"
import { Dialog as SheetPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"
import { useAgenteUiStore } from "@/stores/agente-ui-store"

/**
 * Com a janela flutuante aberta (Bia / atendimento de WhatsApp), a cortina
 * abre **não modal**: sem fundo escuro, sem prender foco e clique. Modal, ela
 * deixava a janela por baixo e sem uso — o vendedor não conseguia conversar
 * com o cliente enquanto montava o orçamento dele. Quem passa `modal`
 * explicitamente decide por si.
 */
function Sheet({
  modal,
  open,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Root>) {
  const janelaAberta = useAgenteUiStore((s) => s.aberto)
  const naoModal = modal === undefined && janelaAberta
  // O Radix só trava a rolagem de fundo em modo modal — de propósito, para
  // não modal. Sem repor isso à mão, uma cortina mais alta que a tela também
  // rola o <main> por trás dela: duas barras de rolagem visíveis ao mesmo
  // tempo (conferido em 2026-10-08, na Posição do cliente).
  React.useEffect(() => {
    if (!naoModal || !open) return
    const main = document.querySelector("main")
    if (!main) return
    const anterior = main.style.overflow
    main.style.overflow = "hidden"
    return () => {
      main.style.overflow = anterior
    }
  }, [naoModal, open])
  return (
    <SheetPrimitive.Root
      data-slot="sheet"
      modal={modal ?? !janelaAberta}
      open={open}
      {...props}
    />
  )
}

/** Interação dentro da janela flutuante não é "fora" da cortina. */
function naJanelaFlutuante(evento: Event) {
  const alvo = evento.target as HTMLElement | null
  return Boolean(alvo?.closest?.("[data-janela-flutuante]"))
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  onInteractOutside,
  onFocusOutside,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-[side=bottom]:data-open:slide-in-from-bottom-10 data-[side=left]:data-open:slide-in-from-left-10 data-[side=right]:data-open:slide-in-from-right-10 data-[side=top]:data-open:slide-in-from-top-10 data-closed:animate-out data-closed:fade-out-0 data-[side=bottom]:data-closed:slide-out-to-bottom-10 data-[side=left]:data-closed:slide-out-to-left-10 data-[side=right]:data-closed:slide-out-to-right-10 data-[side=top]:data-closed:slide-out-to-top-10",
          className
        )}
        // Clicar ou digitar na janela flutuante não fecha a cortina — o
        // orçamento em edição não pode sumir porque o vendedor respondeu o
        // cliente.
        onInteractOutside={(e) => {
          if (naJanelaFlutuante(e)) e.preventDefault()
          onInteractOutside?.(e)
        }}
        onFocusOutside={(e) => {
          if (naJanelaFlutuante(e)) e.preventDefault()
          onFocusOutside?.(e)
        }}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close data-slot="sheet-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-3 right-3"
              size="icon-sm"
            >
              <XIcon
              />
              <span className="sr-only">Close</span>
            </Button>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-0.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-heading text-base font-medium text-foreground",
        className
      )}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
