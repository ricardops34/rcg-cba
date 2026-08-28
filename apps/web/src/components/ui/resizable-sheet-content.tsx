"use client";

import { useCallback, useRef, useState } from "react";
import { SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "plataforma-cortina-largura";
const MIN_WIDTH = 420;
const MAX_WIDTH_RATIO = 0.95;

function readStoredWidth(defaultWidth: number): number {
  if (typeof window === "undefined") return defaultWidth;
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
  storageKey = STORAGE_KEY,
  minWidth = MIN_WIDTH,
  maxWidthRatio = MAX_WIDTH_RATIO,
  style,
  ...props
}: React.ComponentProps<typeof SheetContent> & {
  defaultWidth?: number;
  storageKey?: string;
  minWidth?: number;
  maxWidthRatio?: number;
}) {
  const [width, setWidth] = useState(() => {
    if (storageKey === STORAGE_KEY) return readStoredWidth(defaultWidth);
    if (typeof window === "undefined") return defaultWidth;
    const raw = window.localStorage.getItem(storageKey);
    const stored = raw ? Number(raw) : NaN;
    return Number.isFinite(stored) && stored > 0 ? stored : defaultWidth;
  });
  const widthRef = useRef(width);

  const saveWidth = useCallback(
    (next: number) => {
      const maximum = window.innerWidth * maxWidthRatio;
      const adjusted = Math.min(maximum, Math.max(minWidth, next));
      widthRef.current = adjusted;
      setWidth(adjusted);
      window.localStorage.setItem(storageKey, String(adjusted));
    },
    [maxWidthRatio, minWidth, storageKey],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = widthRef.current;
      const maxWidth = window.innerWidth * maxWidthRatio;

      const onMove = (ev: PointerEvent) => {
        const next = Math.min(
          maxWidth,
          Math.max(minWidth, startWidth + (startX - ev.clientX)),
        );
        widthRef.current = next;
        setWidth(next);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.localStorage.setItem(storageKey, String(widthRef.current));
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [maxWidthRatio, minWidth, storageKey],
  );

  return (
    <SheetContent
      className={cn(
        "!w-full !max-w-none gap-0 overflow-y-auto md:!w-[var(--cortina-width)] md:!max-w-[95vw]",
        className,
      )}
      style={{
        ...style,
        "--cortina-width": `${width}px`,
      } as React.CSSProperties}
      {...props}
    >
      <div
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label="Redimensionar cortina"
        aria-valuemin={minWidth}
        aria-valuenow={Math.round(width)}
        onPointerDown={onPointerDown}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            saveWidth(widthRef.current + 32);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            saveWidth(widthRef.current - 32);
          } else if (event.key === "Home") {
            event.preventDefault();
            saveWidth(minWidth);
          } else if (event.key === "End") {
            event.preventDefault();
            saveWidth(window.innerWidth * maxWidthRatio);
          }
        }}
        className="group absolute top-0 left-0 z-10 hidden h-full w-3 -translate-x-1/2 touch-none cursor-ew-resize select-none outline-none md:block"
      >
        <span className="absolute top-1/2 left-1/2 h-14 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border transition-colors group-hover:bg-primary/60 group-focus-visible:bg-primary" />
      </div>
      {children}
    </SheetContent>
  );
}
