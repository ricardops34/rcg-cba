import {
  ErrosLogService,
  normalizarMensagem,
  normalizarRota,
} from './erros-log.service';
import type { PrismaService } from '../../common/prisma/prisma.service';

/**
 * O que estes testes protegem é o que faz a tela ser útil ou inútil.
 *
 * Um log de erros falha de duas maneiras, e as duas são silenciosas: agrupa
 * demais (erros diferentes viram um só e o novo se esconde no contador) ou
 * agrupa de menos (o mesmo erro em dez clientes vira dez linhas e empurra
 * todo o resto para fora da primeira página, que é a única que alguém olha).
 */
describe('Log de erros — normalização e agrupamento', () => {
  describe('normalizarRota', () => {
    it('troca uuid por :id, para o mesmo erro em clientes diferentes agrupar', () => {
      expect(
        normalizarRota(
          '/api/v1/clientes/8f2c1a4e-5b6d-4e7f-9a0b-1c2d3e4f5a6b/contatos',
        ),
      ).toBe('/api/v1/clientes/:id/contatos');
    });

    it('troca segmento numérico por :id', () => {
      expect(normalizarRota('/api/v1/orcamentos/1042/itens/7')).toBe(
        '/api/v1/orcamentos/:id/itens/:id',
      );
    });

    it('descarta a query string, que varia a cada chamada', () => {
      expect(normalizarRota('/api/v1/clientes?page=3&search=andrade')).toBe(
        '/api/v1/clientes',
      );
    });

    it('não mexe em segmento que só parece id', () => {
      expect(normalizarRota('/api/v1/plataforma/erros/config')).toBe(
        '/api/v1/plataforma/erros/config',
      );
    });
  });

  describe('normalizarMensagem', () => {
    it('junta a mesma falha com ids diferentes', () => {
      const a = normalizarMensagem(
        'Cliente 8f2c1a4e-5b6d-4e7f-9a0b-1c2d3e4f5a6b não encontrado',
      );
      const b = normalizarMensagem(
        'Cliente 11112222-3333-4444-5555-666677778888 não encontrado',
      );
      expect(a).toBe(b);
    });

    it('junta a mesma falha com números diferentes', () => {
      expect(normalizarMensagem('Timeout após 30000 ms')).toBe(
        normalizarMensagem('Timeout após 45000 ms'),
      );
    });

    it('separa mensagens que são realmente diferentes', () => {
      expect(normalizarMensagem('Cliente não encontrado')).not.toBe(
        normalizarMensagem('Produto não encontrado'),
      );
    });

    it('corta o texto longo, que não acrescenta diagnóstico', () => {
      expect(normalizarMensagem('x'.repeat(1000)).length).toBe(300);
    });
  });

  /**
   * A defesa contra o cenário que o plano previu: um bug em laço gera
   * milhares de eventos em minutos. Gravar linha a linha transformaria um erro
   * em uma falha de disponibilidade.
   */
  describe('colapso de rajada', () => {
    function montar() {
      const criadas: unknown[] = [];
      const atualizacoes: unknown[] = [];
      const prisma = {
        erroLog: {
          create: jest.fn(({ data }: { data: unknown }) => {
            criadas.push(data);
            return Promise.resolve({ id: `linha-${criadas.length}` });
          }),
          updateMany: jest.fn((args: unknown) => {
            atualizacoes.push(args);
            return Promise.resolve({ count: 1 });
          }),
        },
        empresa: {
          findUnique: jest.fn(() => Promise.resolve({ razaoSocial: 'ACME' })),
        },
        erroLogConfig: { findUnique: jest.fn(() => Promise.resolve(null)) },
      } as unknown as PrismaService;

      return { prisma, criadas, atualizacoes };
    }

    const erro = {
      tipo: 'excecao' as const,
      rota: '/api/v1/clientes',
      metodo: 'GET',
      status: 500,
      mensagem: 'Falha ao consultar',
      empresaId: 'e-1',
    };

    it('a repetição vira contador, não linha nova', async () => {
      const { prisma, criadas, atualizacoes } = montar();
      const service = new ErrosLogService(prisma);

      // `registrarDoServidor` não espera a gravação de propósito (a resposta
      // ao usuário não pode ficar atrás de um INSERT), então o teste chama o
      // caminho e aguarda a fila de microtarefas esvaziar.
      service.registrarDoServidor(erro);
      await new Promise((r) => setImmediate(r));
      service.registrarDoServidor(erro);
      await new Promise((r) => setImmediate(r));
      service.registrarDoServidor(erro);
      await new Promise((r) => setImmediate(r));

      expect(criadas).toHaveLength(1);
      expect(atualizacoes).toHaveLength(2);
    });

    it('erro diferente na mesma janela continua sendo linha própria', async () => {
      const { prisma, criadas } = montar();
      const service = new ErrosLogService(prisma);

      service.registrarDoServidor(erro);
      await new Promise((r) => setImmediate(r));
      service.registrarDoServidor({ ...erro, mensagem: 'Outra falha' });
      await new Promise((r) => setImmediate(r));

      expect(criadas).toHaveLength(2);
    });
  });

  /**
   * O relógio do navegador é do usuário, não do servidor. Um adiantado criaria
   * um erro "do futuro", fixo no topo da tela para sempre — a listagem ordena
   * pela data da ocorrência.
   */
  describe('erro do cliente com relógio adiantado', () => {
    it('usa a hora de chegada quando a informada está no futuro', async () => {
      const criadas: { ocorridoEm: Date }[] = [];
      const prisma = {
        erroLog: {
          create: jest.fn(({ data }: { data: { ocorridoEm: Date } }) => {
            criadas.push(data);
            return Promise.resolve({ id: 'linha-1' });
          }),
          updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
        },
        empresa: { findUnique: jest.fn(() => Promise.resolve(null)) },
      } as unknown as PrismaService;

      const service = new ErrosLogService(prisma);
      const futuro = new Date(Date.now() + 48 * 60 * 60 * 1000);

      await service.registrarDoCliente(
        [
          {
            tipo: 'rede',
            ocorridoEm: futuro.toISOString(),
            rota: '/api/v1/agente/config',
            mensagem: 'Failed to fetch',
          },
        ],
        { usuarioId: 'u-1', usuarioEmail: 'a@b.com', empresaId: null },
      );

      expect(criadas).toHaveLength(1);
      expect(criadas[0].ocorridoEm.getTime()).toBeLessThan(futuro.getTime());
    });
  });
});
