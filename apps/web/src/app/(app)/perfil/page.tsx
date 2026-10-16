"use client";

import { useSyncExternalStore } from "react";
import { Camera, MessageCircle, ShieldCheck, UserRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthStore } from "@/stores/auth-store";
import { AssinaturaWhatsappCard } from "@/components/perfil/assinatura-whatsapp-card";
import { ChangePasswordForm } from "@/components/perfil/change-password-form";
import { DadosPessoaisCard } from "@/components/perfil/dados-pessoais-card";
import { IdentidadeHeader } from "@/components/perfil/identidade-header";
import { ProfilePhoto } from "@/components/perfil/profile-photo";
import { TelaInicialCard } from "@/components/perfil/tela-inicial-card";
import { TermosAceitosCard } from "@/components/perfil/termos-aceitos-card";
import { UsarFotoNoWhatsapp } from "@/components/perfil/usar-foto-no-whatsapp";
import { WhatsappPareamentoCard } from "@/components/perfil/whatsapp-pareamento-card";

const ABAS = ["conta", "whatsapp", "seguranca"] as const;
type Aba = (typeof ABAS)[number];

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
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <IdentidadeHeader />

      <Tabs value={aba} onValueChange={trocar} className="gap-4">
        <TabsList variant="line" className="w-full border-b" aria-label="Seções do perfil">
          <TabsTrigger value="conta" className="flex-none px-3 py-2">
            <UserRound /> Conta
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="flex-none px-3 py-2">
            <MessageCircle /> WhatsApp
          </TabsTrigger>
          <TabsTrigger value="seguranca" className="flex-none px-3 py-2">
            <ShieldCheck /> Segurança
          </TabsTrigger>
        </TabsList>

        <TabsContent value="conta" className="space-y-4">
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
          <TelaInicialCard />
        </TabsContent>

        <TabsContent value="whatsapp" className="space-y-4">
          <AssinaturaWhatsappCard />
          <WhatsappPareamentoCard />
          <UsarFotoNoWhatsapp />
        </TabsContent>

        <TabsContent value="seguranca" className="space-y-4">
          <ChangePasswordForm />
          <TermosAceitosCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
