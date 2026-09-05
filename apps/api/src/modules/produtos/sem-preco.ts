/**
 * Tira do texto as linhas que falam de preço.
 *
 * ## Por que isto existe
 *
 * A regra da empresa é que a IA **nunca** informa preço a um cliente — preço
 * sai só em orçamento feito por vendedor, supervisor ou gerente. Nas colunas do
 * cadastro isso é resolvido por construção: a consulta não lê `ultimoPreco`, e
 * o que não é lido não pode escapar.
 *
 * A ficha técnica é o caso que não fecha assim. Ela é **texto livre**, veio de
 * um PDF de fabricante, e a instrução de extração pedir "não inclua preço" é
 * prompt — não garantia. Uma tabela de preço sugerido no rodapé da ficha
 * entraria no contexto do modelo, e daí em diante a única coisa entre ela e o
 * cliente seria a boa vontade do modelo.
 *
 * ## O que isto é, e o que não é
 *
 * É uma **rede**, não uma barreira: heurística sobre texto livre erra nos dois
 * sentidos — pode deixar passar um preço escrito de um jeito que ninguém
 * previu, e pode remover uma linha legítima que fala em "valor de pH". Por isso
 * ela não é a única defesa: a tela do produto mostra o Markdown inteiro e
 * permite editá-lo, e `visivelAgente: false` tira a ficha do alcance da IA.
 *
 * Preferi errar removendo demais. Uma linha técnica a menos deixa a resposta
 * incompleta; um preço a mais quebra uma regra do negócio.
 */

/**
 * O que denuncia preço numa linha.
 *
 * `R$` e `US$` pegam o formato; as palavras pegam a tabela sem símbolo
 * ("Preço sugerido: 42,90"). `valor` sozinho ficou de fora de propósito — é
 * palavra comum em ficha técnica ("valor de pH", "valor nutricional") e
 * removeria mais conteúdo bom do que ruim.
 */
const INDICIOS = [
  /r\$/i,
  /us\$/i,
  /\bpre[çc]o/i,
  /\bpre[çc]os\b/i,
  /\bvalor\s+(unit[áa]rio|de\s+venda|de\s+tabela|sugerido)/i,
  /\btabela\s+de\s+pre[çc]/i,
  /\bcusto\b/i,
  /\bdesconto\b/i,
  /\bcondi[çc][ãa]o\s+de\s+pagamento/i,
  /\bprazo\s+de\s+pagamento/i,
];

/** A linha fala de preço? */
export function linhaTemPreco(linha: string): boolean {
  return INDICIOS.some((r) => r.test(linha));
}

/**
 * O texto sem as linhas de preço.
 *
 * Trabalha linha a linha porque é assim que Markdown de ficha se organiza — um
 * item de lista, uma linha de tabela. Cortar o texto inteiro ao primeiro
 * indício jogaria fora a ficha por causa de um rodapé.
 */
export function semPreco(texto: string): string {
  if (!texto) return texto;

  const linhas = texto.split('\n');
  const limpas = linhas.filter((l) => !linhaTemPreco(l));

  // Nada foi removido: devolve o original, sem normalizar espaçamento à toa.
  if (limpas.length === linhas.length) return texto;

  return (
    limpas
      .join('\n')
      // Remover linhas do meio de uma lista deixa buracos de três ou quatro
      // quebras seguidas, que o modelo lê como fim de seção.
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}
