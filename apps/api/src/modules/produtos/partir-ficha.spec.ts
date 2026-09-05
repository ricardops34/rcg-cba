import { partirFicha } from './partir-ficha';

/**
 * O tamanho do trecho é o que decide a qualidade da busca semântica e o custo
 * de cada pergunta. Curto demais perde o contexto ("20 ml por kg" não diz de
 * quê); longo demais dilui o assunto no vetor e enche o contexto do modelo.
 */
describe('partirFicha', () => {
  const ficha = [
    '# Alvejante sem cloro 5 L',
    '',
    '## Composição',
    '',
    '- Base: peróxido de hidrogênio',
    '- Sem cloro ativo',
    '',
    '## Aplicação',
    '',
    'Indicado para rouparia hospitalar e hotelaria. Preserva as fibras do',
    'algodão e não amarela o tecido.',
    '',
    '## Diluição',
    '',
    '20 ml por kg de roupa seca.',
  ].join('\n');

  it('parte em trechos e devolve texto limpo, sem marcação', () => {
    const trechos = partirFicha(ficha);
    expect(trechos.length).toBeGreaterThan(0);
    for (const t of trechos) {
      expect(t).not.toMatch(/^#/m);
      expect(t).not.toMatch(/\*\*/);
    }
  });

  it('leva o título do produto em cada trecho', () => {
    // Sem isto o trecho "20 ml por kg de roupa seca" não diz de que produto é,
    // e o vetor dele aponta para lugar nenhum.
    const trechos = partirFicha(ficha);
    for (const t of trechos) {
      expect(t).toMatch(/Alvejante sem cloro/);
    }
  });

  it('não deixa trecho minúsculo solto', () => {
    // "## Diluição" sozinho, ou uma linha de tabela, não respondem nada.
    for (const t of partirFicha(ficha)) {
      expect(t.length).toBeGreaterThan(40);
    }
  });

  it('parte um bloco muito grande sem estourar o alvo', () => {
    const paragrafo = Array.from(
      { length: 60 },
      (_, i) =>
        `- Item ${i} com uma descrição técnica de tamanho razoável aqui`,
    ).join('\n');
    const trechos = partirFicha(`# Produto X\n\n${paragrafo}`);
    expect(trechos.length).toBeGreaterThan(1);
    for (const t of trechos) {
      // Folga sobre o alvo de 800: o corte é por linha, e a última linha pode
      // passar um pouco.
      expect(t.length).toBeLessThan(1200);
    }
  });

  it('tem teto de trechos por ficha', () => {
    const enorme = Array.from(
      { length: 400 },
      (_, i) =>
        `Bloco ${i} com texto suficiente para virar um trecho próprio e passar do mínimo exigido pela função de corte, com folga.`,
    ).join('\n\n');
    expect(partirFicha(enorme).length).toBeLessThanOrEqual(60);
  });

  it('aguenta ficha vazia', () => {
    expect(partirFicha('')).toEqual([]);
    expect(partirFicha('   \n\n  ')).toEqual([]);
  });

  it('usa o título informado quando o Markdown não tem um', () => {
    const semTitulo =
      'Diluição de 20 ml por kg. Não contém cloro ativo no produto.';
    const [trecho] = partirFicha(semTitulo, 'Alvejante sem cloro');
    expect(trecho).toMatch(/Alvejante sem cloro/);
  });
});
