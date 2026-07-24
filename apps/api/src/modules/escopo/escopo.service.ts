import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { resolverEscopoVendedores } from '../../common/escopo/escopo-vendedores';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class EscopoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Vendedores dentro do escopo hierárquico do usuário logado — alimenta os
   * filtros "Vendedor" das telas escopadas (notas, itens, títulos) sem expor
   * o VendedoresController (que não tem restrição de carteira).
   */
  vendedores(empresaId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const data = await tx.vendedor.findMany({
        where: {
          empresaId,
          deletedAt: null,
          ...(escopo ? { id: { in: escopo } } : {}),
        },
        select: { id: true, nome: true, nomeReduzido: true },
        orderBy: { nome: 'asc' },
      });
      return { data, restrito: escopo !== null };
    });
  }
}
