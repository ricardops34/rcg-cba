"use client";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { useWhatsappIntegracao } from "@/hooks/use-whatsapp-integracao";
import { useMinhaSessao } from "@/components/whatsapp/atendimento-cliente-janela";
import { Button } from "@/components/ui/button";

/**
 * "Usar no WhatsApp": leva a foto do perfil para a conta de WhatsApp
 * conectada.
 *
 * Ação explícita, e não efeito de trocar o avatar: é a foto que os clientes
 * passam a ver no aparelho. Só aparece com o aparelho **conectado** e com
 * `whatsapp-conversas.editar` — a mesma permissão de conectar. A API confere
 * as duas coisas de novo.
 */
export function UsarFotoNoWhatsapp() {
  const podeEditar = useAuthStore(
    (s) => s.user?.permissoes.includes("whatsapp-conversas.editar") ?? false,
  );
  const temFoto = useAuthStore((s) => !!s.user?.avatarUrl);
  const { ativo } = useWhatsappIntegracao();
  const sessao = useMinhaSessao(podeEditar && ativo === true);

  const aplicar = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean }>("/whatsapp/sessao/foto-perfil", { method: "POST" }),
    onSuccess: () => toast.success("Foto aplicada no seu WhatsApp"),
    onError: (erro) =>
      toast.error(
        erro instanceof ApiError ? erro.message : "Não foi possível aplicar a foto no WhatsApp",
      ),
  });

  if (!podeEditar || ativo !== true || sessao.data?.status !== "conectada") return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 p-3 text-sm">
      <p className="text-muted-foreground">
        Usar esta foto também na sua conta de WhatsApp — é a que os clientes veem.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={!temFoto || aplicar.isPending}
        onClick={() => aplicar.mutate()}
      >
        <MessageCircle className="size-4 text-[#00A884]" />
        {aplicar.isPending ? "Aplicando…" : "Usar no WhatsApp"}
      </Button>
    </div>
  );
}
