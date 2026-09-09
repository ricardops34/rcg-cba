import Link from "next/link";
import { ArrowLeft, BookOpen, CirclePlay } from "lucide-react";
import { notFound } from "next/navigation";
import { ajudaPorCodigo } from "@/lib/ajuda-rotinas";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AjudaRotinaPage({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;
  const ajuda = ajudaPorCodigo(codigo);
  if (!ajuda) notFound();

  return (
    <article className="mx-auto max-w-4xl space-y-6">
      <Button asChild variant="ghost" className="-ml-2">
        <Link href="/ajuda">
          <ArrowLeft data-icon="inline-start" />
          Central de ajuda
        </Link>
      </Button>

      <header className="space-y-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <BookOpen className="size-5" />
        </div>
        <div>
          <p className="text-sm font-medium text-primary">Ajuda da rotina</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {ajuda.titulo}
          </h1>
        </div>
        <p className="max-w-3xl leading-7 text-muted-foreground">
          {ajuda.finalidade}
        </p>
      </header>

      <div className="space-y-3">
        {ajuda.secoes.map((secao) => (
          <Card key={secao.titulo}>
            <CardHeader>
              <CardTitle>{secao.titulo}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="leading-6 text-muted-foreground">{secao.texto}</p>
              {secao.itens ? (
                <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                  {secao.itens.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      {codigo === "inicio" ? (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="font-medium">Apresentação guiada</p>
              <p className="text-sm text-muted-foreground">
                Volte à tela inicial e use o ícone de Tour para rever a
                apresentação.
              </p>
            </div>
            <Button asChild>
              <Link href="/">
                <CirclePlay data-icon="inline-start" />
                Ir para a tela inicial
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </article>
  );
}
