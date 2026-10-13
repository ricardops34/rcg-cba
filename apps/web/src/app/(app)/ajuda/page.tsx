import Link from "next/link";
import { ArrowRight, BookOpen, ImageIcon, Info, Sparkles } from "lucide-react";
import { AJUDAS_ROTINAS } from "@/lib/ajuda-rotinas";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CentralAjudaPage() {
  const rotinasComImagens = AJUDAS_ROTINAS.filter((r) => r.imagens && r.imagens.length > 0).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <BookOpen className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Central de ajuda
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Consulte a finalidade, o fluxo operacional e as telas ilustradas das rotinas da plataforma.
          </p>
        </div>
      </header>

      {/* Destaque do Guia Ilustrado */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-background to-background">
        <CardContent className="flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="gap-1 text-xs text-primary">
                <Sparkles className="size-3" />
                Manual Executivo Ilustrado
              </Badge>
              <Badge variant="outline" className="text-xs text-muted-foreground">
                29 telas catalogadas
              </Badge>
            </div>
            <p className="text-sm font-medium text-foreground">
              Telas com desfoque de privacidade (LGPD) e guias operacionais passo a passo.
            </p>
            <p className="text-xs text-muted-foreground">
              Clique em qualquer rotina para ler as regras de negócio e visualizar capturas em alta resolução.
            </p>
          </div>
          <Link
            href="/ajuda/sobre"
            className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            Sobre a plataforma <ArrowRight className="size-3" />
          </Link>
        </CardContent>
      </Card>

      <section className="grid gap-3 sm:grid-cols-2">
        {AJUDAS_ROTINAS.map((ajuda) => {
          const totalImagens = ajuda.imagens?.length ?? 0;
          return (
            <Link key={ajuda.codigo} href={`/ajuda/rotinas/${ajuda.codigo}`}>
              <Card className="group h-full transition-all hover:border-primary/40 hover:shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between gap-3 text-base">
                    <span>{ajuda.titulo}</span>
                    <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {ajuda.resumo}
                  </p>
                  {totalImagens > 0 ? (
                    <div className="flex items-center gap-1.5">
                      <Badge variant="secondary" className="gap-1 text-[11px] font-normal text-muted-foreground">
                        <ImageIcon className="size-3 text-primary" />
                        {totalImagens} {totalImagens === 1 ? "tela ilustrada" : "telas ilustradas"}
                      </Badge>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </Link>
          );
        })}

        <Link href="/ajuda/sobre">
          <Card className="group h-full transition-all hover:border-primary/40 hover:shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between gap-3 text-base">
                <span>Sobre o sistema</span>
                <Info className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Informações da plataforma, versão, documentos de conformidade e canais de suporte.
              </p>
              <div className="flex items-center gap-1.5">
                <Badge variant="secondary" className="gap-1 text-[11px] font-normal text-muted-foreground">
                  <ImageIcon className="size-3 text-primary" />
                  Visão geral do sistema
                </Badge>
              </div>
            </CardContent>
          </Card>
        </Link>
      </section>
    </div>
  );
}
