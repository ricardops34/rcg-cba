import { autorDoEvento, recorteDoSolicitante } from './quem-pede';
import type { TenantTx } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * O recorte é o que separa "o cliente pede o boleto dele" de "o cliente pede o
 * boleto de outro". Erro aqui não falha nem parece errado — ele entrega o
 * documento financeiro de uma empresa para outra.
 */
describe('QuemPede — recorte do solicitante', () => {
  const user: AuthenticatedUser = {
    id: 'u-1',
    nome: 'Maria',
    email: 'maria@x.com',
    empresaAtivaId: 'emp-1',
    isAdmin: false,
    permissoes: [],
  };

  function txComVendedor(vendedorId: string | null) {
    return {
      vendedor: {
        findFirst: jest.fn(() =>
          Promise.resolve(vendedorId ? { id: vendedorId } : null),
        ),
      },
      $queryRaw: jest.fn(() => Promise.resolve([{ id: 'vend-1' }])),
    } as unknown as TenantTx;
  }

  it('cliente recorta por cliente, e nunca por carteira', async () => {
    const tx = txComVendedor('vend-1');
    const r = await recorteDoSolicitante(tx, 'emp-1', {
      tipo: 'cliente',
      clienteId: 'cli-9',
    });

    expect(r.clienteId).toBe('cli-9');
    // Sem escopo de vendedor: o cliente não pertence à carteira de ninguém do
    // ponto de vista dele mesmo, e um recorte por carteira aqui alargaria o
    // alcance em vez de estreitá-lo.
    expect(r.escopoVendedores).toBeNull();
  });

  it('cliente não consulta a hierarquia para decidir o recorte', async () => {
    const tx = txComVendedor('vend-1');
    await recorteDoSolicitante(tx, 'emp-1', {
      tipo: 'cliente',
      clienteId: 'cli-9',
    });
    // Se resolvesse escopo de vendedor para um cliente, um cadastro mal feito
    // (cliente cujo id coincidisse com um vendedor) mudaria o alcance.
    expect(
      (tx as unknown as { vendedor: { findFirst: jest.Mock } }).vendedor
        .findFirst,
    ).not.toHaveBeenCalled();
  });

  it('usuário com carteira recorta por vendedor, sem cliente', async () => {
    const tx = txComVendedor('vend-1');
    const r = await recorteDoSolicitante(tx, 'emp-1', {
      tipo: 'usuario',
      user,
    });

    expect(r.clienteId).toBeNull();
    expect(r.escopoVendedores).toEqual(['vend-1']);
  });

  it('usuário sem cadastro de vendedor fica sem restrição, como no resto do sistema', async () => {
    const tx = txComVendedor(null);
    const r = await recorteDoSolicitante(tx, 'emp-1', {
      tipo: 'usuario',
      user,
    });

    expect(r.escopoVendedores).toBeNull();
    expect(r.clienteId).toBeNull();
  });

  describe('autor do evento', () => {
    it('usuário assina com o próprio id', () => {
      expect(autorDoEvento({ tipo: 'usuario', user })).toBe('u-1');
    });

    it('pedido do cliente não recebe autor', () => {
      // Pôr o nome de alguém numa ação que a pessoa não fez é pior do que não
      // ter nome — quem agiu foi o atendimento automático.
      expect(autorDoEvento({ tipo: 'cliente', clienteId: 'cli-9' })).toBeNull();
    });
  });
});
