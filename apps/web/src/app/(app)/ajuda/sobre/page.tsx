import Link from "next/link";
import { FileCheck2, Info, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SobrePage() {
  const versao = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Info className="size-5" />
        </div>
        <div>
          <p className="text-sm font-medium text-primary">Sobre o sistema</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Plataforma Comercial
          </h1>
        </div>
        <p className="max-w-2xl leading-7 text-muted-foreground">
          Gestão comercial multiempresa com acesso controlado por perfil e
          isolamento dos dados de cada empresa.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Informações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Versão</span>
              <span className="font-mono">{versao}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Aplicação</span>
              <span>Plataforma web</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" />
              Segurança e privacidade
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-muted-foreground">
              O acesso é autenticado e as informações disponíveis respeitam a
              empresa ativa, o perfil e as permissões do usuário.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck2 className="size-4 text-primary" />
            Documentos e suporte
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/perfil">Consultar termos aceitos</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/ajuda">Abrir Central de ajuda</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
