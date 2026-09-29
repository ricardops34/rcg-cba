import { Prisma } from '@prisma/client';
import {
  corteDeVenda,
  lerLista,
  montarCorteDeVenda,
  PARAMETRO_CFOPS_EXCLUIDOS,
  PARAMETRO_SERIES_DE_VENDA,
} from './venda-analitica';

const SEM_CORTE = { series: null, cfopsExcluidos: null };

/** Texto do SQL com os valores no lugar dos placeholders, para inspecionar. */
const textoSql = (partes: Prisma.Sql[]) =>
  partes.map((s) => `${s.sql} ${JSON.stringify(s.values)}`).join(' | ');

describe('venda-analitica — parâmetros de venda', () => {
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
      expect(lerLista('5908;6908 5908')).toEqual(['5908', '6908']);
    });
  });

  describe('montarCorteDeVenda', () => {
    it('sem parâmetros, não corta série nem CFOP', () => {
      const corte = montarCorteDeVenda(SEM_CORTE);
      expect(corte.nota).not.toHaveProperty('serie');
      expect(corte.item).not.toHaveProperty('AND');
      expect(corte.item.notaSaida).toEqual({ is: corte.nota });
      expect(textoSql(corte.notaSql)).not.toContain('serie');
      expect(textoSql(corte.itemSql)).not.toContain('cfop');
    });

    it('séries: cabeçalho, item e SQL recebem o mesmo corte', () => {
      const corte = montarCorteDeVenda({ series: ['1'], cfopsExcluidos: null });
      expect(corte.nota).toMatchObject({
        tipo: 'N',
        comodato: false,
        serie: { in: ['1'] },
      });
      expect(corte.item.notaSaida).toEqual({ is: corte.nota });

      const serie = corte.notaSql.find((s) => s.sql.includes('"serie"'));
      expect(serie?.sql).toBe('n."serie" IN (?)');
      expect(serie?.values).toEqual(['1']);
    });

    it('CFOPs excluídos saem do item, mas item sem CFOP continua contando', () => {
      const cfops = ['5908', '5910'];
      const corte = montarCorteDeVenda({ series: null, cfopsExcluidos: cfops });

      expect(corte.item.AND).toEqual([
        { OR: [{ cfop: null }, { cfop: { notIn: cfops } }] },
      ]);
      // O corte de CFOP é do item — o cabeçalho não muda.
      expect(corte.nota).not.toHaveProperty('cfop');

      const cfop = corte.itemSql.find((s) => s.sql.includes('"cfop"'));
      expect(cfop?.sql).toBe('(i."cfop" IS NULL OR i."cfop" NOT IN (?,?))');
      expect(cfop?.values).toEqual(cfops);
    });

    it('não altera o corte base entre chamadas', () => {
      montarCorteDeVenda({ series: ['1'], cfopsExcluidos: ['5908'] });
      const limpo = montarCorteDeVenda(SEM_CORTE);
      expect(limpo.nota).not.toHaveProperty('serie');
      expect(limpo.item).not.toHaveProperty('AND');
      expect(limpo.itemSql).toHaveLength(3);
    });
  });

  describe('corteDeVenda', () => {
    it('lê os dois parâmetros ativos da empresa numa consulta só', async () => {
      const findMany = jest.fn().mockResolvedValue([
        { parametro: PARAMETRO_SERIES_DE_VENDA, conteudo: '1' },
        { parametro: PARAMETRO_CFOPS_EXCLUIDOS, conteudo: '5908,5910' },
      ]);
      const tx = {
        parametroEmpresa: { findMany },
      } as unknown as Prisma.TransactionClient;

      const corte = await corteDeVenda(tx, 'emp-1');

      expect(findMany).toHaveBeenCalledTimes(1);
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            empresaId: 'emp-1',
            parametro: {
              in: [PARAMETRO_SERIES_DE_VENDA, PARAMETRO_CFOPS_EXCLUIDOS],
            },
            ativo: true,
            deletedAt: null,
          },
        }),
      );
      expect(corte.nota).toMatchObject({ serie: { in: ['1'] } });
      expect(corte.item.AND).toEqual([
        { OR: [{ cfop: null }, { cfop: { notIn: ['5908', '5910'] } }] },
      ]);
    });

    it('sem os parâmetros, conta todas as séries e todos os CFOPs', async () => {
      const tx = {
        parametroEmpresa: { findMany: jest.fn().mockResolvedValue([]) },
      } as unknown as Prisma.TransactionClient;

      const corte = await corteDeVenda(tx, 'emp-1');

      expect(corte.nota).not.toHaveProperty('serie');
      expect(corte.item).not.toHaveProperty('AND');
    });
  });
});
