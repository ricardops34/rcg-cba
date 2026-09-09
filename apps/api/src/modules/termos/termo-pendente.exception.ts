import { ForbiddenException } from '@nestjs/common';

export const CODIGO_TERMO_PENDENTE = 'TERMO_PENDENTE';

export class TermoPendenteException extends ForbiddenException {
  constructor() {
    super({
      message: 'É necessário aceitar os Termos de Uso vigentes para continuar.',
      codigo: CODIGO_TERMO_PENDENTE,
    });
  }
}

