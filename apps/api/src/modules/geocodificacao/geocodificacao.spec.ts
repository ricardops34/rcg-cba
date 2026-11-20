import {
  coordenadaVazia,
  enderecoParaConsultarAoSalvar,
  interpretarResposta,
  interpretarRespostaNominatim,
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
      mensagem:
        'A chave da API é inválida. Confira se foi copiada inteira. (REQUEST_DENIED: The provided API key is invalid.)',
    });
  });

  it('projeto sem faturamento: diz o que fazer, em português', () => {
    const r = interpretarResposta({
      status: 'REQUEST_DENIED',
      error_message:
        'You must enable Billing on the Google Cloud Project at https://console.cloud.google.com/project/_/billing/enable',
    });
    expect(r).toMatchObject({ tipo: 'erro', fatal: true });
    expect(r.tipo === 'erro' && r.mensagem).toMatch(
      /^O projeto no Google Cloud está sem faturamento/,
    );
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

  it('0/0 vindo do ERP conta como sem coordenada', () => {
    const zerado = { ...atual, latitude: 0, longitude: 0 };
    expect(enderecoParaConsultarAoSalvar(zerado, zerado)).not.toBeNull();
    expect(enderecoParaConsultarAoSalvar(null, zerado)).not.toBeNull();
  });
});

describe('interpretarRespostaNominatim', () => {
  // Formato real do Nominatim (consultado em 20/11/2026), reduzido.
  const sumare = {
    lat: '-22.8507013',
    lon: '-47.1878140',
    place_rank: 30,
    display_name: '500, Rua Augusta Diogo Ayala, Sumaré',
    address: { city: 'Sumaré', 'ISO3166-2-lvl4': 'BR-SP' },
  };
  const saoPauloRua = {
    lat: '-23.5560000',
    lon: '-46.6600000',
    place_rank: 26,
    display_name: 'Rua Augusta, São Paulo',
    address: { city: 'São Paulo', 'ISO3166-2-lvl4': 'BR-SP' },
  };
  const esperado = { municipio: 'SAO PAULO', uf: 'SP' };

  it('pula o resultado de outra cidade e fica com o que bate', () => {
    expect(
      interpretarRespostaNominatim([sumare, saoPauloRua], esperado),
    ).toMatchObject({
      tipo: 'encontrado',
      latitude: -23.556,
      precisao: 'GEOMETRIC_CENTER',
    });
  });

  it('nenhum na cidade do cadastro: não encontrado', () => {
    expect(interpretarRespostaNominatim([sumare], esperado).tipo).toBe(
      'nao_encontrado',
    );
  });

  it('imóvel exato vira ROOFTOP; bairro/cidade não é gravado', () => {
    expect(
      interpretarRespostaNominatim([sumare], { municipio: 'Sumaré', uf: 'SP' }),
    ).toMatchObject({ tipo: 'encontrado', precisao: 'ROOFTOP' });
    expect(
      interpretarRespostaNominatim([{ ...sumare, place_rank: 16 }]).tipo,
    ).toBe('nao_encontrado');
  });

  it('UF diferente não vale, mesmo com o nome da cidade igual', () => {
    expect(
      interpretarRespostaNominatim([saoPauloRua], {
        municipio: 'SAO PAULO',
        uf: 'MT',
      }).tipo,
    ).toBe('nao_encontrado');
  });
});

describe('coordenadaVazia', () => {
  it('nula ou 0/0 é vazia; só uma das duas em 0 não é', () => {
    expect(coordenadaVazia(null, null)).toBe(true);
    expect(coordenadaVazia(-15.6, null)).toBe(true);
    expect(coordenadaVazia(0, 0)).toBe(true);
    expect(coordenadaVazia(0, -56.1)).toBe(false);
    expect(coordenadaVazia(-15.6, -56.1)).toBe(false);
  });
});
