import {
  domingoDePascoa,
  feriadosNacionais,
} from './feriados-nacionais';

/**
 * As Pascoas abaixo sao datas historicas conhecidas — servem para provar o
 * algoritmo, nao para ilustra-lo. Se ele quebrar, quebra aqui.
 */
describe('domingoDePascoa', () => {
  it.each([
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2030, '2030-04-21'],
    [2038, '2038-04-25'], // a mais tardia possivel no seculo
  ])('%i cai em %s', (ano, esperado) => {
    expect(domingoDePascoa(ano).toISOString().slice(0, 10)).toBe(esperado);
  });

  it('cai sempre num domingo', () => {
    for (let ano = 2024; ano <= 2040; ano++) {
      expect(domingoDePascoa(ano).getUTCDay()).toBe(0);
    }
  });
});

describe('feriadosNacionais', () => {
  const de = (ano: number) => {
    const lista = feriadosNacionais(ano);
    return (nome: string) => lista.find((f) => f.nome === nome)?.data;
  };

  it('traz os moveis derivados da Pascoa de 2026', () => {
    const f = de(2026); // Pascoa 05/04
    expect(f('Sexta-feira Santa')).toBe('2026-04-03');
    expect(f('Carnaval')).toBe('2026-02-17');
    expect(f('Corpus Christi')).toBe('2026-06-04');
  });

  it('traz os moveis de 2025, ano de Pascoa tardia', () => {
    const f = de(2025); // Pascoa 20/04
    expect(f('Sexta-feira Santa')).toBe('2025-04-18');
    expect(f('Carnaval')).toBe('2025-03-04');
    expect(f('Corpus Christi')).toBe('2025-06-19');
  });

  it('Carnaval cai sempre numa terca e Sexta-feira Santa numa sexta', () => {
    for (let ano = 2024; ano <= 2035; ano++) {
      const lista = feriadosNacionais(ano);
      const dia = (nome: string) =>
        new Date(`${lista.find((f) => f.nome === nome)!.data}T00:00:00Z`).getUTCDay();
      expect(dia('Carnaval')).toBe(2);
      expect(dia('Sexta-feira Santa')).toBe(5);
      expect(dia('Corpus Christi')).toBe(4); // quinta
    }
  });

  it('traz os fixos, incluindo a Consciencia Negra', () => {
    const f = de(2026);
    expect(f('Confraternização Universal')).toBe('2026-01-01');
    expect(f('Tiradentes')).toBe('2026-04-21');
    expect(f('Independência do Brasil')).toBe('2026-09-07');
    expect(f('Natal')).toBe('2026-12-25');
    expect(f('Dia Nacional de Zumbi e da Consciência Negra')).toBe('2026-11-20');
  });

  it('sao 12 feriados nacionais, sem repetir data', () => {
    const lista = feriadosNacionais(2026);
    expect(lista).toHaveLength(12);
    expect(new Set(lista.map((f) => f.data)).size).toBe(12);
  });

  it('vem ordenado por data', () => {
    const datas = feriadosNacionais(2026).map((f) => f.data);
    expect([...datas].sort()).toEqual(datas);
  });

  it('marca a origem de cada um', () => {
    const lista = feriadosNacionais(2026);
    expect(lista.filter((f) => f.origem === 'nacional_movel')).toHaveLength(3);
    expect(lista.filter((f) => f.origem === 'nacional_fixo')).toHaveLength(9);
  });
});
