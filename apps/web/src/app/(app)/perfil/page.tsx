"use client";

import { useSyncExternalStore } from "react";
import { Bell, Camera, MessageCircle, ShieldCheck, UserRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthStore } from "@/stores/auth-store";
import { AppCelularCard } from "@/components/perfil/app-celular-card";
import { AssinaturaWhatsappCard } from "@/components/perfil/assinatura-whatsapp-card";
import { ChangePasswordForm } from "@/components/perfil/change-password-form";
import { DadosPessoaisCard } from "@/components/perfil/dados-pessoais-card";
import { IdentidadeHeader } from "@/components/perfil/identidade-header";
import { NotificacoesSinoCard } from "@/components/perfil/notificacoes-sino-card";
import { ProfilePhoto } from "@/components/perfil/profile-photo";
import { TelaInicialCard } from "@/components/perfil/tela-inicial-card";
import { TamanhoPaginaCard } from "@/components/perfil/tamanho-pagina-card";
import { TermosAceitosCard } from "@/components/perfil/termos-aceitos-card";
import { UsarFotoNoWhatsapp } from "@/components/perfil/usar-foto-no-whatsapp";
import { WhatsappPareamentoCard } from "@/components/perfil/whatsapp-pareamento-card";

const ABAS = ["conta", "notificacoes", "whatsapp", "seguranca"] as const;
type Aba = (typeof ABAS)[number];

/** Duas colunas a partir do computador; cada coluna empilha os seus cartões. */
const GRADE = "grid items-start gap-4 lg:grid-cols-2";

/**
 * Meu perfil, em três abas — a tela era uma pilha longa de cartões, cada um
 * com um jeito de salvar. Agora cada aba é um assunto, e dentro dela:
 *
 * - **campos de texto** têm Salvar no rodapé do próprio cartão, que só habilita
 *   quando algo mudou;
 * - **escolhas** (foto, avatar, tela inicial) valem na hora e avisam por toast.
 *
 * A aba aberta fica no endereço (`#whatsapp`), então um link já cai no lugar certo.
 */
export default function PerfilPage() {
  const user = useAuthStore((s) => s.user);
  // A aba vem do endereço (#whatsapp); no servidor, e antes de hidratar, é a primeira.
  const hash = useSyncExternalStore(
    (aviso) => {
      window.addEventListener("hashchange", aviso);
      return () => window.removeEventListener("hashchange", aviso);
    },
    () => window.location.hash.slice(1),
    () => "",
  );
  const aba: Aba = (ABAS as readonly string[]).includes(hash) ? (hash as Aba) : "conta";
  const trocar = (valor: string) => window.location.replace(`#${valor}`);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <IdentidadeHeader />

      <Tabs value={aba} onValueChange={trocar} className="gap-4">
        <TabsList variant="line" className="w-full border-b" aria-label="Seções do perfil">
          <TabsTrigger value="conta" className="flex-none px-3 py-2">
            <UserRound /> Conta
          </TabsTrigger>
          <TabsTrigger value="notificacoes" className="flex-none px-3 py-2">
            <Bell /> Notificações
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="flex-none px-3 py-2">
            <MessageCircle /> WhatsApp
          </TabsTrigger>
          <TabsTrigger value="seguranca" className="flex-none px-3 py-2">
            <ShieldCheck /> Segurança
          </TabsTrigger>
        </TabsList>

        {/* No computador, duas colunas por aba — numa coluna só a tela virava
            uma pilha estreita no meio de muito espaço vazio. No celular, uma
            coluna, na mesma ordem. Na Conta: à esquerda o que é seu (foto,
            dados), à direita as preferências. */}
        <TabsContent value="conta" className={GRADE}>
          <div className="space-y-4">
            {user && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Camera className="size-4 text-primary" />
                    Foto
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ProfilePhoto user={user} />
                  <p className="mt-2 text-xs text-muted-foreground">
                    A foto vale assim que você a escolhe.
                  </p>
                </CardContent>
              </Card>
            )}
            <DadosPessoaisCard />
          </div>
          <div className="space-y-4">
            <TelaInicialCard />
            <TamanhoPaginaCard />
            <AppCelularCard />
          </div>
        </TabsContent>

        {/* Uma coluna só: a lista é longa e lida de cima para baixo. */}
        <TabsContent value="notificacoes" className="max-w-3xl">
          <NotificacoesSinoCard />
        </TabsContent>

        <TabsContent value="whatsapp" className={GRADE}>
          <div className="space-y-4">
            <AssinaturaWhatsappCard />
            <UsarFotoNoWhatsapp />
          </div>
          <div className="space-y-4">
            <WhatsappPareamentoCard />
          </div>
        </TabsContent>

        <TabsContent value="seguranca" className={GRADE}>
          <div className="space-y-4">
            <ChangePasswordForm />
          </div>
          <div className="space-y-4">
            <TermosAceitosCard />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
