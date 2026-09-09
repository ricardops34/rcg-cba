import { SetMetadata } from '@nestjs/common';

export const PERMITIR_TERMO_PENDENTE = 'permitir-termo-pendente';

/** Libera somente rotas necessárias para o usuário resolver o próprio bloqueio. */
export const PermitirTermoPendente = () =>
  SetMetadata(PERMITIR_TERMO_PENDENTE, true);

