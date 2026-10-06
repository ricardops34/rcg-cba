import { sessaoDoUsuarioWhere } from './escopo-whatsapp';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import type { TenantTx } from '../../common/prisma/prisma.service';

/**
 * A instância de WhatsApp é da empresa + usuário + vendedor (decisão do
 * usuário, 06/10/2026). Estes testes prendem que nenhum perfil — nem o
 * administrador — alarga esse recorte: equipe só no Gerencial, em leitura.
 */
describe('sessaoDoUsuarioWhere', () => {
  const usuario = (extra: Partial<AuthenticatedUser> = {}) =>
    ({
      id: 'usuario-1',
      isAdmin: false,
      permissoes: [],
      ...extra,
    }) as unknown as AuthenticatedUser;

  const txCom = (vendedor: { id: string } | null) => {
    const findFirst = jest.fn().mockResolvedValue(vendedor);
    return { tx: { vendedor: { findFirst } } as unknown as TenantTx, findFirst };
  };

  it('recorta pela empresa, pelo vendedor do usuário e pelo próprio usuário', async () => {
    const { tx, findFirst } = txCom({ id: 'vendedor-1' });

    await expect(sessaoDoUsuarioWhere(tx, 'empresa-1', usuario())).resolves.toEqual({
      empresaId: 'empresa-1',
      tipo: 'vendedor',
      vendedorId: 'vendedor-1',
      usuarioId: 'usuario-1',
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { usuarioId: 'usuario-1', empresaId: 'empresa-1', deletedAt: null },
      }),
    );
  });

  it('sem cadastro de vendedor não vê nada — nem o administrador', async () => {
    const { tx } = txCom(null);
    await expect(
      sessaoDoUsuarioWhere(tx, 'empresa-1', usuario({ isAdmin: true })),
    ).resolves.toBeNull();
  });

  it('a permissão de equipe não alarga o recorte', async () => {
    const { tx } = txCom({ id: 'vendedor-1' });
    const where = await sessaoDoUsuarioWhere(
      tx,
      'empresa-1',
      usuario({ permissoes: ['whatsapp-equipe.visualizar'] }),
    );
    expect(where).toMatchObject({ vendedorId: 'vendedor-1', usuarioId: 'usuario-1' });
  });
});
