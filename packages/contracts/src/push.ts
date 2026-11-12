import { z } from "zod";

/**
 * Notificação no celular (Web Push).
 *
 * O aparelho assina pelo navegador (`PushManager.subscribe`) e manda aqui o
 * que o serviço de push devolveu. O aviso só sai enquanto a sessão de onde a
 * assinatura veio estiver aberta — ver `push_assinaturas` na API.
 */
export const pushAssinaturaInputSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
  /**
   * Religamento automático ao abrir o app logado: só reaponta para a sessão
   * atual a assinatura que já é deste usuário. Num celular compartilhado, o
   * aviso de uma pessoa não passa para a outra sem ela ligar no Perfil.
   */
  religar: z.boolean().optional(),
});
export type PushAssinaturaInput = z.infer<typeof pushAssinaturaInputSchema>;

export const pushCancelarInputSchema = z.object({
  endpoint: z.string().url().max(1000),
});
export type PushCancelarInput = z.infer<typeof pushCancelarInputSchema>;

/** Chave pública VAPID; `null` quando o servidor não tem o envio configurado. */
export const pushConfigSchema = z.object({
  chavePublica: z.string().nullable(),
});
export type PushConfig = z.infer<typeof pushConfigSchema>;
