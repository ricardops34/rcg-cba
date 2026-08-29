/**
 * Casa a coleção de filhos que veio no payload com a que está no banco,
 * usando o `codigoErp` de cada filho como chave.
 *
 * O ERP manda o cabeçalho com os itens alterados. Filho com `delete: true` é
 * removido; filho ativo é criado ou atualizado. A ausência de um filho não o
 * exclui, evitando apagar linhas que não participaram do lote incremental.
 *
 * A alternativa óbvia (apagar tudo e recriar) dá o mesmo conteúdo final, mas
 * troca o uuid de **todos** os itens a cada envio, mesmo quando só um preço
 * mudou. Como o uuid é a identidade interna da linha na plataforma, isso
 * significa que qualquer coisa que aponte para um item — hoje nada, amanhã um
 * anexo, um comentário, um log de auditoria — perderia a referência num
 * reenvio de rotina.
 *
 * O `where` do upsert usa o índice `@@unique([empresaId, codigoErp])`; o
 * Prisma ainda restringe a operação aos filhos do pai que está sendo gravado,
 * então não há como um envio alcançar o item de outro documento.
 */
export function sincronizarFilhos<
  T extends { empresaId: string; codigoErp?: string | null; delete?: boolean },
>(empresaId: string, filhos: T[]) {
  const semChave = filhos.findIndex((filho) => !filho.codigoErp);
  if (semChave >= 0) {
    // Não deveria acontecer: o contrato exige codigoErp em todo filho vindo do
    // ERP. Se acontecer, é bug de mapeamento — e cair aqui é melhor do que
    // gravar um filho órfão de chave, que o próximo envio duplicaria.
    throw new Error(
      `Filho ${semChave} chegou sem codigoErp — a sincronização precisa da chave`,
    );
  }
  const excluidos = filhos
    .filter((filho) => filho.delete)
    .map((filho) => filho.codigoErp as string);
  const ativos = filhos.filter((filho) => !filho.delete);
  const semControle = ativos.map(({ delete: _delete, ...filho }) => filho);
  return {
    deleteMany: { codigoErp: { in: excluidos } },
    upsert: semControle.map((filho) => ({
      where: {
        empresaId_codigoErp: { empresaId, codigoErp: filho.codigoErp as string },
      },
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
