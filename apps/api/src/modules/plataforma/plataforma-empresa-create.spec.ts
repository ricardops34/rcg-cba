import { plataformaEmpresaCreateSchema } from '@plataforma/contracts';

describe('Cadastro completo de empresa na plataforma', () => {
  const base = {
    razaoSocial: 'Empresa Exemplo Ltda',
    nomeFantasia: 'Exemplo',
    cnpj: '11222333000181',
    admin: { email: 'admin@example.com' },
  };

  it('preserva os dados fiscais, endereço e contatos na validação do DTO', () => {
    const adicionais = {
      inscricaoEstadual: '12345',
      inscricaoMunicipal: '6789',
      endereco: 'Rua Central, 10',
      complemento: 'Sala 2',
      bairro: 'Centro',
      municipio: 'Cuiabá',
      uf: 'MT',
      cep: '78000000',
      telefone: '6533334444',
      telefone2: '65999998888',
      email: 'contato@example.com',
      email2: 'vendas@example.com',
      site: 'https://example.com',
      fundadaEm: '2000-01-01T12:00:00.000Z',
      historia: 'Fundada em 2000.',
      segmentos: 'Distribuição',
    };
    expect(
      plataformaEmpresaCreateSchema.parse({ ...base, ...adicionais }),
    ).toMatchObject(adicionais);
  });

  it('mantém os campos adicionais opcionais para cadastros existentes', () => {
    expect(plataformaEmpresaCreateSchema.safeParse(base).success).toBe(true);
  });

  it.each([
    { email: 'invalido' },
    { uf: 'MATO GROSSO' },
    { fundadaEm: 'ontem' },
  ])('recusa dados adicionais inválidos: %j', (dados) => {
    expect(
      plataformaEmpresaCreateSchema.safeParse({ ...base, ...dados }).success,
    ).toBe(false);
  });
});
