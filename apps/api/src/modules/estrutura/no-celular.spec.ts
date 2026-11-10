import { noCelular } from './estrutura.service';
import { MENUS, MODULOS, MODULO } from '../../../prisma/catalogo-sistema';

describe('noCelular — o catálogo é o teto', () => {
  it('a empresa tira do celular o que o catálogo oferece', () => {
    expect(noCelular(true, false)).toBe(false);
    expect(noCelular(true, undefined)).toBe(true);
    expect(noCelular(true, true)).toBe(true);
  });

  it('a empresa não põe no celular o que o catálogo deixou fora', () => {
    expect(noCelular(false, true)).toBe(false);
    expect(noCelular(false, undefined)).toBe(false);
  });

  it('Administração fica fora do celular; os demais módulos ficam', () => {
    for (const m of MODULOS) {
      const esperado = m.id !== MODULO.administracao;
      expect({
        modulo: m.nome,
        celular: m.disponivelTelaPequena ?? true,
      }).toEqual({
        modulo: m.nome,
        celular: esperado,
      });
    }
  });

  it('Campos do Produto (Cadastros) fica fora do celular', () => {
    const menu = MENUS.find((m) => m.id === 'seed-menu-produtos-campos');
    expect(menu?.disponivelTelaPequena).toBe(false);
  });
});
