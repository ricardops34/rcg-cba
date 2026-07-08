import { SetMetadata } from '@nestjs/common';
import type { Acao } from '@plataforma/contracts';

export const PERMISSION_KEY = 'permission';

/**
 * Exige que o usuário (ou ApiClient) autenticado possua a permissão
 * `${rotinaCodigo}.${acao}` no perfil da empresa ativa.
 */
export const RequirePermission = (rotinaCodigo: string, acao: Acao) =>
  SetMetadata(PERMISSION_KEY, `${rotinaCodigo}.${acao}`);
