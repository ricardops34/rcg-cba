import { BadRequestException } from '@nestjs/common';

export function validarDocumentoEmpresa(tipoPessoa: string | undefined, documento: string) {
  const fisica = tipoPessoa === 'fisica';
  if (!(fisica ? /^\d{11}$/ : /^\d{14}$/).test(documento)) {
    throw new BadRequestException(fisica ? 'CPF deve conter 11 dígitos' : 'CNPJ deve conter 14 dígitos');
  }
}
