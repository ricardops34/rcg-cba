import { semPreco } from './sem-preco';

/**
 * A regra do negócio é dura: a IA **nunca** informa preço a um cliente — preço
 * sai só em orçamento feito por gente.
 *
 * Nas colunas do cadastro isso é resolvido por construção (a consulta não lê
 * `ultimoPreco`). A ficha técnica não fecha assim: é texto livre vindo de um
 * PDF de fabricante, e a instrução de extração pedir "não inclua preço" é
 * prompt, não garantia. Estes testes prendem a rede que sobra.
 */
describe('semPreco', () => {
  it('tira a linha com R$, deixando o resto da ficha', () => {
    const ficha = [
      '# Detergente Concentrado 5 L',
      '',
      '- Diluição: 1:100',
      '- Preço sugerido: R$ 42,90',
      '- Validade: 24 meses',
    ].join('\n');

    const limpo = semPreco(ficha);
    expect(limpo).toContain('Diluição: 1:100');
    expect(limpo).toContain('Validade: 24 meses');
    expect(limpo).not.toContain('42,90');
    expect(limpo).not.toMatch(/R\$/);
  });

  it('pega a tabela de preço sem símbolo de moeda', () => {
    const ficha = ['Preço de tabela: 42,90', 'pH: 7,5 a 8,5'].join('\n');
    const limpo = semPreco(ficha);
    expect(limpo).not.toContain('42,90');
    expect(limpo).toContain('pH: 7,5 a 8,5');
  });

  it('pega custo, desconto e condição de pagamento', () => {
    for (const linha of [
      'Custo por litro diluído: 0,42',
      'Desconto por volume: 12%',
      'Condição de pagamento: 30/60 dias',
      'Valor unitário: 42,90',
    ]) {
      expect(semPreco(`Peso: 5 kg\n${linha}`)).toBe('Peso: 5 kg');
    }
  });

  it('NÃO remove "valor" técnico, que é palavra comum em ficha', () => {
    // O erro do outro lado também custa: uma ficha sem o pH não responde a
    // pergunta que o cliente fez.
    const ficha = ['Valor de pH: 7,5', 'Valor nutricional: n/a'].join('\n');
    expect(semPreco(ficha)).toBe(ficha);
  });

  it('devolve o texto intacto quando não há nada a tirar', () => {
    const ficha = '# Ficha\n\n- Peso: 5 kg\n- Validade: 24 meses';
    expect(semPreco(ficha)).toBe(ficha);
  });

  it('não deixa buraco onde a linha saiu', () => {
    // Três quebras seguidas o modelo lê como fim de seção, e o que vem depois
    // parece de outro assunto.
    const ficha = 'Peso: 5 kg\n\nR$ 42,90\n\nValidade: 24 meses';
    expect(semPreco(ficha)).toBe('Peso: 5 kg\n\nValidade: 24 meses');
  });

  it('aguenta texto vazio', () => {
    expect(semPreco('')).toBe('');
  });
});
