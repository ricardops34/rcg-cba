/** Marca de auditoria pros registros gravados pela API de integração. */
export function autorIntegracao(apiKeyId: string) {
  return `integracao:${apiKeyId}`;
}
