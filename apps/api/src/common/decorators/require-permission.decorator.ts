import { SetMetadata } from '@nestjs/common';
import type { Acao } from '@plataforma/contracts';

export const PERMISSION_KEY = 'permission';

/**
 * Exige que o usuário (ou ApiClient) autenticado possua a permissão
 * `${rotinaCodigo}.${acao}` no perfil da empresa ativa. Alternativas extras
 * (ex.: uma rota alcançável por mais de uma tela, cada uma com sua própria
 * permissão) tornam a checagem um OR — basta ter uma delas.
 */
export const RequirePermission = (
  rotinaCodigo: string,
  acao: Acao,
  ...alternativas: [rotinaCodigo: string, acao: Acao][]
) =>
  SetMetadata(PERMISSION_KEY, [
    `${rotinaCodigo}.${acao}`,
    ...alternativas.map(([r, a]) => `${r}.${a}`),
  ]);
