import { ForbiddenException } from '@nestjs/common';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { RegrasDescontoService } from './regras-desconto/regras-desconto.service';
import { EstadosController } from './estados/estados.controller';
import { MunicipiosController } from './municipios/municipios.controller';
import { PaisesController } from './paises/paises.controller';
import { CnaesController } from './cnaes/cnaes.controller';
import { CepsController } from './ceps/ceps.controller';

/** Decisões de 06/11/2026: tabelas globais só da plataforma; regra do ERP só no ERP. */
describe('tabelas globais: escrita só da plataforma', () => {
  type Ctrl = { prototype: Record<string, () => void> };
  const guardsDe = (c: Ctrl, metodo: string): unknown[] =>
    (Reflect.getMetadata('__guards__', c.prototype[metodo]) as
      unknown[] | undefined) ?? [];
  const controllers: Array<[string, Ctrl]> = [
    ['estados', EstadosController as unknown as Ctrl],
    ['municipios', MunicipiosController as unknown as Ctrl],
    ['paises', PaisesController as unknown as Ctrl],
    ['cnaes', CnaesController as unknown as Ctrl],
    ['ceps', CepsController as unknown as Ctrl],
  ];

  it.each(controllers)(
    '%s: criar, editar e excluir exigem administrador da plataforma',
    (_nome, controller) => {
      for (const metodo of ['create', 'update', 'remove']) {
        const guards = guardsDe(controller, metodo);
        expect(guards).toContain(PlatformAdminGuard);
      }
    },
  );

  it.each(controllers)(
    '%s: leitura continua liberada às empresas',
    (_n, controller) => {
      for (const metodo of ['findAll', 'findOne']) {
        const guards = guardsDe(controller, metodo);
        expect(guards).not.toContain(PlatformAdminGuard);
      }
    },
  );
});

describe('regras de desconto: a tela só mexe no que criou', () => {
  const montar = (regra: { id: string; chave: string | null }) => {
    const tx = {
      regraDesconto: {
        findFirst: jest.fn().mockResolvedValue(regra),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn(),
      },
      regraDescontoFaixa: { deleteMany: jest.fn() },
    };
    const prisma = {
      withTenant: (_e: string, fn: (t: typeof tx) => unknown) => fn(tx),
    };
    return { servico: new RegrasDescontoService(prisma as never), tx };
  };
  const user = { id: 'u1' } as never;

  it('regra do ERP (com chave) não edita nem exclui', async () => {
    const { servico, tx } = montar({ id: 'r1', chave: '-01' });
    await expect(
      servico.update('e1', user, 'r1', { descricao: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(servico.remove('e1', user, 'r1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(tx.regraDesconto.update).not.toHaveBeenCalled();
    expect(tx.regraDescontoFaixa.deleteMany).not.toHaveBeenCalled();
  });

  it('regra criada na tela (sem chave) edita e exclui', async () => {
    const { servico, tx } = montar({ id: 'r2', chave: null });
    await servico.update('e1', user, 'r2', { descricao: 'x' });
    await servico.remove('e1', user, 'r2');
    expect(tx.regraDesconto.update).toHaveBeenCalledTimes(2);
  });
});
