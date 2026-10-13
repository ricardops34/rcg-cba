import Link from "next/link";
import { ArrowLeft, FileCheck2, Info, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GaleriaAjuda } from "@/components/ajuda/galeria-ajuda";
import { DialogConsultaTermos } from "@/components/termos/dialog-consulta-termos";

const IMAGENS_SOBRE = [
  {
    src: "/imagens/ajuda/print_central_ajuda.png",
    titulo: "Central de Ajuda e Manuais",
    descricao: "Painel de consulta a guias passo a passo, orientações operacionais e manuais visuais.",
  },
  {
    src: "/imagens/ajuda/print_mural_atalhos.png",
    titulo: "Mural de Acesso Rápido e Notificações",
    descricao: "Visão inicial com atalhos para as rotinas mais usadas e alertas em tempo real.",
  },
  {
    src: "/imagens/ajuda/print_meu_perfil.png",
    titulo: "Perfil do Usuário e Segurança",
    descricao: "Gestão de dados cadastrais, alteração de senha e número de WhatsApp.",
  },
  {
    src: "/imagens/ajuda/print_login.png",
    titulo: "Acesso Seguro e Multiempresa",
    descricao: "Autenticação corporativa com isolamento de dados por empresa e perfis de permissão.",
  },
];

export default function SobrePage() {
  const versao = process.env.NEXT_PUBLIC_APP_VERSION ?? "1.0";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button asChild variant="ghost" className="-ml-2">
        <Link href="/ajuda">
          <ArrowLeft data-icon="inline-start" />
          Central de ajuda
        </Link>
      </Button>

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

      {/* Galeria de telas da plataforma */}
      <GaleriaAjuda imagens={IMAGENS_SOBRE} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Informações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Versão</span>
              <span className="font-mono font-semibold">{versao}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Aplicação</span>
              <span>Plataforma web</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Desenvolvedor</span>
              <a
                href="https://www.bjsoft.com.br"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary hover:underline"
              >
                BJSoft
              </a>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">CNPJ</span>
              <span className="font-mono">19.654.062/0001-45</span>
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
          <DialogConsultaTermos rotulo="Termos de uso e normas" />
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
