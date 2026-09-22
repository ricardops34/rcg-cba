import {
  integracaoCategoriaCreateSchema,
  integracaoNotaSaidaItemSchema,
  integracaoOrcamentoVincularSchema,
} from '@plataforma/contracts';

// Plano docs/planos/2026-09-22-chave-integracao.md: `chave` identifica o
// registro na integração; `codigoErp` é só informativo e nunca é derivado dela.
describe('contrato: chave de integração × codigoErp', () => {
  it('cadastro exige a chave e mantém o codigoErp como veio', () => {
    const r = integracaoCategoriaCreateSchema.parse({
      chave: '-12',
      codigoErp: '12',
      descricao: 'ACESSORIOS DE LIMPEZA',
    });
    expect(r.chave).toBe('-12');
    expect(r.codigoErp).toBe('12');
  });

  it('cadastro sem codigoErp não recebe nenhum valor calculado da chave', () => {
    const r = integracaoCategoriaCreateSchema.parse({
      chave: '-12',
      descricao: 'ACESSORIOS DE LIMPEZA',
    });
    expect(r.codigoErp).toBeUndefined();
  });

  it('referência a outro registro vai pela chave dele', () => {
    const r = integracaoCategoriaCreateSchema.parse({
      chave: '-0502',
      descricao: 'CERAS',
      categoriaPaiChave: '-05',
    });
    expect(r.categoriaPaiChave).toBe('-05');
  });

  it('item não tem codigoErp, só a chave', () => {
    expect(integracaoNotaSaidaItemSchema.shape).toHaveProperty('chave');
    expect(integracaoNotaSaidaItemSchema.shape).not.toHaveProperty('codigoErp');
  });

  it('vincular recebe a chave do SC5 e a do SC6 de cada item', () => {
    const r = integracaoOrcamentoVincularSchema.parse({
      chave: '01-004512',
      codigoErp: '004512',
      itens: [
        {
          id: '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f',
          chave: '01-004512-01-11400443',
        },
      ],
    });
    expect(r.itens).toHaveLength(1);
  });
});
