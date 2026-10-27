/** Resposta do cadastro/reenvio de senha provisória de um usuário. */
export type AcessoEnviado = { emailEnviado?: boolean; smsEnviado?: boolean; senhaProvisoria?: string };

/** Quando nenhum canal entrega, a senha vem na resposta para o admin repassar. */
export function mensagemDoEnvio(titulo: string, r: AcessoEnviado) {
  if (r.senhaProvisoria) {
    return `${titulo}, mas nem o e-mail nem o SMS puderam ser enviados. Senha provisória: ${r.senhaProvisoria}`;
  }
  const canais = [r.emailEnviado ? "e-mail" : null, r.smsEnviado ? "SMS" : null].filter(Boolean);
  return `${titulo}. Senha provisória enviada por ${canais.join(" e ")}.`;
}
