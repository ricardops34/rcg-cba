import { resolverEscopoOrcamentos } from './escopo-vendedores';
import type { TenantTx } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Escopo da rotina de orçamentos: a marca "atende clientes de outras carteiras"
 * (decisão de 2026-11-06) libera a empresa toda; sem ela, vale o escopo
 * hierárquico de sempre.
 */
function montar(opcoes: { atende: boolean; carteiraCompleta?: boolean }) {
  const tx = {
    usuarioEmpresa: {
      findFirst: jest.fn().mockResolvedValue({
        usuario: { perfil: { carteiraCompleta: !!opcoes.carteiraCompleta } },
      }),
    },
    vendedor: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'v1', atendeOutrasCarteiras: opcoes.atende }),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'v1' }, { id: 'v2' }]),
  };
  return tx as unknown as TenantTx & typeof tx;
}

const vendedor = { id: 'u1', isAdmin: false } as AuthenticatedUser;

describe('resolverEscopoOrcamentos', () => {
  it('vendedor sem a marca: mantém o escopo da hierarquia', async () => {
    const tx = montar({ atende: false });
    await expect(resolverEscopoOrcamentos(tx, 'e1', vendedor)).resolves.toEqual([
      'v1',
      'v2',
    ]);
  });

  it('vendedor com a marca: sem restrição de carteira', async () => {
    const tx = montar({ atende: true });
    await expect(resolverEscopoOrcamentos(tx, 'e1', vendedor)).resolves.toBeNull();
  });

  it('perfil de carteira completa: sem restrição e sem consultar o vendedor', async () => {
    const tx = montar({ atende: false, carteiraCompleta: true });
    await expect(resolverEscopoOrcamentos(tx, 'e1', vendedor)).resolves.toBeNull();
    expect(tx.vendedor.findFirst).not.toHaveBeenCalled();
  });

  it('administrador: sem restrição', async () => {
    const tx = montar({ atende: false });
    await expect(
      resolverEscopoOrcamentos(tx, 'e1', { id: 'u2', isAdmin: true } as AuthenticatedUser),
    ).resolves.toBeNull();
  });
});
