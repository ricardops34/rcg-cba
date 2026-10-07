"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Botão pequeno que copia um valor para a área de transferência — para código
 * e descrição de cadastro, que o vendedor cola no ERP, no WhatsApp ou na busca.
 */
export function CopiarBotao({
  valor,
  rotulo,
  className,
}: {
  valor: string;
  /** O que está sendo copiado, para o título e o aviso ("Código ERP"). */
  rotulo: string;
  className?: string;
}) {
  const [copiado, setCopiado] = useState(false);

  const copiar = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      toast.success(`${rotulo} copiado`);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      title={`Copiar ${rotulo.toLowerCase()}`}
      aria-label={`Copiar ${rotulo.toLowerCase()}`}
      className={cn("text-muted-foreground hover:text-foreground", className)}
      onClick={copiar}
    >
      {copiado ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
    </Button>
  );
}
