import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    usuario: { findUnique: jest.Mock; findUniqueOrThrow: jest.Mock; update: jest.Mock };
    empresa: { findFirst: jest.Mock };
    usuarioEmpresa: {
      findFirst: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      findMany: jest.Mock;
    };
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    sessao: { findFirst: jest.Mock; update: jest.Mock };
    perfilPermissao: { findMany: jest.Mock };
    withTenant: jest.Mock;
    withUsuario: jest.Mock;
  };
  let jwt: { signAsync: jest.Mock };

  const usuarioAtivo = {
    id: 'usuario-1',
    email: 'fulano@teste.com',
    senhaHash: 'hash',
    ativo: true,
    nome: 'Fulano',
    tentativasFalhas: 0,
    bloqueadoAte: null,
  };

  const vinculo = {
    id: 'vinculo-1',
    usuarioId: 'usuario-1',
    empresaId: 'empresa-1',
    ativo: true,
    createdAt: new Date(),
  };

  const vinculoCompleto = {
    ...vinculo,
    usuario: usuarioAtivo,
    empresa: { id: 'empresa-1', nomeFantasia: 'Empresa 1' },
    perfil: {
      sistemaBase: false,
      administraPlataforma: false,
      permissoes: [
        {
          permitido: true,
          acao: 'visualizar',
          // A rotina vem com o caminho até o módulo: o token só carrega a
          // permissão se rotina, menu e módulo estiverem ligados (ver
          // `rotinaNoAr` em auth.service.ts).
          rotina: {
            codigo: 'clientes',
            ativo: true,
            menu: { ativo: true, menuPai: null, modulo: { ativo: true } },
          },
        },
      ],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      usuario: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
      empresa: { findFirst: jest.fn() },
      usuarioEmpresa: {
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn(),
      },
      refreshToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      sessao: { findFirst: jest.fn(), update: jest.fn() },
      perfilPermissao: { findMany: jest.fn() },
      withTenant: jest.fn(),
      withUsuario: jest.fn(),
    };
    // Mesmo comportamento de PrismaService.withTenant/withUsuario: roda fn
    // contra as mesmas coleções mockadas, só sem abrir transação/SET LOCAL
    // de verdade.
    prisma.withTenant.mockImplementation((_empresaId: string, fn: (tx: unknown) => unknown) =>
      fn(prisma),
    );
    prisma.withUsuario.mockImplementation((_usuarioId: string, fn: (tx: unknown) => unknown) =>
      fn(prisma),
    );
    jwt = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };
    const politicaSenhaService = {
      getVigenteParaUsuario: jest.fn().mockResolvedValue({ maxTentativas: 5, bloqueioMinutos: 15 }),
      registrarTentativaFalha: jest.fn(),
      limparTentativasFalhas: jest.fn(),
    };
    const acessos = {
      registrar: jest.fn().mockResolvedValue(undefined),
      abrirSessao: jest.fn().mockResolvedValue({ id: 'sessao-1' }),
      atualizarUltimaAtividade: jest.fn().mockResolvedValue(undefined),
      encerrarSessao: jest.fn().mockResolvedValue(undefined),
      encerrarSessoesDoUsuario: jest.fn().mockResolvedValue(undefined),
      tocarSessao: jest.fn().mockResolvedValue(undefined),
    };
    const horarios = {
      verificar: jest.fn().mockResolvedValue({ dentro: true, motivo: '' }),
    };
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      politicaSenhaService as any,
      acessos as any,
      horarios as any,
    );
  });

  describe('login', () => {
    it('rejeita quando o e-mail não existe', async () => {
      prisma.usuario.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: 'x@x.com', senha: '123' }, {}),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejeita quando o usuário está inativo', async () => {
      prisma.usuario.findUnique.mockResolvedValue({ ...usuarioAtivo, ativo: false });
      await expect(
        service.login({ email: usuarioAtivo.email, senha: '123' }, {}),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejeita quando a senha está incorreta', async () => {
      prisma.usuario.findUnique.mockResolvedValue(usuarioAtivo);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await expect(
        service.login({ email: usuarioAtivo.email, senha: 'errada' }, {}),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejeita login com empresaAlias de empresa inexistente/inativa', async () => {
      prisma.usuario.findUnique.mockResolvedValue(usuarioAtivo);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      prisma.empresa.findFirst.mockResolvedValue(null);
      await expect(
        service.login(
          { email: usuarioAtivo.email, senha: '123', empresaAlias: 'inexistente' },
          {},
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejeita quando o usuário não tem vínculo ativo com nenhuma empresa', async () => {
      prisma.usuario.findUnique.mockResolvedValue(usuarioAtivo);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      prisma.usuarioEmpresa.findFirst.mockResolvedValue(null);
      await expect(
        service.login({ email: usuarioAtivo.email, senha: '123' }, {}),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('autentica com sucesso e emite access + refresh token', async () => {
      prisma.usuario.findUnique.mockResolvedValue(usuarioAtivo);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      prisma.usuarioEmpresa.findFirst.mockResolvedValue(vinculo);
      prisma.usuarioEmpresa.findUniqueOrThrow.mockResolvedValue(vinculoCompleto);
      prisma.refreshToken.create.mockResolvedValue({});
      prisma.usuario.update.mockResolvedValue(usuarioAtivo);

      const result = await service.login(
        { email: usuarioAtivo.email, senha: '123' },
        { ip: '127.0.0.1', userAgent: 'jest' },
      );

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.expiresIn).toBe(15 * 60);
      expect(prisma.usuario.update).toHaveBeenCalledWith({
        where: { id: usuarioAtivo.id },
        data: expect.objectContaining({ ultimoLogin: expect.any(Date) }),
      });
      const signPayload = jwt.signAsync.mock.calls[0][0];
      expect(signPayload.permissoes).toEqual(['clientes.visualizar']);
      expect(signPayload.isAdmin).toBe(false);
    });

    it('não emite permissão de rotina cujo módulo está desligado', async () => {
      prisma.usuario.findUnique.mockResolvedValue(usuarioAtivo);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      prisma.usuarioEmpresa.findFirst.mockResolvedValue(vinculo);
      prisma.usuarioEmpresa.findUniqueOrThrow.mockResolvedValue({
        ...vinculoCompleto,
        perfil: {
          ...vinculoCompleto.perfil,
          permissoes: [
            {
              permitido: true,
              acao: 'visualizar',
              rotina: {
                codigo: 'clientes',
                ativo: true,
                menu: { ativo: true, menuPai: null, modulo: { ativo: false } },
              },
            },
          ],
        },
      });
      prisma.refreshToken.create.mockResolvedValue({});
      prisma.usuario.update.mockResolvedValue(usuarioAtivo);

      await service.login({ email: usuarioAtivo.email, senha: '123' }, {});

      const signPayload = jwt.signAsync.mock.calls[0][0];
      expect(signPayload.permissoes).toEqual([]);
    });

  });

  describe('refresh', () => {
    it('rejeita token inexistente', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.refresh({ refreshToken: 'abc' }, {})).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejeita token revogado', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        usuarioId: 'usuario-1',
        empresaId: 'empresa-1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 100000),
      });
      await expect(service.refresh({ refreshToken: 'abc' }, {})).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejeita token expirado', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        usuarioId: 'usuario-1',
        empresaId: 'empresa-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.refresh({ refreshToken: 'abc' }, {})).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rotaciona o token válido e mantém a mesma empresa ativa', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        usuarioId: 'usuario-1',
        empresaId: 'empresa-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });
      prisma.refreshToken.update.mockResolvedValue({});
      prisma.usuarioEmpresa.findFirst.mockResolvedValue(vinculo);
      prisma.usuarioEmpresa.findUniqueOrThrow.mockResolvedValue(vinculoCompleto);
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.refresh({ refreshToken: 'abc' }, {});

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.usuarioEmpresa.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ usuarioId: 'usuario-1', empresaId: 'empresa-1' }),
        }),
      );
      expect(result.accessToken).toBe('signed.jwt.token');
    });
  });

  describe('logout', () => {
    it('revoga o refresh token informado', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      const result = await service.logout({ refreshToken: 'abc' });
      expect(result).toEqual({ success: true });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: expect.any(String), revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('switchEmpresa', () => {
    it('rejeita quando o usuário não tem acesso à empresa alvo', async () => {
      prisma.usuarioEmpresa.findFirst.mockResolvedValue(null);
      await expect(
        service.switchEmpresa('usuario-1', 'empresa-2', {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('emite novos tokens para a empresa de destino', async () => {
      prisma.usuarioEmpresa.findFirst.mockResolvedValue(vinculo);
      prisma.usuarioEmpresa.findUniqueOrThrow.mockResolvedValue(vinculoCompleto);
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.switchEmpresa('usuario-1', 'empresa-1', {});
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(prisma.refreshToken.create).toHaveBeenCalled();
    });
  });

  describe('empresaBranding', () => {
    it('lança NotFoundException quando a empresa não existe ou está sem alias', async () => {
      prisma.empresa.findFirst.mockResolvedValue(null);
      await expect(service.empresaBranding('inexistente')).rejects.toThrow();
    });

    it('retorna dados públicos de branding', async () => {
      prisma.empresa.findFirst.mockResolvedValue({
        alias: 'empresa-1',
        nomeFantasia: 'Empresa 1',
        logoUrl: 'https://x/logo.png',
      });
      const result = await service.empresaBranding('empresa-1');
      expect(result).toEqual({
        alias: 'empresa-1',
        nomeFantasia: 'Empresa 1',
        logoUrl: 'https://x/logo.png',
      });
    });
  });
});
