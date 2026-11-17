import {
  enderecoParaConsultarAoSalvar,
  interpretarResposta,
  textoDoEndereco,
} from './geocodificacao.service';

const ENDERECO = {
  endereco: 'Av. Getúlio Vargas, 1000',
  bairro: 'Centro',
  municipio: 'Cuiabá',
  uf: 'MT',
  cep: '78005000',
};

describe('textoDoEndereco', () => {
  it('monta rua, bairro, cidade, CEP e país', () => {
    expect(textoDoEndereco(ENDERECO)).toBe(
      'Av. Getúlio Vargas, 1000, Centro, Cuiabá - MT, 78005-000, Brasil',
    );
  });

  it('sem rua não consulta (o Google só daria o centro da cidade)', () => {
    expect(textoDoEndereco({ ...ENDERECO, endereco: '  ' })).toBeNull();
  });
});

describe('interpretarResposta', () => {
  const ok = (location_type: string) => ({
    status: 'OK',
    results: [
      {
        formatted_address: 'Av. Getúlio Vargas, 1000 - Centro, Cuiabá - MT',
        geometry: {
          location: { lat: -15.6012345678, lng: -56.0987654321 },
          location_type,
        },
      },
    ],
  });

  it('achou no número: grava, com 6 casas', () => {
    expect(interpretarResposta(ok('ROOFTOP'))).toMatchObject({
      tipo: 'encontrado',
      latitude: -15.601235,
      longitude: -56.098765,
    });
  });

  it('só o centro da cidade não é gravado', () => {
    expect(interpretarResposta(ok('APPROXIMATE')).tipo).toBe('nao_encontrado');
  });

  it('ZERO_RESULTS é não encontrado', () => {
    expect(
      interpretarResposta({ status: 'ZERO_RESULTS', results: [] }).tipo,
    ).toBe('nao_encontrado');
  });

  it('chave recusada para o lote', () => {
    expect(
      interpretarResposta({
        status: 'REQUEST_DENIED',
        error_message: 'The provided API key is invalid.',
      }),
    ).toEqual({
      tipo: 'erro',
      fatal: true,
      mensagem: 'REQUEST_DENIED: The provided API key is invalid.',
    });
  });

  it('erro passageiro não para o lote', () => {
    expect(interpretarResposta({ status: 'UNKNOWN_ERROR' })).toMatchObject({
      tipo: 'erro',
      fatal: false,
    });
  });
});

describe('enderecoParaConsultarAoSalvar', () => {
  const atual = {
    ...ENDERECO,
    latitude: -15.6,
    longitude: -56.1,
    coordenadasConsultadasEm: null,
  };

  it('inclusão sem coordenada consulta', () => {
    expect(enderecoParaConsultarAoSalvar(null, ENDERECO)).not.toBeNull();
  });

  it('inclusão com coordenada digitada não consulta', () => {
    expect(
      enderecoParaConsultarAoSalvar(null, {
        ...ENDERECO,
        latitude: -15,
        longitude: -56,
      }),
    ).toBeNull();
  });

  it('endereço mudou: consulta mesmo já tendo coordenada', () => {
    expect(
      enderecoParaConsultarAoSalvar(atual, {
        ...atual,
        endereco: 'Rua Nova, 10',
      }),
    ).toContain('Rua Nova, 10');
  });

  it('só grafia diferente não conta como mudança', () => {
    expect(
      enderecoParaConsultarAoSalvar(atual, {
        ...atual,
        endereco: 'AV GETULIO VARGAS 1000',
        municipio: 'CUIABA',
      }),
    ).toBeNull();
  });

  it('endereço mudou mas a pessoa digitou a coordenada: vale a dela', () => {
    expect(
      enderecoParaConsultarAoSalvar(atual, {
        ...atual,
        endereco: 'Rua Nova, 10',
        latitude: -15.7,
      }),
    ).toBeNull();
  });

  it('sem coordenada e nunca consultado: consulta', () => {
    expect(
      enderecoParaConsultarAoSalvar(
        { ...atual, latitude: null, longitude: null },
        { ...atual, latitude: null, longitude: null },
      ),
    ).not.toBeNull();
  });

  it('sem coordenada, já consultado e endereço igual: não gasta de novo', () => {
    const consultado = {
      ...atual,
      latitude: null,
      longitude: null,
      coordenadasConsultadasEm: new Date(),
    };
    expect(enderecoParaConsultarAoSalvar(consultado, consultado)).toBeNull();
  });
});
