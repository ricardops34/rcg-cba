import {
  colunasLocalizacao,
  executarComLocalizacao,
  lerCabecalhoLocalizacao,
  localizacaoDaRequisicao,
} from './contexto-localizacao';

describe('lerCabecalhoLocalizacao', () => {
  it('coordenada com precisão', () => {
    expect(lerCabecalhoLocalizacao('-20.469711,-54.620121,35')).toEqual({
      latitude: -20.469711,
      longitude: -54.620121,
      precisao: 35,
    });
  });

  it('coordenada sem precisão', () => {
    expect(lerCabecalhoLocalizacao('-20.4,-54.6')).toEqual({
      latitude: -20.4,
      longitude: -54.6,
      precisao: null,
    });
  });

  it('motivo conhecido', () => {
    expect(lerCabecalhoLocalizacao('negada')).toEqual({ motivo: 'negada' });
  });

  it('fora do formato, fora do globo ou 0/0: não informado', () => {
    expect(lerCabecalhoLocalizacao('qualquer coisa')).toBeUndefined();
    expect(lerCabecalhoLocalizacao('95,10')).toBeUndefined();
    expect(lerCabecalhoLocalizacao('0,0')).toBeUndefined();
    expect(lerCabecalhoLocalizacao(undefined)).toBeUndefined();
    expect(lerCabecalhoLocalizacao(['-20,-54'])).toBeUndefined();
  });
});

describe('localizacaoDaRequisicao', () => {
  it('sem cabeçalho na requisição: nao_informada', () => {
    expect(localizacaoDaRequisicao()).toEqual({ motivo: 'nao_informada' });
  });

  it('lê a do contexto e vira colunas da atividade', () => {
    executarComLocalizacao(lerCabecalhoLocalizacao('-20.5,-54.6,10'), () => {
      expect(colunasLocalizacao(localizacaoDaRequisicao())).toEqual({
        latitude: -20.5,
        longitude: -54.6,
        localizacaoPrecisao: 10,
        localizacaoMotivo: null,
      });
    });
  });
});
