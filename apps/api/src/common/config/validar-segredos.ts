const SEGREDOS_PUBLICOS = new Set([
  'desenvolvimento-local-access',
  'desenvolvimento-local-portal-access',
  'desenvolvimento-local-refresh',
  'desenvolvimento-local-worker',
  'ZGV2LW9ubHktbmFvLXVzZS1lbS1wcm9kdWNhby0zMmI=',
  'ZGV2LW9ubHktd2hhdHNhcHAtY3J5cHRvLWtleS0zMmI=',
]);

const VARIAVEIS = [
  'JWT_ACCESS_SECRET',
  'PORTAL_JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'WHATSAPP_WORKER_TOKEN',
  'AGENTE_IA_CRYPTO_KEY',
  'WHATSAPP_CRYPTO_KEY',
] as const;

export function validarSegredosDoAmbiente(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') return;
  const inseguras = VARIAVEIS.filter((nome) =>
    SEGREDOS_PUBLICOS.has(env[nome] ?? ''),
  );
  if (inseguras.length > 0) {
    throw new Error(
      `Segredos pÃºblicos de desenvolvimento fora de development: ${inseguras.join(', ')}`,
    );
  }
}
