import { BadRequestException } from '@nestjs/common';

/**
 * Consolida repetições da mesma chave antes de resolver FKs ou montar o nested
 * write do Prisma.
 *
 * O Protheus mantém fisicamente registros excluídos. Em versões antigas do
 * integrador, um JOIN podia mandar a versão ativa e a excluída da mesma chave
 * no mesmo payload. Nesse caso a ativa representa o estado atual. Repetições
 * idênticas também são inofensivas; duas versões ativas diferentes, porém,
 * são ambíguas e viram erro 400 em vez de uma violação de índice/erro 500.
 */
export function consolidarFilhos<
  T extends { chave?: string | null; delete?: boolean },
>(filhos: T[]): T[] {
  const consolidados = new Map<string, T>();

  filhos.forEach((filho, indice) => {
    const chave = filho.chave?.trim();
    if (!chave) {
      throw new BadRequestException(
        `Filho ${indice} chegou sem chave — a sincronização precisa dela`,
      );
    }

    const normalizado = { ...filho, chave } as T;
    const anterior = consolidados.get(chave);
    if (!anterior) {
      consolidados.set(chave, normalizado);
      return;
    }

    if (anterior.delete && !normalizado.delete) {
      consolidados.set(chave, normalizado);
      return;
    }
    if (!anterior.delete && normalizado.delete) return;

    // Os demais campos de uma exclusão não são aplicados ao banco.
    if (anterior.delete && normalizado.delete) return;

    const campos = new Set([
      ...Object.keys(anterior),
      ...Object.keys(normalizado),
    ]);
    campos.delete('delete');
    const iguais = [...campos].every(
      (campo) =>
        (anterior as Record<string, unknown>)[campo] ===
        (normalizado as Record<string, unknown>)[campo],
    );
    if (!iguais) {
      throw new BadRequestException(
        `A chave de item '${chave}' foi enviada mais de uma vez com dados ativos diferentes`,
      );
    }
  });

  return [...consolidados.values()];
}

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
  const consolidados = consolidarFilhos(filhos);
  const excluidos = consolidados
    .filter((filho) => filho.delete)
    .map((filho) => filho.chave as string);
  const ativos = consolidados.filter((filho) => !filho.delete);
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
  return consolidarFilhos(
    filhos as (T & { chave?: string | null; delete?: boolean })[],
  )
    .filter((filho) => !(filho as { delete?: boolean }).delete)
    .map((filho) => {
      const { delete: _delete, ...dados } = filho as T & { delete?: boolean };
      return dados;
    });
}
