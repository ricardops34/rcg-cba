import { AgenteResumoDiarioService } from './agente-resumo-diario.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { dataDoResumo } from './dia-operacional';

describe('Resumo diário automático', () => {
  const user = {
    id: 'u1',
    empresaAtivaId: 'e1',
    isAdmin: false,
    permissoes: [],
  } as unknown as AuthenticatedUser;
  function montar() {
    const recibo = {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    };
    const vendedoresTx = {
      findFirst: jest.fn().mockResolvedValue({ id: 's1' }),
      findMany: jest.fn().mockResolvedValue([]),
    };
    const tx = {
      agenteResumoExibido: recibo,
      vendedor: vendedoresTx,
      // O escopo da carteira consulta o perfil do usuário (carteiraCompleta).
      usuarioEmpresa: {
        findFirst: jest.fn().mockResolvedValue({ usuario: { perfil: { carteiraCompleta: false } } }),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ id: 's1' }, { id: 'v1' }]),
    };
    const prisma = {
      withTenant: jest.fn((_id: string, fn: (client: typeof tx) => unknown) =>
        fn(tx),
      ),
    };
    const meuDia = {
      montar: jest.fn().mockResolvedValue({
        tratamento: 'Ana',
        aniversario: true,
        agenda: { hoje: 2, atrasadas: 1, proximas: [] },
        meta: { realizado: 99.999, objetivo: 100, percentual: 100 },
        recados: 3,
      }),
    };
    const config = {
      apresentacao: jest.fn().mockResolvedValue({ ativo: true }),
    };
    const ferramentas = {
      disponiveisParaAjuda: jest
        .fn()
        .mockResolvedValue([
          { chave: 'meu_dia' },
          { chave: 'execucao_objetivos_vendedores' },
        ]),
    };
    const objetivos = {
      dashboardGerencial: jest.fn().mockResolvedValue({
        linhas: [
          { nome: 'João', realizado: 100, objetivo: 100 },
          { nome: 'Sem meta', realizado: 100, objetivo: 0 },
        ],
      }),
    };
    const vendedores = {
      vendedorDoUsuario: jest.fn().mockResolvedValue({ tipo: 'vendedor' }),
    };
    const service = new AgenteResumoDiarioService(
      prisma as never,
      meuDia as never,
      config as never,
      ferramentas as never,
      objetivos as never,
      vendedores as never,
    );
    return {
      service,
      recibo,
      prisma,
      meuDia,
      config,
      ferramentas,
      objetivos,
      vendedores,
      vendedoresTx,
    };
  }
  it('não consulta dados quando o agente está desligado', async () => {
    const m = montar();
    m.config.apresentacao.mockResolvedValue({ ativo: false });
    expect(await m.service.consultar(user)).toBeNull();
    expect(m.meuDia.montar).not.toHaveBeenCalled();
  });
  it('respeita a ferramenta meu_dia desabilitada', async () => {
    const m = montar();
    m.ferramentas.disponiveisParaAjuda.mockResolvedValue([]);
    expect(await m.service.consultar(user)).toBeNull();
    expect(m.meuDia.montar).not.toHaveBeenCalled();
  });
  it('não apresenta novamente após confirmação no mesmo dia', async () => {
    const m = montar();
    m.recibo.findUnique.mockResolvedValue({ data: dataDoResumo() });
    expect(await m.service.consultar(user)).toBeNull();
    expect(m.meuDia.montar).not.toHaveBeenCalled();
  });
  it('saúda e mostra informações próprias sem expor equipe ou parabenizar arredondamento', async () => {
    const m = montar();
    const resumo = await m.service.consultar(user);
    expect(resumo?.texto).toContain('Olá, Ana!');
    expect(resumo?.texto).toContain('Feliz aniversário');
    expect(resumo?.texto).toContain('Como posso ajudar mais?');
    expect(resumo?.texto).not.toContain('você atingiu');
    expect(m.objetivos.dashboardGerencial).not.toHaveBeenCalled();
    expect(m.recibo.upsert).not.toHaveBeenCalled();
  });
  it('admin recebe metas apenas da empresa ativa e não celebra ausência de meta', async () => {
    const m = montar();
    const admin = { ...user, isAdmin: true };
    const resumo = await m.service.consultar(admin);
    expect(m.objetivos.dashboardGerencial).toHaveBeenCalledWith(
      'e1',
      admin,
      expect.any(Object),
    );
    expect(resumo?.texto).toContain('Parabéns a João');
    expect(resumo?.texto).not.toContain('Parabéns a Sem meta');
  });
  it('superior recebe somente aniversariantes do escopo hierárquico', async () => {
    const m = montar();
    m.vendedores.vendedorDoUsuario.mockResolvedValue({ tipo: 'superior' });
    await m.service.consultar({
      ...user,
      permissoes: ['vendedores.visualizar'],
    });
    expect(m.vendedoresTx.findMany).toHaveBeenCalledWith({
      where: {
        empresaId: 'e1',
        id: { in: ['s1', 'v1'] },
        deletedAt: null,
        ativo: true,
        dataNascimento: { not: null },
      },
      select: { nome: true, dataNascimento: true },
      orderBy: { nome: 'asc' },
    });
  });
  it('não consulta metas da equipe se a ferramenta estiver desabilitada', async () => {
    const m = montar();
    m.ferramentas.disponiveisParaAjuda.mockResolvedValue([
      { chave: 'meu_dia' },
    ]);
    await m.service.consultar({ ...user, isAdmin: true });
    expect(m.objetivos.dashboardGerencial).not.toHaveBeenCalled();
  });
  it('confirma exclusivamente o usuário e a empresa autenticados, rejeitando datas futuras', async () => {
    const m = montar();
    await m.service.confirmar(user, dataDoResumo());
    expect(m.recibo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { empresaId: 'e1', usuarioId: 'u1', data: dataDoResumo() },
      }),
    );
    await expect(m.service.confirmar(user, '2099-01-01')).rejects.toThrow(
      'Data do resumo inválida',
    );
  });
});
