import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const ehViolacaoUnica = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

/**
 * Roda a gravação e transforma a violação de unicidade (P2002) em 409 com
 * mensagem clara. Sem isso, código repetido numa tabela global estourava como 500.
 */
export async function gravarUnico<T>(
  gravar: () => Promise<T>,
  jaExiste: string,
): Promise<T> {
  try {
    return await gravar();
  } catch (err) {
    if (ehViolacaoUnica(err)) throw new ConflictException(jaExiste);
    throw err;
  }
}

/**
 * Criar em tabela com soft delete: se a chave única pertence a um registro
 * excluído, ele é reativado com os dados novos — recriar não pode bater na
 * unicidade de uma linha que o usuário não enxerga mais.
 */
export async function criarOuReativar<T>(opcoes: {
  achaExcluido: () => Promise<{ id: string } | null>;
  reativar: (id: string) => Promise<T>;
  criar: () => Promise<T>;
  jaExiste: string;
}): Promise<T> {
  const excluido = await opcoes.achaExcluido();
  return gravarUnico(
    () => (excluido ? opcoes.reativar(excluido.id) : opcoes.criar()),
    opcoes.jaExiste,
  );
}

/** Campos que a reativação devolve ao estado de registro vivo. */
export const REATIVAR = { deletedAt: null, deletedBy: null, ativo: true };
