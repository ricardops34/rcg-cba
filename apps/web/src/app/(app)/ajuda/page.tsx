import Link from "next/link";
import { ArrowRight, BookOpen, Info } from "lucide-react";
import { AJUDAS_ROTINAS } from "@/lib/ajuda-rotinas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CentralAjudaPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-2">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <BookOpen className="size-5" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Central de ajuda
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Consulte a finalidade e o passo a passo das rotinas disponíveis na
          plataforma.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        {AJUDAS_ROTINAS.map((ajuda) => (
          <Link key={ajuda.codigo} href={`/ajuda/rotinas/${ajuda.codigo}`}>
            <Card className="h-full transition-colors hover:ring-primary/30">
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3">
                  {ajuda.titulo}
                  <ArrowRight className="size-4 text-muted-foreground" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{ajuda.resumo}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
        <Link href="/ajuda/sobre">
          <Card className="h-full transition-colors hover:ring-primary/30">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                Sobre o sistema
                <Info className="size-4 text-muted-foreground" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Informações da plataforma, versão, documentos e canais de
                suporte.
              </p>
            </CardContent>
          </Card>
        </Link>
      </section>
    </div>
  );
}
