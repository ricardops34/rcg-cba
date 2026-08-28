/**
 * Casa a coleção de filhos que veio no payload com a que está no banco,
 * usando o `codigoErp` de cada filho como chave.
 *
 * O ERP manda sempre o documento inteiro — a nota com todos os itens, a tabela
 * de preço com todas as linhas —, então filho que não veio no payload não
 * existe mais e é removido. O que veio é criado ou atualizado no lugar.
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
  T extends { empresaId: string; codigoErp?: string | null },
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
  const codigos = filhos.map((filho) => filho.codigoErp as string);
  return {
    deleteMany: { codigoErp: { notIn: codigos } },
    upsert: filhos.map((filho) => ({
      where: {
        empresaId_codigoErp: { empresaId, codigoErp: filho.codigoErp as string },
      },
      create: filho,
      update: filho,
    })),
  };
}
