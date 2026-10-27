import { ConflictException, NotFoundException } from '@nestjs/common';
import { integracaoApiKeyCreateSchema } from '@plataforma/contracts';
import { resolverProduto } from './common/resolver-produto';
import { IntegracaoNotasSaidaService } from './notas-saida/integracao-notas-saida.service';
import { IntegracaoEstoqueService } from './estoque/integracao-estoque.service';
import { IntegracaoOrcamentosService } from './orcamentos/integracao-orcamentos.service';

/**
 * Gravação da integração com o ERP (docs/planos/2026-10-16-correcoes-integracao-reversa.md,
 * etapas 7, 8, 10, 11 e 13): o que gravava no registro errado, em silêncio.
 */
describe('integração — gravação sem erro silencioso', () => {
  describe('resolverProduto (4.6)', () => {
    const tx = (porChave: unknown, porCodigo: unknown = null) => ({
      produto: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(porChave)
          .mockResolvedValueOnce(porCodigo),
      },
    });

    it('não acha produto por trecho do código: chave inexistente é 404', async () => {
      const t = tx(null, null);
      await expect(resolverProduto(t as never, 'e1', '1')).rejects.toBeInstanceOf(NotFoundException);
      // Só igualdade: nenhuma das duas consultas usa "contains".
      for (const [arg] of t.produto.findFirst.mock.calls as [{ where: object }][]) {
        expect(JSON.stringify(arg.where)).not.toContain('contains');
      }
    });

    it('a chave tem precedência sobre o código ERP', async () => {
      const t = tx({ id: 'p-chave', chave: '01-A' });
      const r = await resolverProduto(t as never, 'e1', ' 01-A ');
      expect(r.id).toBe('p-chave');
      expect(t.produto.findFirst).toHaveBeenCalledTimes(1);
    });
  });

  describe('orçamento aprovado na plataforma (4.7)', () => {
    const montar = (existente: Record<string, unknown> | null) => {
      const tx = {
        orcamento: {
          findFirst: jest.fn().mockResolvedValue(existente),
          update: jest.fn().mockResolvedValue({}),
        },
      };
      const prisma = { withTenant: (_e: string, fn: (t: unknown) => unknown) => fn(tx) };
      return {
        tx,
        servico: new IntegracaoOrcamentosService(prisma as never, {} as never),
      };
    };

    it('o ERP não exclui orçamento aprovado criado por usuário', async () => {
      const { servico, tx } = montar({
        id: 'o1', status: 'aprovado', origem: 'vendedor', createdBy: 'user-1', deletedAt: null,
      });
      await expect(servico.remove('e1', 'k1', 'CH')).rejects.toBeInstanceOf(ConflictException);
      expect(tx.orcamento.update).not.toHaveBeenCalled();
    });

    it('orçamento aprovado que o próprio ERP criou continua livre', async () => {
      const { servico, tx } = montar({
        id: 'o1', status: 'aprovado', origem: 'vendedor', createdBy: 'integracao:k1', deletedAt: null,
      });
      await servico.remove('e1', 'k1', 'CH');
      expect(tx.orcamento.update).toHaveBeenCalled();
    });
  });

  describe('nota de saída: PATCH só do cabeçalho (4.8)', () => {
    it('leva cliente, vendedor e emissão para os itens', async () => {
      const existente = { id: 'n1', tipo: 'N', clienteId: 'c1', vendedorId: 'v1', dtEmissao: null };
      const atualizada = {
        id: 'n1', clienteId: 'c1', vendedorId: 'v2',
        dtEmissao: new Date('2026-10-05'), ano: 2026, mes: 10,
      };
      const tx = {
        notaSaida: {
          findFirst: jest.fn().mockResolvedValue(existente),
          update: jest.fn().mockResolvedValue(atualizada),
        },
        notaSaidaItem: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) },
        vendedor: { findFirst: jest.fn().mockResolvedValue({ id: 'v2' }) },
      };
      const prisma = { withTenant: (_e: string, fn: (t: unknown) => unknown) => fn(tx) };
      const servico = new IntegracaoNotasSaidaService(prisma as never);
      jest.spyOn(servico as never, 'resolverRefs' as never).mockResolvedValue(
        { clienteId: null, fornecedorId: null, vendedorId: 'v2', condicaoPagamentoId: null } as never,
      );
      jest.spyOn(servico as never, 'paraLeitura' as never).mockReturnValue({} as never);

      await servico.update('e1', 'k1', 'CH', { vendedorChave: '000035', dtEmissao: new Date('2026-10-05') } as never);

      expect(tx.notaSaidaItem.updateMany).toHaveBeenCalledWith({
        where: { notaSaidaId: 'n1' },
        data: { clienteId: 'c1', vendedorId: 'v2', dtEmissao: atualizada.dtEmissao, ano: 2026, mes: 10 },
      });
    });
  });

  describe('estoque (4.9)', () => {
    it('chave de uma linha e par produto × armazém de outra: recusa, não atualiza ao acaso', async () => {
      const tx = {
        produto: { findFirst: jest.fn().mockResolvedValue({ id: 'p1', chave: 'P' }) },
        armazem: { findFirst: jest.fn().mockResolvedValue({ id: 'a1' }) },
        estoque: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce({ id: 'e-chave', chave: 'X' })
            .mockResolvedValueOnce({ id: 'e-par', chave: 'Y' }),
          update: jest.fn(),
          create: jest.fn(),
        },
      };
      const prisma = { withTenant: (_e: string, fn: (t: unknown) => unknown) => fn(tx) };
      const servico = new IntegracaoEstoqueService(prisma as never);

      await expect(
        servico.upsert('e1', 'k1', { chave: 'X', produtoChave: 'P', armazemChave: 'A', saldo: 1, dataEnvio: new Date() } as never),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.estoque.update).not.toHaveBeenCalled();
      expect(tx.estoque.create).not.toHaveBeenCalled();
    });
  });

  describe('chave de API (K.3)', () => {
    it('não nasce com data de expiração no passado', () => {
      expect(integracaoApiKeyCreateSchema.safeParse({ nome: 'ERP', expiraEm: '2020-01-01' }).success).toBe(false);
      expect(integracaoApiKeyCreateSchema.safeParse({ nome: 'ERP', expiraEm: '2999-01-01' }).success).toBe(true);
      expect(integracaoApiKeyCreateSchema.safeParse({ nome: 'ERP', expiraEm: null }).success).toBe(true);
    });
  });
});

