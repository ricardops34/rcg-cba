import { integracaoEstoqueCreateSchema } from '@plataforma/contracts';

describe('contrato de integração do estoque', () => {
  it('exige codigoErp próprio no formato definido pelo ERP', () => {
    const resultado = integracaoEstoqueCreateSchema.safeParse({
      codigoErp: '01-11400443-001',
      produtoCodigo: '01-11400443',
      armazemCodigo: '01-001',
      saldo: 128,
    });

    expect(resultado.success).toBe(true);
  });

  it('recusa estoque sem codigoErp', () => {
    const resultado = integracaoEstoqueCreateSchema.safeParse({
      produtoCodigo: '01-11400443',
      armazemCodigo: '01-001',
      saldo: 128,
    });

    expect(resultado.success).toBe(false);
  });
});
