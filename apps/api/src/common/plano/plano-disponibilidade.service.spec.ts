import { PlanoDisponibilidadeService } from './plano-disponibilidade.service';

/** SEC-04: o que o plano da empresa não inclui fica fora, com a mesma regra do menu. */
describe('PlanoDisponibilidadeService', () => {
  const catalogo = [
    { id: 'r-cli', codigo: 'clientes', menu: { id: 'm-cli', moduloId: 'mod-com', menuPaiId: null } },
    { id: 'r-rel', codigo: 'relatorio-vendas', menu: { id: 'm-rel', moduloId: 'mod-rel', menuPaiId: null } },
    { id: 'r-bk', codigo: 'backups', menu: { id: 'm-bk', moduloId: 'mod-adm', menuPaiId: null } },
  ];

  const montar = (plano: unknown) => {
    const tx = {
      assinatura: { findFirst: jest.fn().mockResolvedValue(plano === null ? null : { plano }) },
      rotina: { findMany: jest.fn().mockResolvedValue(catalogo) },
    };
    const prisma = { withTenant: jest.fn((_e: string, fn: (t: unknown) => unknown) => fn(tx)) };
    return { servico: new PlanoDisponibilidadeService(prisma as never), tx, prisma };
  };

  it('sem assinatura ou sem plano (a própria plataforma): nada fora', async () => {
    const { servico } = montar(null);
    expect((await servico.rotinasForaDoPlano('e1')).size).toBe(0);
  });

  it('plano com listas vazias é sem restrição', async () => {
    const { servico } = montar({ modulos: [], menus: [], rotinas: [] });
    expect((await servico.rotinasForaDoPlano('e1')).size).toBe(0);
  });

  it('plano que lista módulos deixa de fora as rotinas dos demais', async () => {
    const { servico } = montar({
      modulos: [{ moduloId: 'mod-com' }, { moduloId: 'mod-adm' }],
      menus: [],
      rotinas: [],
    });
    expect([...(await servico.rotinasForaDoPlano('e1'))]).toEqual(['relatorio-vendas']);
  });

  it('plano que lista rotinas deixa de fora as que não estão nele', async () => {
    const { servico } = montar({
      modulos: [],
      menus: [],
      rotinas: [{ rotinaId: 'r-cli' }],
    });
    expect([...(await servico.rotinasForaDoPlano('e1'))].sort()).toEqual(['backups', 'relatorio-vendas']);
  });

  it('lê dentro de withTenant (a tabela tem RLS) e guarda o resultado por um tempo', async () => {
    const { servico, tx, prisma } = montar({ modulos: [{ moduloId: 'mod-com' }], menus: [], rotinas: [] });
    await servico.rotinasForaDoPlano('e1');
    await servico.rotinasForaDoPlano('e1');
    expect(prisma.withTenant).toHaveBeenCalledTimes(1);
    expect(prisma.withTenant).toHaveBeenCalledWith('e1', expect.any(Function));
    expect(tx.assinatura.findFirst).toHaveBeenCalledTimes(1);
    servico.esquecer('e1');
    await servico.rotinasForaDoPlano('e1');
    expect(prisma.withTenant).toHaveBeenCalledTimes(2);
  });
});
