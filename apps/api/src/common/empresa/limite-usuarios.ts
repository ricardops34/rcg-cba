import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/**
 * Confere se a empresa ainda tem vaga antes de criar mais um vínculo.
 *
 * **A vaga é do vínculo, não da pessoa.** A mesma pessoa pode atender duas
 * empresas, e cada uma paga pela sua — contar por usuário faria a segunda
 * empresa herdar de graça quem a primeira cadastrou.
 *
 * Conta apenas vínculos ativos: desativar o vínculo de quem saiu libera a
 * vaga, que é a ação que já se faz naturalmente. Por isso a reativação também
 * passa por aqui — senão bastaria desativar, cadastrar outro e reativar para
 * estourar o teto.
 *
 * `limiteUsuarios` nulo é o padrão e significa sem limite: empresa que nunca
 * teve teto configurado não passa a ter um por efeito colateral desta função.
 */
export async function garantirVagaDeUsuario(
  tx: Prisma.TransactionClient,
  empresaId: string,
  /** Vínculo que já existe e está sendo reativado — não conta duas vezes. */
  ignorarUsuarioId?: string,
): Promise<void> {
  const empresa = await tx.empresa.findUnique({
    where: { id: empresaId },
    select: { limiteUsuarios: true },
  });

  const limite = empresa?.limiteUsuarios;
  if (limite === null || limite === undefined) return;

  const emUso = await tx.usuarioEmpresa.count({
    where: {
      empresaId,
      ativo: true,
      ...(ignorarUsuarioId ? { NOT: { usuarioId: ignorarUsuarioId } } : {}),
    },
  });

  if (emUso >= limite) {
    throw new ForbiddenException(
      `Esta empresa já usa ${emUso} de ${limite} usuários contratados. ` +
        'Desative um usuário existente ou fale com o responsável comercial para ampliar o limite.',
    );
  }
}
