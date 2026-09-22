import { integracaoEstoqueCreateSchema } from '@plataforma/contracts';

describe('contrato de integração do estoque', () => {
  it('aceita a chave (B2_FILIAL-B2_COD-B2_LOCAL) e o codigoErp informativo', () => {
    const resultado = integracaoEstoqueCreateSchema.safeParse({
      chave: '01-11400443-01',
      codigoErp: '11400443',
      produtoChave: '01-11400443',
      armazemChave: '01-01',
      saldo: 128,
    });

    expect(resultado.success).toBe(true);
  });

  it('aceita sem codigoErp: ele é só informativo', () => {
    const resultado = integracaoEstoqueCreateSchema.safeParse({
      chave: '01-11400443-01',
      produtoChave: '01-11400443',
      armazemChave: '01-01',
      saldo: 128,
    });

    expect(resultado.success).toBe(true);
  });

  it('recusa estoque sem chave', () => {
    const resultado = integracaoEstoqueCreateSchema.safeParse({
      codigoErp: '11400443',
      produtoChave: '01-11400443',
      armazemChave: '01-01',
      saldo: 128,
    });

    expect(resultado.success).toBe(false);
  });
});
