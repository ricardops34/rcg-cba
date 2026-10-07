import {
  descricaoParecida,
  raizesDoEquipamento,
  raizesEmComum,
} from './descricao-parecida';

describe('descricaoParecida', () => {
  it('casa o dispenser interfolha com o papel interfolhado abreviado', () => {
    const raizes = raizesDoEquipamento(
      'PLESTIN -DISP. TOALHA INTERFOLHA -EEDTI204',
    );
    expect(
      descricaoParecida(raizes, 'ESSENZ PAPEL TOALHA INTERF. 2D FS C/2000'),
    ).toBe(true);
    expect(
      descricaoParecida(raizes, 'PAPEL TOALHA INTERF. 2D FS VERSATTA'),
    ).toBe(true);
  });

  it('não casa pela marca nem pelo tipo do equipamento', () => {
    const raizes = raizesDoEquipamento(
      'PLESTIN -DISP. TOALHA INTERFOLHA -EEDTI204',
    );
    expect(descricaoParecida(raizes, 'PLESTIN -DISP. SABONETE SPRAY')).toBe(
      false,
    );
    expect(
      descricaoParecida(raizes, 'ESSENZ SABONETE FLORAL ESPUMA 600ML'),
    ).toBe(false);
  });

  it('casa o dispenser de sabonete com o sabonete, ignorando acento', () => {
    const raizes = raizesDoEquipamento(
      'FORTCOM -DISP.P/SABONETE ESPUMA E SPRAY',
    );
    expect(
      descricaoParecida(raizes, 'ESSENZ SABONETE FLORAL ESPUMA 600ML'),
    ).toBe(true);
    expect(descricaoParecida(raizes, 'SABONETE LÍQUIDO ERVA DOCE 5L')).toBe(
      true,
    );
    expect(descricaoParecida(raizes, 'ESSENZ PAPEL HIGIENICO ROLAO')).toBe(
      false,
    );
  });
});

describe('raizesEmComum', () => {
  it('papel toalha interfolhado casa mais que o higiênico interfolhado', () => {
    const raizes = raizesDoEquipamento(
      'PLESTIN -DISP. TOALHA INTERFOLHA -EEDTI204',
    );
    expect(raizesEmComum(raizes, 'ESSENZ PAPEL TOALHA INTERF. 2D FS')).toBe(2);
    expect(raizesEmComum(raizes, 'ESSENZ PAPEL HIGIENICO INTER.FD')).toBe(1);
  });
});
