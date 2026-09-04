import {
  INTEGRACAO_LOTE_MAX,
  integracaoCategoriaCreateSchema,
  integracaoCategoriaLoteItemSchema,
  integracaoCategoriaLoteSchema,
  INTEGRACAO_CATEGORIA_CREATE_EXAMPLE,
} from '@plataforma/contracts';

describe('contrato do lote da integracao', () => {
  const registro = INTEGRACAO_CATEGORIA_CREATE_EXAMPLE;

  describe('envelope', () => {
    it('aceita registros dentro do teto', () => {
      const lote = { registros: [registro] };
      expect(integracaoCategoriaLoteSchema.parse(lote).registros).toHaveLength(1);
    });

    it('recusa lote vazio', () => {
      expect(() => integracaoCategoriaLoteSchema.parse({ registros: [] })).toThrow();
    });

    it(`recusa acima de ${INTEGRACAO_LOTE_MAX} registros`, () => {
      const registros = Array.from({ length: INTEGRACAO_LOTE_MAX + 1 }, (_, i) => ({
        ...registro,
        codigoErp: String(i).padStart(6, '0'),
      }));
      expect(() => integracaoCategoriaLoteSchema.parse({ registros })).toThrow();
    });

    it(`aceita exatamente ${INTEGRACAO_LOTE_MAX} registros`, () => {
      const registros = Array.from({ length: INTEGRACAO_LOTE_MAX }, (_, i) => ({
        ...registro,
        codigoErp: String(i).padStart(6, '0'),
      }));
      expect(
        integracaoCategoriaLoteSchema.parse({ registros }).registros,
      ).toHaveLength(INTEGRACAO_LOTE_MAX);
    });
  });

  describe('item', () => {
    it('exige os campos da entidade quando nao e exclusao', () => {
      // Sem `descricao`, que o schema de criacao exige.
      expect(() =>
        integracaoCategoriaLoteItemSchema.parse({ codigoErp: '000001' }),
      ).toThrow();
    });

    it('aponta qual campo faltou, em vez de "nenhuma opcao casou"', () => {
      const conferido = integracaoCategoriaLoteItemSchema.safeParse({
        codigoErp: '000001',
      });
      expect(conferido.success).toBe(false);
      if (conferido.success) return;
      const caminhos = conferido.error.issues.map((i) => i.path.join('.'));
      expect(caminhos).toContain('descricao');
    });

    it('para excluir basta a chave', () => {
      const item = integracaoCategoriaLoteItemSchema.parse({
        codigoErp: '000001',
        excluido: true,
      });
      expect(item).toEqual({ codigoErp: '000001', excluido: true });
    });

    it('exige a chave tambem na exclusao', () => {
      expect(() =>
        integracaoCategoriaLoteItemSchema.parse({ excluido: true }),
      ).toThrow();
    });

    it('recusa codigoErp vazio', () => {
      expect(() =>
        integracaoCategoriaLoteItemSchema.parse({ codigoErp: '', excluido: true }),
      ).toThrow();
    });

    it('recusa excluido que nao e booleano', () => {
      expect(() =>
        integracaoCategoriaLoteItemSchema.parse({
          ...registro,
          excluido: 'DELETE',
        }),
      ).toThrow();
    });

    it('aceita o mesmo payload que o POST individual aceita', () => {
      // O lote nao pode ser um segundo contrato: o que vale no create vale aqui.
      expect(integracaoCategoriaCreateSchema.parse(registro)).toBeTruthy();
      expect(integracaoCategoriaLoteItemSchema.parse(registro)).toBeTruthy();
    });
  });
});
