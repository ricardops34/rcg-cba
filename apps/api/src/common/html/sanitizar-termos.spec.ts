import { sanitizarTermos } from './sanitizar-termos';

describe('sanitizarTermos (SEC-10)', () => {
  const casos: [string, string][] = [
    ['<svg/onload=alert(1)>', 'onload'],
    ['<img src=x onerror=alert(1)>', 'onerror'],
    ['<a href="jav&#x61;script:alert(1)">x</a>', 'script:'],
    ['<a href=" javascript:alert(1)">x</a>', 'javascript'],
    ['<details open ontoggle=alert(1)>', 'ontoggle'],
    ['<math><mtext/onmouseover=alert(1)>x', 'onmouseover'],
    ['<p onclick="x()">ok</p>', 'onclick'],
    ['<script>alert(1)</script><p>texto</p>', 'alert'],
    ['<iframe src="javascript:alert(1)"></iframe>', 'iframe'],
    ['<style>body{display:none}</style><p>a</p>', 'display'],
  ];

  it.each(casos)('neutraliza %s', (entrada, proibido) => {
    expect(sanitizarTermos(entrada).toLowerCase()).not.toContain(proibido);
  });

  it('mantém o que um termo de uso precisa', () => {
    expect(sanitizarTermos('<h2>Termos</h2><ul><li><strong>a</strong></li></ul>')).toBe(
      '<h2>Termos</h2><ul><li><strong>a</strong></li></ul>',
    );
  });

  it('link https fica, com rel seguro', () => {
    expect(sanitizarTermos('<p><a href="https://exemplo.com" target="_blank">l</a></p>')).toBe(
      '<p><a href="https://exemplo.com" rel="noopener noreferrer">l</a></p>',
    );
  });

  it('Markdown passa como veio: o ">" da citação e o "&" não são escapados', () => {
    const md = '# Termos\n\n> citação & observação\n\n- item';
    expect(sanitizarTermos(md)).toBe(md);
  });

  it('texto vazio volta como veio', () => {
    expect(sanitizarTermos('')).toBe('');
  });
});
