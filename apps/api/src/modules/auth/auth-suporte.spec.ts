import { ForbiddenException } from '@nestjs/common';
import { AuthService } from './auth.service';

/**
 * "Entrar como suporte": a sessão no ambiente do cliente sem vínculo,
 * autorizada pela liberação dele (docs/planos/2026-10-16-entrar-como-suporte.md).
 */
describe('AuthService — sessão de suporte', () => {
  const VALIDO_ATE = new Date(Date.now() + 2 * 60 * 60 * 1000);

  function montar(opcoes: {
    administraPlataforma?: boolean;
    empresaDeCliente?: boolean;
    liberacao?: { id: string; validoAte: Date } | null;
  }) {
    const {
      administraPlataforma = true,
      empresaDeCliente = true,
      liberacao = { id: 'liberacao', validoAte: VALIDO_ATE },
    } = opcoes;
    const tx = {
      usuario: {
        findFirst: jest.fn().mockResolvedValue({ perfilId: 'perfil' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'admin',
          nome: 'Admin',
          email: 'admin@plataforma.com',
          perfilId: 'perfil',
        }),
      },
      perfil: {
        findUnique: jest.fn().mockResolvedValue({ administraPlataforma }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          sistemaBase: true,
          administraPlataforma,
          permissoes: [],
        }),
      },
      // A conta da plataforma não tem vínculo com o cliente.
      usuarioEmpresa: { findFirst: jest.fn().mockResolvedValue(null) },
      empresa: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            empresaDeCliente
              ? { id: 'cliente', nomeFantasia: 'Cliente' }
              : null,
          ),
      },
    };
    const assinados: {
      payload: Record<string, unknown>;
      opcoes: { expiresIn: number };
    }[] = [];
    const prisma = {
      withUsuario: jest.fn((_id: string, fn: (t: typeof tx) => unknown) =>
        fn(tx),
      ),
      withSistema: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
      sessao: { findFirst: jest.fn() },
      usuario: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ email: 'admin@plataforma.com' }),
      },
      refreshToken: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue({
          id: 'rt',
          usuarioId: 'admin',
          empresaId: 'cliente',
          sessaoId: 'sessao',
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const jwt = {
      signAsync: jest.fn(
        (payload: Record<string, unknown>, o: { expiresIn: number }) => {
          assinados.push({ payload, opcoes: o });
          return Promise.resolve('token');
        },
      ),
    };
    const acessos = {
      registrar: jest.fn().mockResolvedValue(undefined),
      tocarSessao: jest.fn().mockResolvedValue(undefined),
      abrirSessao: jest.fn().mockResolvedValue('sessao'),
      situacaoSessao: jest
        .fn()
        .mockResolvedValue({ aberta: true, motivo: null }),
    };
    const horarios = {
      verificar: jest.fn().mockResolvedValue({ dentro: true, motivo: '' }),
    };
    const suporte = {
      concessaoVigente: jest.fn().mockResolvedValue(liberacao),
      registrarLogSuporte: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AuthService(
      prisma as never,
      jwt as never,
      {} as never,
      acessos as never,
      horarios as never,
      suporte as never,
    );
    return { service, assinados, suporte, acessos };
  }

  const meta = { ip: '1.1.1.1', userAgent: 'teste' };

  it('com a liberação do cliente: token da empresa dele, marcado e limitado ao prazo, e a entrada no log', async () => {
    const { service, assinados, suporte } = montar({});

    await service.entrarComoSuporte('admin', 'cliente', meta, 'sessao');

    expect(assinados[0].payload).toMatchObject({
      sub: 'admin',
      empresaAtivaId: 'cliente',
      suporte: 'liberacao',
      administradorPlataforma: true,
      sid: 'sessao',
    });
    expect(assinados[0].opcoes.expiresIn).toBeLessThanOrEqual(15 * 60);
    expect(suporte.registrarLogSuporte).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 'cliente',
        suporteAcessoId: 'liberacao',
      }),
    );
  });

  it('o token não passa do fim da liberação', async () => {
    const { service, assinados } = montar({
      liberacao: { id: 'l', validoAte: new Date(Date.now() + 5 * 60 * 1000) },
    });

    await service.entrarComoSuporte('admin', 'cliente', meta, 'sessao');

    expect(assinados[0].opcoes.expiresIn).toBeLessThanOrEqual(5 * 60);
  });

  it.each([
    ['sem liberação', { liberacao: null }],
    ['conta que não administra a plataforma', { administraPlataforma: false }],
    ['empresa da plataforma ou inexistente', { empresaDeCliente: false }],
  ])('recusa: %s', async (_caso, opcoes) => {
    const { service, assinados } = montar(opcoes);

    await expect(
      service.entrarComoSuporte('admin', 'cliente', meta, 'sessao'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(assinados).toHaveLength(0);
  });

  it('a renovação mantém a sessão de suporte enquanto a liberação vale', async () => {
    const { service, assinados } = montar({});

    await service.refresh({ refreshToken: 'x' }, meta);

    expect(assinados[0].payload).toMatchObject({
      empresaAtivaId: 'cliente',
      suporte: 'liberacao',
    });
  });

  it('liberação revogada: a renovação não devolve a empresa do cliente', async () => {
    const { service, assinados } = montar({ liberacao: null });

    // Sem vínculo nenhum neste teste, cai no "sem empresa"; com a empresa da
    // plataforma, cairia nela.
    await expect(service.refresh({ refreshToken: 'x' }, meta)).rejects.toThrow(
      /sem empresa ativa/,
    );
    expect(assinados.some((a) => a.payload.suporte)).toBe(false);
  });
});
