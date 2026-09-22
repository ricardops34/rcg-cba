/**
 * Casa a coleção de filhos que veio no payload com a que está no banco,
 * usando a `chave` de cada filho **dentro do cabeçalho**.
 *
 * Cabeçalho e itens vêm sempre juntos, no mesmo envio. Filho com
 * `delete: true` é removido; filho ativo é criado ou atualizado. A ausência de
 * um filho não o exclui: o ERP manda os itens sem filtrar `D_E_L_E_T_`, então o
 * excluído chega marcado, e o que não veio simplesmente não mudou.
 *
 * O filho fica ligado ao cabeçalho pelo vínculo interno da plataforma (a FK do
 * item para o cabeçalho), e a chave é única só dentro dele:
 * `@@unique([<cabeçalho>Id, chave])`. Por isso o `where` do upsert leva o id do
 * cabeçalho junto — não há como um envio alcançar o item de outro documento.
 *
 * A alternativa óbvia (apagar tudo e recriar) dá o mesmo conteúdo final, mas
 * troca o uuid de **todos** os itens a cada envio, mesmo quando só um preço
 * mudou, e qualquer coisa que aponte para um item perderia a referência.
 */
export function sincronizarFilhos<
  C extends string,
  T extends { chave?: string | null; delete?: boolean },
>(pai: { campo: C; id: string }, filhos: T[]) {
  const semChave = filhos.findIndex((filho) => !filho.chave);
  if (semChave >= 0) {
    // Não deveria acontecer: o contrato exige chave em todo filho vindo do
    // ERP. Se acontecer, é bug de mapeamento — e cair aqui é melhor do que
    // gravar um filho sem chave, que o próximo envio duplicaria.
    throw new Error(
      `Filho ${semChave} chegou sem chave — a sincronização precisa dela`,
    );
  }
  const excluidos = filhos
    .filter((filho) => filho.delete)
    .map((filho) => filho.chave as string);
  const ativos = filhos.filter((filho) => !filho.delete);
  const semControle = ativos.map(({ delete: _delete, ...filho }) => filho);
  return {
    deleteMany: { chave: { in: excluidos } },
    upsert: semControle.map((filho) => ({
      where: {
        [`${pai.campo}_chave`]: {
          [pai.campo]: pai.id,
          chave: filho.chave as string,
        },
      } as Record<`${C}_chave`, Record<C | 'chave', string>>,
      create: filho,
      update: filho,
    })),
  };
}

export function criarFilhos<T extends object>(filhos: T[]) {
  return filhos
    .filter((filho) => !(filho as { delete?: boolean }).delete)
    .map((filho) => {
      const { delete: _delete, ...dados } = filho as T & { delete?: boolean };
      return dados;
    });
}
