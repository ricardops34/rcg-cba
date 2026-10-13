"use client";

import { useState } from "react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * "Esqueci minha senha": pede o link por e-mail. A mensagem de retorno é a
 * mesma exista o e-mail ou não — a tela não revela quem tem conta.
 */
export function EsqueciSenhaDialog({
  aberto,
  onOpenChange,
  emailInicial,
  empresaAlias,
}: {
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
  emailInicial: string;
  empresaAlias?: string;
}) {
  const [email, setEmail] = useState(emailInicial);
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    setEnviando(true);
    try {
      await apiFetch("/auth/senha/esqueci", {
        method: "POST",
        body: { email: email.trim(), empresaAlias: empresaAlias || undefined },
      });
      toast.success(
        "Se o e-mail estiver cadastrado, enviamos um link para criar uma senha nova. Ele vale por 30 minutos.",
      );
      onOpenChange(false);
    } catch (e) {
      toast.error(
        e instanceof ApiError && e.status === 429
          ? "Muitos pedidos seguidos. Aguarde alguns minutos e tente de novo."
          : e instanceof Error
            ? e.message
            : "Não foi possível enviar o pedido.",
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Esqueci minha senha</DialogTitle>
          <DialogDescription>
            Informe o e-mail de acesso. Enviamos um link para você criar uma senha nova; a atual
            continua valendo até o link ser usado.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void enviar();
          }}
        >
          <Label htmlFor="esqueci-email">E-mail</Label>
          <Input
            id="esqueci-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando || !email.trim()}>
              {enviando ? "Enviando..." : "Enviar link"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
