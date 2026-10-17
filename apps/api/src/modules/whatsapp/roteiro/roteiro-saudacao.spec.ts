import { instanteLocal } from '../../../common/horario/expediente';
import { atrasoDeDigitacaoMs, saudacaoDoHorario } from './roteiro-saudacao';

describe('saudacaoDoHorario', () => {
  const DIA = '2030-03-12';

  it('segue o horário local: dia, tarde e noite', () => {
    expect(saudacaoDoHorario(instanteLocal(DIA, '08:00'), () => 0)).toBe(
      'Bom dia, tudo bem?',
    );
    expect(saudacaoDoHorario(instanteLocal(DIA, '14:00'), () => 0)).toBe(
      'Boa tarde, tudo bem?',
    );
    expect(saudacaoDoHorario(instanteLocal(DIA, '19:00'), () => 0)).toBe(
      'Boa noite, tudo bem?',
    );
  });

  it('meio-dia já é tarde; 18:00 já é noite', () => {
    expect(saudacaoDoHorario(instanteLocal(DIA, '11:59'), () => 0)).toContain(
      'Bom dia',
    );
    expect(saudacaoDoHorario(instanteLocal(DIA, '12:00'), () => 0)).toContain(
      'Boa tarde',
    );
    expect(saudacaoDoHorario(instanteLocal(DIA, '17:59'), () => 0)).toContain(
      'Boa tarde',
    );
    expect(saudacaoDoHorario(instanteLocal(DIA, '18:00'), () => 0)).toContain(
      'Boa noite',
    );
  });

  it('varia a forma, sempre com a saudação do horário e a pergunta', () => {
    const quando = instanteLocal(DIA, '09:00');
    const formas = new Set(
      [0, 0.4, 0.99].map((n) => saudacaoDoHorario(quando, () => n)),
    );
    expect(formas.size).toBe(3);
    for (const f of formas) {
      expect(f.toLowerCase()).toContain('bom dia');
      expect(f).toContain('?');
    }
  });

  it('sorteio no limite não estoura a lista', () => {
    expect(() =>
      saudacaoDoHorario(instanteLocal(DIA, '09:00'), () => 0.9999999),
    ).not.toThrow();
  });
});

describe('atrasoDeDigitacaoMs', () => {
  it('fica entre 2 e 6 segundos', () => {
    expect(atrasoDeDigitacaoMs(() => 0)).toBe(2000);
    expect(atrasoDeDigitacaoMs(() => 0.9999)).toBeLessThan(6000);
  });
});
