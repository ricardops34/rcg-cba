"use client";

import { useCallback, useRef, useState } from "react";
import { SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "plataforma-cortina-largura";
const MIN_WIDTH = 420;
const MAX_WIDTH_RATIO = 0.95;

function readStoredWidth(defaultWidth: number): number {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : defaultWidth;
}

/**
 * SheetContent com a borda esquerda arrastável pra redimensionar. A largura
 * escolhida fica salva no navegador numa única chave — não é por tipo de
 * cortina, então redimensionar qualquer uma vira o padrão das próximas.
 * `defaultWidth` só vale na primeiríssima vez, antes do usuário arrastar.
 */
export function ResizableSheetContent({
  className,
  children,
  defaultWidth = 640,
  ...props
}: React.ComponentProps<typeof SheetContent> & { defaultWidth?: number }) {
  const [width, setWidth] = useState(() => readStoredWidth(defaultWidth));
  const widthRef = useRef(width);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = widthRef.current;
    const maxWidth = window.innerWidth * MAX_WIDTH_RATIO;

    const onMove = (ev: PointerEvent) => {
      const next = Math.min(maxWidth, Math.max(MIN_WIDTH, startWidth + (startX - ev.clientX)));
      widthRef.current = next;
      setWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.localStorage.setItem(STORAGE_KEY, String(widthRef.current));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  return (
    <SheetContent
      className={cn("gap-0 overflow-y-auto data-[side=right]:w-auto data-[side=right]:sm:max-w-none", className)}
      style={{ width, maxWidth: "95vw" }}
      {...props}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionar cortina"
        onPointerDown={onPointerDown}
        className="absolute top-0 left-0 z-10 h-full w-1.5 -translate-x-1/2 touch-none cursor-ew-resize select-none hover:bg-primary/30 active:bg-primary/40"
      />
      {children}
    </SheetContent>
  );
}
