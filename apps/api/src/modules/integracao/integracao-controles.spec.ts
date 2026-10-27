import { ForbiddenException } from '@nestjs/common';
import { integracaoEndpointToggleSchema } from '@plataforma/contracts';
import { IntegracaoCargasService } from './cargas/integracao-cargas.service';
import { IntegracaoFileService } from './import/integracao-file.service';

/**
 * Controles da integração com o ERP (docs/planos/2026-10-16-correcoes-integracao-reversa.md,
 * etapas 1, 2, 4 e 5): o que desliga ou recusa precisa valer também fora de
 * uma requisição autenticada.
 */
describe('integração — controles de endpoint, chave e arquivo', () => {
  describe('conferirEndpointsAtivos (4.1)', () => {
    it('lê dentro de withTenant: a tabela tem RLS e o processador roda sem requisição', async () => {
      const findMany = jest.fn().mockResolvedValue([{ endpointKey: 'titulos-receber' }]);
      const withTenant = jest.fn((_: string, fn: (tx: unknown) => unknown) =>
        fn({ integracaoEndpointConfig: { findMany } }),
      );
      const servico = new IntegracaoCargasService({ withTenant } as never);

      await expect(
        servico.conferirEndpointsAtivos('e1', ['titulos-receber']),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(withTenant).toHaveBeenCalledWith('e1', expect.any(Function));
    });

    it('deixa passar quando nenhum está desligado', async () => {
      const withTenant = jest.fn((_: string, fn: (tx: unknown) => unknown) =>
        fn({ integracaoEndpointConfig: { findMany: jest.fn().mockResolvedValue([]) } }),
      );
      const servico = new IntegracaoCargasService({ withTenant } as never);

      await expect(
        servico.conferirEndpointsAtivos('e1', ['clientes']),
      ).resolves.toBeUndefined();
    });
  });

  describe('alternar endpoint (K.2)', () => {
    it('exige ativo booleano: ausência e texto não viram "ligar" ou "desligar"', () => {
      expect(integracaoEndpointToggleSchema.safeParse({}).success).toBe(false);
      expect(integracaoEndpointToggleSchema.safeParse({ ativo: 'false' }).success).toBe(false);
      expect(integracaoEndpointToggleSchema.safeParse({ ativo: false }).success).toBe(true);
    });
  });

  describe('arquivo/importar (4.2)', () => {
    const montar = (desligados: string[] = []) => {
      const upsert = jest.fn().mockResolvedValue({ decisao: 'criar' });
      const produtos = { upsert, remove: jest.fn() };
      const cargas = {
        conferirEndpointsAtivos: jest.fn(async (_e: string, entidades: string[]) => {
          const barrados = entidades.filter((e) => desligados.includes(e));
          if (barrados.length) throw new ForbiddenException(`Endpoint desativado: ${barrados.join(',')}`);
        }),
      };
      const entidades = {
        de: () => ({
          schema: {
            safeParse: (v: { chave?: unknown }) =>
              typeof v?.chave === 'string'
                ? { success: true, data: v }
                : { success: false, error: { issues: [{ path: ['chave'], message: 'obrigatório' }] } },
          },
        }),
      };
      const servico = new IntegracaoFileService(
        produtos as never, {} as never, {} as never, {} as never, {} as never,
        {} as never, {} as never, {} as never, {} as never, {} as never,
        {} as never, {} as never, {} as never, {} as never, {} as never,
        cargas as never, entidades as never,
      );
      return { servico, upsert, cargas };
    };

    it('linha que não é JSON e item sem entidade viram erro, não somem', async () => {
      const { servico, upsert } = montar();
      const arquivo = [
        JSON.stringify({ entidade: 'produtos', chave: 'A', payload: { chave: 'A' } }),
        'isto não é json',
        JSON.stringify({ chave: 'B', payload: {} }),
      ].join('\n');

      const r = await servico.importarArquivo('e1', 'k1', arquivo);

      expect(upsert).toHaveBeenCalledTimes(1);
      expect(r.total).toBe(3);
      expect(r.criados).toBe(1);
      expect(r.erros.map((e) => e.linha)).toEqual([2, 3]);
    });

    it('payload fora do schema do PUT vira erro da linha e não é gravado', async () => {
      const { servico, upsert } = montar();
      const arquivo = JSON.stringify({ entidade: 'produtos', chave: 'A', payload: { descricao: 'sem chave' } });

      const r = await servico.importarArquivo('e1', 'k1', arquivo);

      expect(upsert).not.toHaveBeenCalled();
      expect(r.erros[0].mensagem).toContain('chave: obrigatório');
    });

    it('endpoint desligado recusa o arquivo inteiro, sem aplicar nada', async () => {
      const { servico, upsert } = montar(['produtos']);
      const arquivo = JSON.stringify({ entidade: 'produtos', chave: 'A', payload: { chave: 'A' } });

      await expect(servico.importarArquivo('e1', 'k1', arquivo)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(upsert).not.toHaveBeenCalled();
    });
  });
});

describe('processador de cargas — chave revogada no meio (K.1)', () => {
  it('encerra a carga com erro e não aplica o bloco', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { CargasProcessador } = require('./cargas/cargas-processador.service');
    const carga = {
      arquivo: Buffer.from(JSON.stringify({ entidade: 'categorias', registro: { chave: '01-1' } })),
      apiKeyId: 'k1',
      ultimaLinha: 0,
      tentativas: 1,
    };
    const atualizacoes: unknown[] = [];
    const tx = {
      integracaoCarga: {
        findFirstOrThrow: jest.fn().mockResolvedValue(carga),
        update: jest.fn(async (a: unknown) => {
          atualizacoes.push(a);
          return {};
        }),
      },
    };
    const prisma = { withTenant: (_e: string, fn: (t: unknown) => unknown) => fn(tx) };
    const aplicar = jest.fn();
    const entidades = { de: () => ({ schema: { safeParse: () => ({ success: true, data: {} }) }, aplicar }) };
    const cargas = {
      conferirChave: jest.fn().mockRejectedValue(new Error('Chave de API não encontrada, inativa ou de outra empresa.')),
      conferirEndpointsAtivos: jest.fn().mockResolvedValue(undefined),
    };
    const processador = new CargasProcessador(prisma, entidades, cargas);

    await (processador as unknown as { processar: (e: string, c: string) => Promise<void> }).processar('e1', 'c1');

    expect(aplicar).not.toHaveBeenCalled();
    expect(JSON.stringify(atualizacoes)).toContain('"situacao":"erro"');
    expect(JSON.stringify(atualizacoes)).toContain('Chave de API');
  });
});
