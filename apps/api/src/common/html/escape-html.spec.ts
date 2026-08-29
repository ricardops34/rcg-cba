import { escapeHtml } from './escape-html';

describe('escapeHtml', () => {
  it('escapa todos os caracteres com significado em HTML', () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')"> & texto`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp; texto',
    );
  });
});
