import { Prisma } from '@prisma/client';
import {
  corteDeVenda,
  lerLista,
  montarCorteDeVenda,
  PARAMETRO_SERIES_DE_VENDA,
} from './venda-analitica';

const SEM_CORTE = { series: null };

/** Texto do SQL com os valores no lugar dos placeholders, para inspecionar. */
const textoSql = (partes: Prisma.Sql[]) =>
  partes.map((s) => `${s.sql} ${JSON.stringify(s.values)}`).join(' | ');

describe('venda-analitica — o que conta como venda', () => {
  describe('lerLista', () => {
    it('vazio ou nulo é "sem corte", não "lista vazia"', () => {
      expect(lerLista(null)).toBeNull();
      expect(lerLista(undefined)).toBeNull();
      expect(lerLista('')).toBeNull();
      expect(lerLista(' , ')).toBeNull();
    });

    it('aceita vírgula, ponto e vírgula e espaço, sem repetir', () => {
      expect(lerLista('1')).toEqual(['1']);
      expect(lerLista(' 1, 3 ')).toEqual(['1', '3']);
      expect(lerLista('1;3 1')).toEqual(['1', '3']);
    });
  });

  describe('montarCorteDeVenda', () => {
    it('a nota conta se gerou duplicata; sem a informação, cai na condição de pagamento', () => {
      const corte = montarCorteDeVenda(SEM_CORTE);

      expect(corte.nota).toMatchObject({
        tipo: 'N',
        comodato: false,
        AND: [
          {
            OR: [
              { geraDuplicata: true },
              { geraDuplicata: null, condicaoPagamentoId: { not: null } },
            ],
          },
        ],
      });
      // O critério antigo não pode valer sozinho: nota de comodato tem
      // condição de pagamento e não gera duplicata.
      expect(corte.nota).not.toHaveProperty('condicaoPagamentoId');
      expect(textoSql(corte.notaSql)).toContain(
        '(n."geraDuplicata" = true OR (n."geraDuplicata" IS NULL AND n."condicaoPagamentoId" IS NOT NULL))',
      );
    });

    it('não há corte por CFOP: os itens de uma nota de venda contam todos', () => {
      const corte = montarCorteDeVenda(SEM_CORTE);
      expect(JSON.stringify(corte.item)).not.toContain('cfop');
      expect(textoSql(corte.itemSql)).not.toContain('cfop');
    });

    it('sem séries, não restringe a série', () => {
      const corte = montarCorteDeVenda(SEM_CORTE);
      expect(corte.nota).not.toHaveProperty('serie');
      expect(corte.item.notaSaida).toEqual({ is: corte.nota });
      expect(textoSql(corte.notaSql)).not.toContain('serie');
    });

    it('séries: cabeçalho, item e SQL recebem o mesmo corte', () => {
      const corte = montarCorteDeVenda({ series: ['1'] });
      expect(corte.nota).toMatchObject({ serie: { in: ['1'] } });
      expect(corte.item.notaSaida).toEqual({ is: corte.nota });

      const serie = corte.notaSql.find((s) => s.sql.includes('"serie"'));
      expect(serie?.sql).toBe('n."serie" IN (?)');
      expect(serie?.values).toEqual(['1']);
    });

    it('categoria em branco conta — o filtro não usa NOT, que descarta o nulo', () => {
      const corte = montarCorteDeVenda(SEM_CORTE);
      // `NOT (usado = false)` com usado nulo dá nulo e some com o item: foi o
      // que tirou a categoria PECAS do Dashboard até 2026-09-29.
      expect(JSON.stringify(corte.item)).not.toContain('"NOT"');
      expect(corte.item.AND).toEqual([
        {
          OR: [
            { produtoId: null },
            { produto: { is: { categoriaId: null } } },
            {
              produto: {
                is: {
                  categoria: { is: { OR: [{ usado: null }, { usado: true }] } },
                },
              },
            },
          ],
        },
      ]);
      expect(textoSql(corte.itemSql)).toContain(
        'cat."usado" IS DISTINCT FROM false',
      );
    });

    it('não altera o corte base entre chamadas', () => {
      montarCorteDeVenda({ series: ['1'] });
      const limpo = montarCorteDeVenda(SEM_CORTE);
      expect(limpo.nota).not.toHaveProperty('serie');
      expect(limpo.itemSql).toHaveLength(3);
    });
  });

  describe('corteDeVenda', () => {
    it('lê o parâmetro de séries ativo da empresa', async () => {
      const findFirst = jest.fn().mockResolvedValue({ conteudo: '1' });
      const tx = {
        parametroEmpresa: { findFirst },
      } as unknown as Prisma.TransactionClient;

      const corte = await corteDeVenda(tx, 'emp-1');

      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            empresaId: 'emp-1',
            parametro: PARAMETRO_SERIES_DE_VENDA,
            ativo: true,
            deletedAt: null,
          },
        }),
      );
      expect(corte.nota).toMatchObject({ serie: { in: ['1'] } });
    });

    it('sem o parâmetro, conta todas as séries', async () => {
      const tx = {
        parametroEmpresa: { findFirst: jest.fn().mockResolvedValue(null) },
      } as unknown as Prisma.TransactionClient;

      const corte = await corteDeVenda(tx, 'emp-1');

      expect(corte.nota).not.toHaveProperty('serie');
    });
  });
});
