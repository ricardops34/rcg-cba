import { equipeColaboradorIds } from './equipe';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import type { TenantTx } from '../prisma/prisma.service';

function buildUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'user-1',
    nome: 'Fulano',
    email: 'fulano@teste.com',
    empresaAtivaId: 'empresa-1',
    isAdmin: false,
    permissoes: [],
    ...overrides,
  };
}

function buildTx(
  colaboradores: Array<{
    id: string;
    superiorId: string | null;
    usuarioId: string;
  }>,
) {
  return {
    usuarioEmpresa: {
      findMany: jest.fn().mockResolvedValue(colaboradores),
    },
  } as unknown as TenantTx;
}

describe('equipeColaboradorIds', () => {
  it('retorna null para admin, sem consultar usuarioEmpresa', async () => {
    const tx = buildTx([]);
    const result = await equipeColaboradorIds(tx, 'empresa-1', buildUser({ isAdmin: true }));
    expect(result).toBeNull();
    expect((tx.usuarioEmpresa.findMany as jest.Mock)).not.toHaveBeenCalled();
  });

  it('retorna lista vazia quando o usuário não tem colaborador vinculado', async () => {
    const tx = buildTx([{ id: 'c1', superiorId: null, usuarioId: 'outro-usuario' }]);
    const result = await equipeColaboradorIds(tx, 'empresa-1', buildUser());
    expect(result).toEqual([]);
  });

  it('retorna apenas o próprio id quando o colaborador não tem subordinados', async () => {
    const tx = buildTx([{ id: 'c1', superiorId: null, usuarioId: 'user-1' }]);
    const result = await equipeColaboradorIds(tx, 'empresa-1', buildUser());
    expect(result).toEqual(['c1']);
  });

  it('inclui toda a subárvore (subordinados diretos e indiretos)', async () => {
    // Gerente (c1) -> Supervisor (c2) -> Vendedores (c3, c4); c5 é de outra hierarquia.
    const tx = buildTx([
      { id: 'c1', superiorId: null, usuarioId: 'user-1' },
      { id: 'c2', superiorId: 'c1', usuarioId: 'user-2' },
      { id: 'c3', superiorId: 'c2', usuarioId: 'user-3' },
      { id: 'c4', superiorId: 'c2', usuarioId: 'user-4' },
      { id: 'c5', superiorId: null, usuarioId: 'user-5' },
    ]);
    const result = await equipeColaboradorIds(tx, 'empresa-1', buildUser({ id: 'user-1' }));
    expect(result).toEqual(expect.arrayContaining(['c1', 'c2', 'c3', 'c4']));
    expect(result).toHaveLength(4);
    expect(result).not.toContain('c5');
  });

  it('para um vendedor sem subordinados, retorna só ele mesmo mesmo com outros na empresa', async () => {
    const tx = buildTx([
      { id: 'c1', superiorId: null, usuarioId: 'user-1' },
      { id: 'c2', superiorId: 'c1', usuarioId: 'user-2' },
      { id: 'c3', superiorId: 'c2', usuarioId: 'user-3' },
    ]);
    const result = await equipeColaboradorIds(tx, 'empresa-1', buildUser({ id: 'user-3' }));
    expect(result).toEqual(['c3']);
  });

  it('não entra em loop infinito com ciclos acidentais na hierarquia', async () => {
    // Dado corrompido (não deveria existir, mas a função não pode travar): c1 -> c2 -> c1.
    const tx = buildTx([
      { id: 'c1', superiorId: 'c2', usuarioId: 'user-1' },
      { id: 'c2', superiorId: 'c1', usuarioId: 'user-2' },
    ]);
    const result = await equipeColaboradorIds(tx, 'empresa-1', buildUser({ id: 'user-1' }));
    // A função garante terminação (não trava) e cobertura de todos os nós do ciclo;
    // não deduplica o id inicial contra reaparições vindas do ciclo.
    expect(result).toEqual(expect.arrayContaining(['c1', 'c2']));
  });
});
