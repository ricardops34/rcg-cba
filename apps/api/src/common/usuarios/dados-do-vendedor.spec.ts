import { dadosDoVendedor } from './dados-do-vendedor';

describe('Dados do vendedor na criação do usuário', () => {
  const vendedor = {
    codigoErp: '000123',
    nomeReduzido: ' Ana ',
    telefone: '6533334444',
    dataNascimento: new Date('1990-05-21T00:00:00Z'),
  };
  it('copia os campos compatíveis e preserva zeros do código e data civil', () => {
    expect(dadosDoVendedor([vendedor])).toEqual({
      ...vendedor,
      nomeReduzido: 'Ana',
    });
  });
  it('não presume que telefone seja celular e não copia acesso ou credenciais', () => {
    const dados = dadosDoVendedor([vendedor]);
    expect(dados).not.toHaveProperty('celular');
    expect(dados).not.toHaveProperty('perfilId');
    expect(dados).not.toHaveProperty('senhaHash');
  });
  it('usa valores disponíveis quando a outra empresa não possui o dado', () => {
    expect(
      dadosDoVendedor([
        vendedor,
        {
          codigoErp: null,
          nomeReduzido: '',
          telefone: null,
          dataNascimento: null,
        },
      ]),
    ).toEqual({ ...vendedor, nomeReduzido: 'Ana' });
  });
  it('não escolhe arbitrariamente dados divergentes entre empresas', () => {
    expect(
      dadosDoVendedor([
        vendedor,
        {
          ...vendedor,
          codigoErp: '000999',
          dataNascimento: new Date('1991-05-21T00:00:00Z'),
        },
      ]),
    ).toEqual({
      ...vendedor,
      nomeReduzido: 'Ana',
      codigoErp: null,
      dataNascimento: null,
    });
  });
  it('aceita criação sem vendedor correspondente', () => {
    expect(dadosDoVendedor([])).toEqual({
      codigoErp: null,
      nomeReduzido: null,
      telefone: null,
      dataNascimento: null,
    });
  });
});
