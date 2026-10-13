"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Expand, ImageIcon, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ImagemAjuda {
  src: string;
  titulo: string;
  descricao: string;
}

interface GaleriaAjudaProps {
  imagens?: ImagemAjuda[];
}

export function GaleriaAjuda({ imagens }: GaleriaAjudaProps) {
  const [indiceAtivo, setIndiceAtivo] = useState<number | null>(null);

  if (!imagens || imagens.length === 0) return null;

  const imagemAtual = indiceAtivo !== null ? imagens[indiceAtivo] : null;

  const proxima = () => {
    if (indiceAtivo === null) return;
    setIndiceAtivo((indiceAtivo + 1) % imagens.length);
  };

  const anterior = () => {
    if (indiceAtivo === null) return;
    setIndiceAtivo((indiceAtivo - 1 + imagens.length) % imagens.length);
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ImageIcon className="size-4 text-primary" />
          <h2 className="text-base font-semibold tracking-tight">
            Telas e capturas da rotina
          </h2>
        </div>
        <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
          {imagens.length} {imagens.length === 1 ? "captura disponível" : "capturas disponíveis"}
        </Badge>
      </div>

      <div
        className={`grid gap-4 ${
          imagens.length === 1
            ? "grid-cols-1"
            : "grid-cols-1 sm:grid-cols-2"
        }`}
      >
        {imagens.map((item, index) => (
          <Card
            key={item.src}
            className="group cursor-pointer overflow-hidden border-border/70 transition-all hover:border-primary/40 hover:shadow-md"
            onClick={() => setIndiceAtivo(index)}
          >
            <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.src}
                alt={item.titulo}
                loading="lazy"
                className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 backdrop-blur-[2px] transition-opacity duration-200 group-hover:opacity-100">
                <span className="flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm">
                  <Expand className="size-3.5" />
                  Clique para ampliar
                </span>
              </div>
            </div>
            <CardContent className="space-y-1 p-3.5">
              <h3 className="text-sm font-medium tracking-tight text-foreground">
                {item.titulo}
              </h3>
              <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">
                {item.descricao}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Modal Lightbox de Ampliação */}
      <Dialog open={indiceAtivo !== null} onOpenChange={(aberto) => !aberto && setIndiceAtivo(null)}>
        <DialogContent className="max-w-5xl p-4 sm:p-6 max-h-[95vh] flex flex-col">
          {imagemAtual ? (
            <>
              <DialogHeader className="space-y-1">
                <div className="flex items-center justify-between gap-3 pr-6">
                  <DialogTitle className="text-lg font-semibold">
                    {imagemAtual.titulo}
                  </DialogTitle>
                  {imagens.length > 1 ? (
                    <span className="text-xs text-muted-foreground">
                      {(indiceAtivo ?? 0) + 1} de {imagens.length}
                    </span>
                  ) : null}
                </div>
                <DialogDescription className="text-xs sm:text-sm text-muted-foreground">
                  {imagemAtual.descricao}
                </DialogDescription>
              </DialogHeader>

              <div className="relative my-2 flex flex-1 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagemAtual.src}
                  alt={imagemAtual.titulo}
                  className="max-h-[68vh] w-auto max-w-full object-contain"
                />

                {imagens.length > 1 ? (
                  <>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute left-2 top-1/2 -translate-y-1/2 size-9 rounded-full bg-background/80 shadow-md backdrop-blur-sm hover:bg-background"
                      onClick={(e) => {
                        e.stopPropagation();
                        anterior();
                      }}
                      aria-label="Imagem anterior"
                    >
                      <ChevronLeft className="size-5" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute right-2 top-1/2 -translate-y-1/2 size-9 rounded-full bg-background/80 shadow-md backdrop-blur-sm hover:bg-background"
                      onClick={(e) => {
                        e.stopPropagation();
                        proxima();
                      }}
                      aria-label="Próxima imagem"
                    >
                      <ChevronRight className="size-5" />
                    </Button>
                  </>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

