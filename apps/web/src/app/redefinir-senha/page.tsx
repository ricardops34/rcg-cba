"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, KeyRound } from "lucide-react";

/**
 * Página do link de "Esqueci minha senha" (`/redefinir-senha?token=...`).
 * Pública, como o login. A regra da senha é a política da empresa do
 * usuário, conferida na API — o erro dela aparece aqui como veio.
 */
function RedefinirSenhaForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const diferentes = confirmacao.length > 0 && senha !== confirmacao;

  async function enviar() {
    setErro(null);
    setEnviando(true);
    try {
      await apiFetch("/auth/senha/redefinir", {
        method: "POST",
        body: { token, novaSenha: senha },
      });
      toast.success("Senha criada. Entre com a senha nova.");
      router.replace("/login");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível redefinir a senha.");
    } finally {
      setEnviando(false);
    }
  }

  if (!token) {
    return (
      <p className="text-sm text-muted-foreground">
        Link incompleto. Abra o link do e-mail de novo, ou peça outro em &quot;Esqueci minha
        senha&quot; na tela de login.
      </p>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void enviar();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="nova-senha">Nova senha</Label>
        <div className="relative">
          <Input
            id="nova-senha"
            type={mostrar ? "text" : "password"}
            autoComplete="new-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setMostrar((v) => !v)}
            aria-label={mostrar ? "Ocultar senha" : "Mostrar senha"}
            className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {mostrar ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirmar-senha">Confirme a nova senha</Label>
        <Input
          id="confirmar-senha"
          type={mostrar ? "text" : "password"}
          autoComplete="new-password"
          required
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
        />
        {diferentes && <p className="text-sm text-destructive">As senhas não são iguais.</p>}
      </div>
      {erro && <p className="text-sm text-destructive">{erro}</p>}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={enviando || !senha || senha !== confirmacao}
      >
        {enviando ? "Salvando..." : "Criar nova senha"}
      </Button>
      <Button type="button" variant="link" className="w-full" onClick={() => router.replace("/login")}>
        Voltar para o login
      </Button>
    </form>
  );
}

export default function RedefinirSenhaPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Image src="/logo_bj.png" alt="Plataforma Comercial" width={150} height={51} priority />
          <div className="flex items-center gap-2">
            <KeyRound className="size-5 text-primary" />
            <h1 className="text-xl font-semibold tracking-tight">Criar nova senha</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Depois de salvar, as sessões abertas com a senha antiga são encerradas.
          </p>
        </div>
        <Suspense fallback={null}>
          <RedefinirSenhaForm />
        </Suspense>
      </div>
    </div>
  );
}
