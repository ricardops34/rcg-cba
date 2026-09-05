import { TriagemFuncionarioToolsService } from './triagem-funcionario-tools.service';
import type { TenantTx } from '../../../common/prisma/prisma.service';

/**
 * O que estes testes protegem é a única coisa que separa "o vendedor consulta
 * a carteira dele" de "o vendedor consulta a carteira dos outros".
 *
 * O escopo nunca vem do modelo: ele é resolvido pelo servidor a partir de quem
 * confirmou o número, e entra como filtro obrigatório em toda consulta. Uma
 * consulta que esqueça o filtro não falha nem parece errada — ela responde,
 * com dados de mais gente do que devia. Por isso o teste olha o `where` que
 * chega ao Prisma, e não o resultado.
 */
describe('Ferramentas de consulta do funcionário — recorte de carteira', () => {
  const ESCOPO = ['vend-1', 'vend-2'];
  const EMPRESA = 'emp-1';

  /** Guarda os `where` de cada modelo para o teste inspecionar. */
  function montarTx() {
    const wheres: Record<string, unknown[]> = {
      tituloReceber: [],
      atividade: [],
      cliente: [],
      whatsappConversa: [],
      objetivoVendedorMes: [],
      notaSaidaItem: [],
      sugestaoCompraGerada: [],
    };
    const registrar = (modelo: string) => (args: { where?: unknown }) => {
      wheres[modelo].push(args.where);
      return Promise.resolve([]);
    };

    const tx = {
      tituloReceber: {
        findMany: jest.fn(registrar('tituloReceber')),
        aggregate: jest.fn((args: { where?: unknown }) => {
          wheres.tituloReceber.push(args.where);
          return Promise.resolve({ _sum: { saldo: 0 }, _count: { _all: 0 } });
        }),
      },
      atividade: {
        findMany: jest.fn(registrar('atividade')),
        count: jest.fn((args: { where?: unknown }) => {
          wheres.atividade.push(args.where);
          return Promise.resolve(0);
        }),
        groupBy: jest.fn(registrar('atividade')),
      },
      cliente: { findMany: jest.fn(registrar('cliente')) },
      whatsappConversa: { findMany: jest.fn(registrar('whatsappConversa')) },
      objetivoVendedorMes: {
        findMany: jest.fn(registrar('objetivoVendedorMes')),
      },
      notaSaidaItem: { groupBy: jest.fn(registrar('notaSaidaItem')) },
      sugestaoCompraGerada: {
        findMany: jest.fn(registrar('sugestaoCompraGerada')),
      },
      vendedor: { findMany: jest.fn(() => Promise.resolve([])) },
      $queryRaw: jest.fn(() => Promise.resolve([])),
    } as unknown as TenantTx;

    return { tx, wheres };
  }

  const tools = new TriagemFuncionarioToolsService();

  it('títulos vencidos saem sempre filtrados pela carteira', async () => {
    const { tx, wheres } = montarTx();
    await tools.titulosVencidos(tx, EMPRESA, ESCOPO, 10);

    // A listagem e o total: o total é o que responde "quanto tenho a receber",
    // e um total sem recorte seria uma resposta errada com cara de certa.
    expect(wheres.tituloReceber.length).toBeGreaterThanOrEqual(2);
    for (const where of wheres.tituloReceber) {
      expect(where).toMatchObject({ vendedorId: { in: ESCOPO } });
    }
  });

  it('agenda sai filtrada pela carteira', async () => {
    const { tx, wheres } = montarTx();
    await tools.agenda(tx, EMPRESA, ESCOPO, 7);
    expect(wheres.atividade[0]).toMatchObject({ vendedorId: { in: ESCOPO } });
  });

  it('busca de cliente sai filtrada pela carteira', async () => {
    const { tx, wheres } = montarTx();
    await tools.situacaoDoCliente(tx, EMPRESA, ESCOPO, 'mercado');
    expect(wheres.cliente[0]).toMatchObject({ vendedorId: { in: ESCOPO } });
  });

  it('fila de espera sai filtrada pela carteira', async () => {
    const { tx, wheres } = montarTx();
    await tools.clientesAguardando(tx, EMPRESA, ESCOPO);
    expect(wheres.whatsappConversa[0]).toMatchObject({
      OR: [
        { atendenteVendedorId: { in: ESCOPO } },
        { atendenteVendedorId: null },
      ],
    });
  });

  /**
   * `null` é "sem restrição de carteira" em todo o sistema (admin, ou quem não
   * tem cadastro de vendedor). O teste existe para o dia em que alguém trocar
   * o significado de `null` por engano: sem ele, a troca passaria silenciosa.
   */
  it('escopo nulo não vira filtro impossível', async () => {
    const { tx, wheres } = montarTx();
    await tools.agenda(tx, EMPRESA, null, 7);
    expect(wheres.atividade[0]).not.toHaveProperty('vendedorId');
  });

  it('acompanhamento de objetivos sai filtrado, meta e realizado', async () => {
    const { tx, wheres } = montarTx();
    await tools.objetivos(tx, EMPRESA, ESCOPO, {});

    // Os dois lados da conta precisam do mesmo recorte. Filtrar só a meta
    // daria um percentual absurdo — realizado da empresa inteira sobre a meta
    // da equipe.
    expect(wheres.objetivoVendedorMes[0]).toMatchObject({
      vendedorId: { in: ESCOPO },
    });
    expect(wheres.notaSaidaItem.length).toBeGreaterThanOrEqual(2);
    for (const where of wheres.notaSaidaItem) {
      expect(where).toMatchObject({ vendedorId: { in: ESCOPO } });
    }
  });

  it('pedir objetivo de alguém de fora da equipe não alcança ninguém', async () => {
    const { tx, wheres } = montarTx();
    // O `vendedor.findMany` devolve vazio: o nome não existe dentro do escopo.
    const r = await tools.objetivos(tx, EMPRESA, ESCOPO, {
      vendedor: 'Fulano',
    });

    expect(r).toHaveProperty('erro');
    // E não chegou a consultar meta nem venda de ninguém.
    expect(wheres.objetivoVendedorMes).toHaveLength(0);
    expect(wheres.notaSaidaItem).toHaveLength(0);
  });

  it('resumo de atividades sai filtrado em todas as contagens', async () => {
    const { tx, wheres } = montarTx();
    await tools.resumoAtividades(tx, EMPRESA, ESCOPO, 30);

    expect(wheres.atividade.length).toBeGreaterThanOrEqual(4);
    for (const where of wheres.atividade) {
      expect(where).toMatchObject({ vendedorId: { in: ESCOPO } });
    }
  });

  it('clientes sem compra: positivados e carteira, os dois filtrados', async () => {
    const { tx, wheres } = montarTx();
    await tools.clientesSemCompraNoMes(tx, EMPRESA, ESCOPO, 10);

    expect(wheres.notaSaidaItem[0]).toMatchObject({
      vendedorId: { in: ESCOPO },
    });
    expect(wheres.cliente[0]).toMatchObject({ vendedorId: { in: ESCOPO } });
  });

  it('nome curto demais não vira busca aberta no cadastro', async () => {
    const { tx, wheres } = montarTx();
    const r = await tools.situacaoDoCliente(tx, EMPRESA, ESCOPO, 'me');
    expect(r).toHaveProperty('erro');
    // Nem chegou a consultar: duas letras casariam com meia base.
    expect(wheres.cliente).toHaveLength(0);
  });
});
