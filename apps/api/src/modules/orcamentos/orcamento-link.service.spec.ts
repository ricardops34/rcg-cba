/* eslint-disable @typescript-eslint/no-unsafe-assignment -- matchers do jest devolvem any */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { OrcamentoLinkService } from './orcamento-link.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

jest.mock('../../common/escopo/escopo-vendedores', () => ({
  resolverEscopoVendedores: jest.fn().mockResolvedValue(null),
}));

const EMPRESA = '7f8226bb-7076-4c08-92f3-0693333d618e';
const TOKEN = `${EMPRESA}.abc`;
const AMANHA = new Date(Date.now() + 2 * 86_400_000);
const ONTEM = new Date(Date.now() - 3 * 86_400_000);

/** Orçamento e itens simulados; `regraMaxima` faz o desconto bater o limite. */
function montar(opcoes: {
  status?: string;
  dataValidade?: Date | null;
  autorizado?: boolean;
  descontoNoLimite?: boolean;
  itens?: number;
  link?: Record<string, unknown> | null;
  jaDecidido?: boolean;
  base?: string | null;
}) {
  const base = opcoes.base ?? null;
  const orc = {
    id: 'o1',
    empresaId: EMPRESA,
    status: opcoes.status ?? 'enviado',
    dataValidade:
      opcoes.dataValidade === undefined ? AMANHA : opcoes.dataValidade,
    descontoAutorizadoEm: opcoes.autorizado ? new Date() : null,
    titulo: 't',
    numero: 1,
    clienteId: 'c',
    vendedorId: 'v',
    oportunidadeId: null,
  };
  const link =
    opcoes.link === undefined
      ? {
          id: 'l1',
          empresaId: EMPRESA,
          orcamentoId: 'o1',
          revogadoEm: null,
          token: TOKEN,
        }
      : opcoes.link;
  const tx = {
    orcamento: {
      findFirst: jest.fn().mockResolvedValue(orc),
      findFirstOrThrow: jest.fn().mockResolvedValue(orc),
      update: jest.fn().mockResolvedValue(orc),
      updateMany: jest
        .fn()
        .mockResolvedValue({ count: opcoes.jaDecidido ? 0 : 1 }),
    },
    orcamentoItem: {
      count: jest.fn().mockResolvedValue(opcoes.itens ?? 2),
      findMany: jest.fn().mockResolvedValue([
        {
          percDesconto: opcoes.descontoNoLimite ? 20 : 5,
          regraDesconto: { percDescontoMaximo: 20 },
        },
      ]),
    },
    orcamentoLink: {
      findUnique: jest.fn().mockResolvedValue(link),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    atividade: { create: jest.fn().mockResolvedValue({}) },
    vendedor: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    usuario: { findFirst: jest.fn().mockResolvedValue(null) },
    notificacao: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    withTenant: (_e: string, fn: (t: unknown) => unknown) => fn(tx),
  };
  const servico = new OrcamentoLinkService(
    prisma as never,
    { obterTexto: jest.fn().mockResolvedValue(base) } as never,
  );
  return { servico, tx };
}

const usuario = {
  id: 'u1',
  empresaAtivaId: EMPRESA,
} as unknown as AuthenticatedUser;
const origem = { ip: '1.1.1.1', agente: 'teste' };

describe('OrcamentoLinkService — gerar', () => {
  it('desconto no limite sem autorização não gera link', async () => {
    const { servico, tx } = montar({ descontoNoLimite: true });
    await expect(servico.gerar(EMPRESA, usuario, 'o1')).rejects.toThrow(
      ConflictException,
    );
    expect(tx.orcamentoLink.create).not.toHaveBeenCalled();
  });

  it('desconto autorizado gera o link', async () => {
    const { servico, tx } = montar({
      descontoNoLimite: true,
      autorizado: true,
    });
    const r = await servico.gerar(EMPRESA, usuario, 'o1');
    expect(r.token.startsWith(`${EMPRESA}.`)).toBe(true);
    expect(tx.orcamentoLink.create).toHaveBeenCalled();
  });

  it('o endereço base vem do parâmetro, sem barra no fim', async () => {
    const { servico } = montar({ base: 'https://crm.empresa.com.br/' });
    const r = await servico.gerar(EMPRESA, usuario, 'o1');
    expect(r.url).toBe(`https://crm.empresa.com.br/o/${r.token}`);
  });

  it('rascunho vira enviado ao gerar', async () => {
    const { servico, tx } = montar({ status: 'rascunho' });
    await servico.gerar(EMPRESA, usuario, 'o1');
    expect(tx.orcamento.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'enviado' }),
      }),
    );
  });

  it.each(['aprovado', 'recusado', 'expirado'])(
    'orçamento %s não gera link',
    async (status) => {
      const { servico } = montar({ status });
      await expect(servico.gerar(EMPRESA, usuario, 'o1')).rejects.toThrow(
        ConflictException,
      );
    },
  );

  it('orçamento vencido e sem itens não geram link', async () => {
    await expect(
      montar({ dataValidade: ONTEM }).servico.gerar(EMPRESA, usuario, 'o1'),
    ).rejects.toThrow(ConflictException);
    await expect(
      montar({ itens: 0 }).servico.gerar(EMPRESA, usuario, 'o1'),
    ).rejects.toThrow(ConflictException);
  });
});

describe('OrcamentoLinkService — decidir', () => {
  it('aprova uma vez, gravando o canal link', async () => {
    const { servico, tx } = montar({});
    await expect(
      servico.decidir(TOKEN, 'aprovado', undefined, origem),
    ).resolves.toEqual({ situacao: 'aprovado' });
    expect(tx.orcamento.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'enviado',
          clienteDecididoEm: null,
        }),
        data: expect.objectContaining({
          clienteDecisaoCanal: 'link',
          status: 'aprovado',
        }),
      }),
    );
  });

  it('segunda resposta (corrida) é recusada', async () => {
    const { servico } = montar({ jaDecidido: true });
    await expect(
      servico.decidir(TOKEN, 'aprovado', undefined, origem),
    ).rejects.toThrow(ConflictException);
  });

  it('recusa exige justificativa', async () => {
    const { servico } = montar({});
    await expect(
      servico.decidir(TOKEN, 'recusado', '  ', origem),
    ).rejects.toThrow('justificativa');
  });

  it('orçamento já decidido, vencido, revogado ou com pendência não aceita resposta', async () => {
    const casos = [
      montar({ status: 'aprovado' }),
      montar({ dataValidade: ONTEM }),
      montar({
        link: {
          id: 'l1',
          empresaId: EMPRESA,
          orcamentoId: 'o1',
          revogadoEm: new Date(),
        },
      }),
      montar({ descontoNoLimite: true }),
    ];
    for (const { servico } of casos) {
      await expect(
        servico.decidir(TOKEN, 'aprovado', undefined, origem),
      ).rejects.toThrow(ConflictException);
    }
  });

  it('token malformado ou inexistente dá 404', async () => {
    await expect(
      montar({}).servico.decidir('lixo', 'aprovado', undefined, origem),
    ).rejects.toThrow(NotFoundException);
    await expect(
      montar({ link: null }).servico.decidir(
        TOKEN,
        'aprovado',
        undefined,
        origem,
      ),
    ).rejects.toThrow(NotFoundException);
  });
});
