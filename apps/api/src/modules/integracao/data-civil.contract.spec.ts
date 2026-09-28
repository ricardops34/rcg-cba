import {
  integracaoEstoqueCreateSchema,
  integracaoNotaSaidaCreateSchema,
  integracaoOrcamentoCreateSchema,
} from '@plataforma/contracts';

describe('datas da integração ERP', () => {
  const dtEmissao = integracaoNotaSaidaCreateSchema.shape.dtEmissao;
  const iso = (valor: Date | null | undefined) => {
    expect(valor).toBeInstanceOf(Date);
    return (valor as Date).toISOString();
  };

  it('preserva uma data civil sem aplicar fuso horário', () => {
    expect(iso(dtEmissao.parse('2026-09-28'))).toBe('2026-09-28T00:00:00.000Z');
  });

  it('usa apenas o dia civil de timestamps legados', () => {
    expect(iso(dtEmissao.parse('2026-09-28T23:30:00-04:00'))).toBe(
      '2026-09-28T00:00:00.000Z',
    );
  });

  it('rejeita uma data civil inexistente', () => {
    expect(() => dtEmissao.parse('2026-02-30')).toThrow();
  });

  it('mantém dataEnvio como um DateTime real', () => {
    const dataEnvio = integracaoEstoqueCreateSchema.shape.dataEnvio.parse(
      '2026-09-28T23:30:00-04:00',
    );
    expect(dataEnvio.toISOString()).toBe('2026-09-29T03:30:00.000Z');
  });

  it('mantém dataRetorno como DateTime e dataValidade como data civil', () => {
    const { dataRetorno, dataValidade } =
      integracaoOrcamentoCreateSchema.shape;

    expect(iso(dataRetorno.parse('2026-09-28T23:30:00-04:00'))).toBe(
      '2026-09-29T03:30:00.000Z',
    );
    expect(iso(dataValidade.parse('2026-09-28T23:30:00-04:00'))).toBe(
      '2026-09-28T00:00:00.000Z',
    );
  });
});
