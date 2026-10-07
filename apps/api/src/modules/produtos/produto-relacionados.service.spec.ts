import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { ProdutoRelacionadosService } from './produto-relacionados.service';

type Cat = { descricao: string; equipamentoComodato: boolean } | null;

/**
 * Produto de categoria de equipamento não entra como aplicável — e a regra
 * vale para qualquer tela que grave a relação, porque mora no service.
 */
describe('ProdutoRelacionadosService.criar — categoria de equipamento', () => {
  function montar(categoria: Cat, subCategoria: Cat) {
    const create = jest.fn().mockResolvedValue({ id: 'rel-1' });
    const tx = {
      produto: {
        findMany: jest.fn().mockResolvedValue([{ id: 'eq' }, { id: 'p' }]),
        findFirst: jest.fn().mockResolvedValue({
          descricao: 'DISP. SABONETE',
          categoria,
          subCategoria,
        }),
      },
      produtoRelacionado: { findFirst: jest.fn(), create },
    };
    const prisma = {
      withTenant: (_: string, fn: (t: typeof tx) => unknown) => fn(tx),
    } as unknown as PrismaService;
    return { service: new ProdutoRelacionadosService(prisma), create };
  }

  const aplicacao = {
    relacionadoId: 'p',
    tipo: 'aplicacao' as const,
    ordem: 0,
  };

  it('recusa quando a categoria do produto está marcada', async () => {
    const { service, create } = montar(
      { descricao: 'SABONETEIRAS', equipamentoComodato: true },
      null,
    );
    await expect(service.criar('emp', 'u', 'eq', aplicacao)).rejects.toThrow(
      BadRequestException,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('recusa quando só a subcategoria está marcada', async () => {
    const { service } = montar(
      { descricao: 'HIGIENE', equipamentoComodato: false },
      { descricao: 'DISPENSERS', equipamentoComodato: true },
    );
    await expect(service.criar('emp', 'u', 'eq', aplicacao)).rejects.toThrow(
      /DISPENSERS/,
    );
  });

  it('aceita produto de categoria não marcada', async () => {
    const { service, create } = montar(
      { descricao: 'PAPEIS', equipamentoComodato: false },
      null,
    );
    await service.criar('emp', 'u', 'eq', aplicacao);
    expect(create).toHaveBeenCalled();
  });

  it('não se aplica ao similar', async () => {
    const { service, create } = montar(
      { descricao: 'SABONETEIRAS', equipamentoComodato: true },
      null,
    );
    await service.criar('emp', 'u', 'eq', { ...aplicacao, tipo: 'similar' });
    expect(create).toHaveBeenCalled();
  });
});
