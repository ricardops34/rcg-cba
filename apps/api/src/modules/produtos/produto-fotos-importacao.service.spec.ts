import { codigosDoNome } from './produto-fotos-importacao.service';

describe('codigosDoNome', () => {
  it('usa o nome sem extensão como código principal', () => {
    expect(codigosDoNome('11400443.jpg')).toEqual(['11400443']);
  });

  it('oferece o código sem sufixo para fotos secundárias', () => {
    expect(codigosDoNome('11400443_2.PNG')).toEqual(['11400443_2', '11400443']);
  });

  it('remove caminhos forjados e preserva apenas o nome', () => {
    expect(codigosDoNome('../pasta/ABC principal.jpg')).toEqual([
      'ABC principal',
      'ABC',
    ]);
  });
});
