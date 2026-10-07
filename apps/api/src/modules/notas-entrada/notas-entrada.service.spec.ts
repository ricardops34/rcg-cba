import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { resolverEscopoVendedores } from '../../common/escopo/escopo-vendedores';
import { NotasEntradaService } from './notas-entrada.service';

jest.mock('../../common/escopo/escopo-vendedores', () => ({
  resolverEscopoVendedores: jest.fn(),
}));
const escopoMock = resolverEscopoVendedores as jest.Mock;

function usuario(permissoes: string[], isAdmin = false): AuthenticatedUser {
  return {
    id: 'u1',
    nome: 'Fulano',
    email: 'f@x.com',
    empresaAtivaId: 'emp-1',
    isAdmin,
    permissoes,
  };
}

/**
 * O detalhe da nota de entrada também abre pela Posição de Cliente. A nota de
 * compra carrega custo: quem chega só por lá não pode alcançá-la pelo id.
 */
describe('NotasEntradaService.findOne — acesso pela Posição de Cliente', () => {
  let findFirst: jest.Mock;
  let service: NotasEntradaService;

  beforeEach(() => {
    findFirst = jest.fn().mockResolvedValue({ id: 'n1' });
    const tx = { notaEntrada: { findFirst } };
    const prisma = {
      withTenant: (_: string, fn: (t: typeof tx) => unknown) => fn(tx),
    } as unknown as PrismaService;
    service = new NotasEntradaService(prisma);
    escopoMock.mockReset();
  });

  const whereUsado = (): Record<string, unknown> =>
    (findFirst.mock.calls[0] as [{ where: Record<string, unknown> }])[0].where;

  it('quem tem notas-entrada.visualizar vê qualquer nota', async () => {
    await service.findOne('emp-1', usuario(['notas-entrada.visualizar']), 'n1');
    expect(whereUsado()).toEqual({
      id: 'n1',
      empresaId: 'emp-1',
      deletedAt: null,
    });
    expect(escopoMock).not.toHaveBeenCalled();
  });

  it('pela Posição: só devolução de cliente da carteira', async () => {
    escopoMock.mockResolvedValue(['v1', 'v2']);
    await service.findOne(
      'emp-1',
      usuario(['posicao-cliente.visualizar']),
      'n1',
    );
    expect(whereUsado()).toMatchObject({
      tipo: 'D',
      cliente: { vendedorId: { in: ['v1', 'v2'] } },
    });
  });

  it('pela Posição com carteira inteira: ainda só devolução de cliente', async () => {
    escopoMock.mockResolvedValue(null);
    await service.findOne(
      'emp-1',
      usuario(['posicao-cliente.visualizar']),
      'n1',
    );
    expect(whereUsado()).toMatchObject({
      tipo: 'D',
      cliente: { isNot: null },
    });
  });
});
