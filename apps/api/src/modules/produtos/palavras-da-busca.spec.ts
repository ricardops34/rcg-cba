import { palavrasDaBusca } from './produto-para-agente.service';

/**
 * O agente é pré-atendimento: quem chega descreve uma necessidade em uma frase,
 * não digita o nome do produto. A frase inteira num `ILIKE` não casa com nada —
 * foi o que aconteceu no primeiro teste com o modelo real, que respondeu "não
 * localizei arroz no catálogo" com o arroz cadastrado.
 */
describe('palavrasDaBusca', () => {
  it('quebra a frase e descarta o que não ajuda a achar', () => {
    expect(palavrasDaBusca('arroz para cozinha industrial')).toEqual([
      'arroz',
      'cozinha',
      'industrial',
    ]);
  });

  it('descarta as palavras curtas demais para filtrar', () => {
    expect(palavrasDaBusca('kit de 5 kg')).toEqual(['kit']);
  });

  it('não repete palavra', () => {
    expect(palavrasDaBusca('detergente detergente liquido')).toEqual([
      'detergente',
      'liquido',
    ]);
  });

  it('aceita o nome com acento e o código com hífen', () => {
    expect(palavrasDaBusca('Café torrado')).toEqual(['café', 'torrado']);
    expect(palavrasDaBusca('DEMO-P015')).toEqual(['demo-p015']);
  });

  it('não deixa uma frase só de conectivos virar busca sem filtro', () => {
    // Sem isto a consulta ficaria sem cláusula nenhuma e devolveria o catálogo
    // inteiro como se fosse resposta.
    expect(palavrasDaBusca('preciso de algo')).toEqual(['preciso de algo']);
  });

  it('tem teto de palavras', () => {
    const frase = 'alfa beta gama delta epsilon zeta eta teta';
    expect(palavrasDaBusca(frase)).toHaveLength(6);
  });

  it('devolve vazio para busca curta demais', () => {
    expect(palavrasDaBusca('a')).toEqual([]);
    expect(palavrasDaBusca('   ')).toEqual([]);
  });
});
