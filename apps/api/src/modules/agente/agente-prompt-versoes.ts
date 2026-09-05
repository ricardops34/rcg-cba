/**
 * Versões de prompt que **acompanham o sistema**.
 *
 * O problema que isto resolve: quando uma atualização melhora o texto de uma
 * ferramenta, quem já tinha reescrito o dela não recebe a melhoria — e quem não
 * reescreveu recebe uma mudança de comportamento que não pediu. Nenhum dos dois
 * é aceitável em silêncio.
 *
 * Com versões, a atualização **oferece** o texto novo em vez de impor: o
 * administrador lê o que muda, vê exemplos, testa, e decide. A empresa que não
 * decidir nada continua na versão que estava.
 *
 * ---
 *
 * **A v1 é sempre o texto do próprio catálogo** (`Ferramenta.descricao` e
 * `.instrucoes`), e não é repetida aqui. Duplicá-la criaria duas fontes para o
 * mesmo texto, que divergiriam na primeira correção de vírgula.
 *
 * Versões novas entram em `VERSOES_ADICIONAIS`, com um `resumo` do que muda e
 * `exemplos` de pergunta em que ela se comporta diferente — sem isso, escolher
 * entre "v1" e "v2" é escolher no escuro.
 */

export interface VersaoPrompt {
  /** Identificador estável. Nunca reaproveitar: escolha gravada aponta para cá. */
  versao: string;
  /** O que muda, em uma linha. É o que o administrador lê para decidir. */
  resumo: string;
  /**
   * Perguntas em que esta versão se comporta diferente da anterior. Servem de
   * roteiro para o teste — e são o que torna a escolha comparável.
   */
  exemplos: string[];
  descricao: string;
  instrucoes?: string;
}

/** A versão que a v1 recebe. Fica aqui para não ser digitada em três lugares. */
export const VERSAO_BASE = 'v1';

/**
 * Versões além da v1, por chave de ferramenta.
 *
 * Vazio é o estado normal: só entra aqui a ferramenta cujo texto foi de fato
 * repensado. Uma entrada por ferramenta "para ter" encheria a tela de escolhas
 * sem diferença prática.
 */
export const VERSOES_ADICIONAIS: Record<string, VersaoPrompt[]> = {
  buscar_cliente: [
    {
      versao: 'v2-2026-09',
      resumo:
        'Confirma o cliente antes de responder sobre ele, em vez de assumir o primeiro resultado.',
      exemplos: [
        'Quanto o Mercado Silva está devendo?',
        'Me mostra a posição do São João',
      ],
      descricao:
        'Busca clientes da carteira do usuário por nome, razão social, código ou ramo (CNAE). ' +
        'Use sempre que a pessoa citar um cliente pelo nome, mesmo que pareça óbvio qual é.',
      instrucoes:
        'Quando a busca voltar mais de um cliente, pergunte qual antes de seguir — não escolha o primeiro. ' +
        'Quando voltar um só, diga o nome completo dele na resposta, para a pessoa conferir que é o que ela quis dizer.',
    },
  ],
};

/**
 * Todas as versões de uma ferramenta, da mais antiga para a mais nova.
 *
 * A v1 é montada a partir do catálogo do código, então ela acompanha
 * automaticamente qualquer correção feita lá.
 */
export function versoesDaFerramenta(
  chave: string,
  base: { descricao: string; instrucoes: string | null },
): VersaoPrompt[] {
  return [
    {
      versao: VERSAO_BASE,
      resumo: 'Texto original do sistema.',
      exemplos: [],
      descricao: base.descricao,
      instrucoes: base.instrucoes ?? undefined,
    },
    ...(VERSOES_ADICIONAIS[chave] ?? []),
  ];
}

/**
 * A versão em uso: a escolhida, ou a **mais recente** quando não há escolha.
 *
 * Não escolher significa acompanhar o sistema — é o comportamento que a maioria
 * espera de uma atualização, e o que evita que uma empresa fique presa a um
 * texto antigo só porque ninguém abriu a tela. Quem quiser travar numa versão,
 * escolhe explicitamente.
 */
export function versaoEmUso(
  versoes: VersaoPrompt[],
  escolhida: string | null,
): VersaoPrompt {
  if (escolhida) {
    const achada = versoes.find((v) => v.versao === escolhida);
    if (achada) return achada;
    // Versão gravada que não existe mais (removida numa atualização): cai na
    // mais recente em vez de derrubar a tela ou mandar prompt vazio ao modelo.
  }
  return versoes[versoes.length - 1];
}
