import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { criarOuReativar, gravarUnico } from './unicidade';
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
  const montar = (
    regra: {
      id: string;
      chave: string | null;
      padrao?: boolean;
      codigoErp?: string | null;
    },
    emUso = 0,
  ) => {
    const tx = {
      regraDesconto: {
        findFirst: jest.fn().mockResolvedValue(regra),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn(),
      },
      regraDescontoFaixa: { deleteMany: jest.fn() },
      categoria: { count: jest.fn().mockResolvedValue(emUso) },
      produto: { count: jest.fn().mockResolvedValue(0) },
      tabelaPrecoItem: { count: jest.fn().mockResolvedValue(0) },
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

  it('regra em uso por categoria/produto/tabela não é excluída (409)', async () => {
    const { servico, tx } = montar({ id: 'r3', chave: null }, 2);
    await expect(servico.remove('e1', user, 'r3')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.regraDesconto.update).not.toHaveBeenCalled();
  });

  it('a regra padrão não é excluída, desmarcada nem desativada', async () => {
    const { servico, tx } = montar({ id: 'r4', chave: null, padrao: true });
    await expect(servico.remove('e1', user, 'r4')).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(
      servico.update('e1', user, 'r4', { padrao: false }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      servico.update('e1', user, 'r4', { ativo: false }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.regraDesconto.update).not.toHaveBeenCalled();
  });

  it('o código não muda enquanto a regra está em uso', async () => {
    const { servico, tx } = montar(
      { id: 'r5', chave: null, codigoErp: 'A' },
      3,
    );
    await expect(
      servico.update('e1', user, 'r5', { codigoErp: 'B' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.regraDesconto.update).not.toHaveBeenCalled();
  });

  it('a tela não toma o padrão de uma regra do ERP', async () => {
    const { servico, tx } = montar({ id: 'r6', chave: null });
    // 1ª busca = a própria regra; 2ª = a padrão do ERP
    tx.regraDesconto.findFirst
      .mockResolvedValueOnce({ id: 'r6', chave: null, padrao: false, codigoErp: null })
      .mockResolvedValueOnce({ descricao: 'Padrão ERP' });
    await expect(
      servico.update('e1', user, 'r6', { padrao: true }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.regraDesconto.updateMany).not.toHaveBeenCalled();
  });
});

describe('unicidade das tabelas globais', () => {
  const violacao = () =>
    new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'x',
    });

  it('código repetido vira 409, não 500', async () => {
    await expect(
      gravarUnico(() => Promise.reject(violacao()), 'Já existe'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('outro erro passa como está', async () => {
    const outro = new Error('queda');
    await expect(gravarUnico(() => Promise.reject(outro), 'x')).rejects.toBe(
      outro,
    );
  });

  it('criar sobre registro excluído reativa a linha em vez de criar outra', async () => {
    const reativar = jest.fn().mockResolvedValue('reativado');
    const criar = jest.fn().mockResolvedValue('criado');
    const r = await criarOuReativar({
      achaExcluido: () => Promise.resolve({ id: 'antigo' }),
      reativar,
      criar,
      jaExiste: 'x',
    });
    expect(r).toBe('reativado');
    expect(reativar).toHaveBeenCalledWith('antigo');
    expect(criar).not.toHaveBeenCalled();
  });

  it('sem excluído, cria', async () => {
    const criar = jest.fn().mockResolvedValue('criado');
    const r = await criarOuReativar({
      achaExcluido: () => Promise.resolve(null),
      reativar: jest.fn(),
      criar,
      jaExiste: 'x',
    });
    expect(r).toBe('criado');
  });
});
