import { filtroBuscaTermos, termosDeBusca } from './termos-busca';

/**
 * O caso que originou o helper: o agente respondeu "não encontrei cliente com
 * o nome Ricard patay" para um cliente chamado RICARDO PATAY SOTOMAYOR, porque
 * a busca era um `contains` da frase inteira.
 */
describe('termosDeBusca', () => {
  it('quebra por espaços e ignora espaço sobrando', () => {
    expect(termosDeBusca('  Ricard   patay ')).toEqual(['Ricard', 'patay']);
  });

  it('sem termo devolve lista vazia', () => {
    expect(termosDeBusca('   ')).toEqual([]);
    expect(termosDeBusca(undefined)).toEqual([]);
  });

  it('limita a quantidade de termos', () => {
    // Frase colada no campo de busca não pode virar consulta cara.
    expect(termosDeBusca('a b c d e f g h')).toHaveLength(6);
  });
});

describe('filtroBuscaTermos', () => {
  it('exige todos os termos, cada um em qualquer campo', () => {
    expect(
      filtroBuscaTermos('Ricard patay', ['razaoSocial', 'cnpjCpf']),
    ).toEqual({
      AND: [
        {
          OR: [
            { razaoSocial: { contains: 'Ricard', mode: 'insensitive' } },
            { cnpjCpf: { contains: 'Ricard', mode: 'insensitive' } },
          ],
        },
        {
          OR: [
            { razaoSocial: { contains: 'patay', mode: 'insensitive' } },
            { cnpjCpf: { contains: 'patay', mode: 'insensitive' } },
          ],
        },
      ],
    });
  });

  it('um termo só se comporta como o contains anterior', () => {
    // Garante que CNPJ, código ERP e razão social completa não mudam de
    // resultado com a troca.
    expect(filtroBuscaTermos('12345678000199', ['cnpjCpf'])).toEqual({
      AND: [
        {
          OR: [
            { cnpjCpf: { contains: '12345678000199', mode: 'insensitive' } },
          ],
        },
      ],
    });
  });

  it('sem busca devolve objeto vazio, para espalhar no where sem filtrar', () => {
    expect(filtroBuscaTermos('', ['razaoSocial'])).toEqual({});
  });
});