describe('integração — vínculo e contagem do lote (4.10)', () => {
  it('vincular: quem perde a corrida não sobrescreve o vínculo', async () => {
    const tx = {
      orcamento: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: 'o1', chave: null, status: 'aprovado', itens: [{ id: 'i1' }] })
          .mockResolvedValueOnce(null),
        // Outra requisição já mudou a linha: nenhuma linha casa com "sem chave".
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      orcamentoItem: { update: jest.fn() },
    };
    const prisma = { withTenant: (_e: string, fn: (t: unknown) => unknown) => fn(tx) };
    const servico = new IntegracaoOrcamentosService(prisma as never, {} as never);

    await expect(
      servico.vincular('e1', 'k1', 'o1', { chave: '01-000123', itens: [{ id: 'i1', chave: '01-000123-01' }] } as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.orcamentoItem.update).not.toHaveBeenCalled();
  });

  it('pedido novo no lote conta como criado', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { IntegracaoPedidosService } = require('./pedidos/integracao-pedidos.service');
    const tx = { orcamento: { findFirst: jest.fn().mockResolvedValue(null) } };
    const prisma = { withTenant: (_e: string, fn: (t: unknown) => unknown) => fn(tx) };
    const servico = new IntegracaoPedidosService(prisma as never);
    jest.spyOn(servico, 'gravarHistorico').mockResolvedValue({ chave: 'P1' });

    const r = await servico.upsertLote('e1', 'k1', [{ chave: 'P1', situacao: 'aberto', itens: [], notas: [] }]);

    expect(r.criados).toBe(1);
    expect(r.atualizados).toBe(0);
  });
});
