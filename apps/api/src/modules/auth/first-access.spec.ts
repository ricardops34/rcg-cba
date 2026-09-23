import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { avatarPadraoSchema, completeFirstAccessSchema } from '@plataforma/contracts';
import { AuthService, precisaCompletarPrimeiroAcesso } from './auth.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PoliticaSenhaService } from '../politica-senha/politica-senha.service';
import { AcessosService } from '../acessos/acessos.service';
import { HorarioTrabalhoService } from '../acessos/horario-trabalho.service';

describe('Primeiro acesso', () => {
  const input = { nome: 'Maria Silva', telefoneInstitucional: '(65) 99999-1234', dataNascimento: '1990-05-12' };
  const tx = {
    usuario: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
    usuarioEmpresa: { findFirst: jest.fn(), update: jest.fn() },
    vendedor: { findMany: jest.fn(), update: jest.fn() },
  };
  const prisma = {
    withTenant: jest.fn(),
    usuario: { update: jest.fn() },
  };
  let service: AuthService;

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.withTenant.mockImplementation((_id: string, fn: (client: typeof tx) => unknown) => fn(tx));
    tx.usuario.findUniqueOrThrow.mockResolvedValue({ primeiroAcessoConcluidoEm: null, avatarUrl: null });
    tx.usuarioEmpresa.findFirst.mockResolvedValue({ id: 'vinculo' });
    tx.vendedor.findMany.mockResolvedValue([]);
    const module = await Test.createTestingModule({ providers: [
      AuthService,
      { provide: PrismaService, useValue: prisma },
      ...[JwtService, PoliticaSenhaService, AcessosService, HorarioTrabalhoService].map((provide) => ({ provide, useValue: {} })),
    ] }).compile();
    service = module.get(AuthService);
    jest.spyOn(service, 'me').mockResolvedValue({} as Awaited<ReturnType<AuthService['me']>>);
  });

  it('exige os três campos e rejeita datas inexistentes, futuras e telefone incompleto', () => {
    expect(completeFirstAccessSchema.safeParse(input).success).toBe(true);
    for (const invalid of [{ nome: ' ' }, { telefoneInstitucional: '' }, { telefoneInstitucional: '123' }, { dataNascimento: '' }, { dataNascimento: '1990-02-30' }, { dataNascimento: '2999-01-01' }]) {
      expect(completeFirstAccessSchema.safeParse({ ...input, ...invalid }).success).toBe(false);
    }
  });

  it('mantém a confirmação pendente quando a migration marcou um cadastro incompleto', () => {
    const usuario = {
      nome: input.nome,
      primeiroAcessoConcluidoEm: new Date('2026-09-22T00:00:00Z'),
    };

    expect(precisaCompletarPrimeiroAcesso(usuario, {
      telefone: null,
      dataNascimento: null,
    })).toBe(true);
    expect(precisaCompletarPrimeiroAcesso(usuario, {
      telefone: input.telefoneInstitucional,
      dataNascimento: new Date('1990-05-12T00:00:00Z'),
    })).toBe(false);
  });

  it('salva sem foto e sincroniza somente campos diferentes do vendedor na empresa ativa', async () => {
    tx.vendedor.findMany.mockResolvedValue([{ id: 'vendedor', nome: input.nome, telefone: 'antigo', dataNascimento: new Date('1990-05-12T00:00:00Z') }]);
    await service.completeFirstAccess('usuario', 'empresa', input);
    expect(prisma.withTenant).toHaveBeenCalledWith('empresa', expect.any(Function));
    expect(tx.usuarioEmpresa.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ telefone: input.telefoneInstitucional, dataNascimento: new Date('1990-05-12T00:00:00Z') }) }));
    expect(tx.usuario.update).toHaveBeenCalledWith({ where: { id: 'usuario' }, data: { nome: input.nome, primeiroAcessoConcluidoEm: expect.any(Date), updatedBy: 'usuario' } });
    expect(tx.vendedor.findMany).toHaveBeenCalledWith({ where: { usuarioId: 'usuario', empresaId: 'empresa', deletedAt: null } });
    expect(tx.vendedor.update).toHaveBeenCalledWith({ where: { id: 'vendedor' }, data: { telefone: input.telefoneInstitucional, updatedBy: 'usuario' } });
  });

  it('não regrava dados na repetição da confirmação', async () => {
    tx.usuario.findUniqueOrThrow.mockResolvedValue({ nome: input.nome, primeiroAcessoConcluidoEm: new Date() });
    tx.usuarioEmpresa.findFirst.mockResolvedValue({
      id: 'vinculo',
      telefone: input.telefoneInstitucional,
      dataNascimento: new Date('1990-05-12T00:00:00Z'),
    });
    await service.completeFirstAccess('usuario', 'empresa', input);
    expect(tx.usuario.update).not.toHaveBeenCalled();
    expect(tx.vendedor.update).not.toHaveBeenCalled();
  });

  it('permite reparar um cadastro incompleto mesmo com o marco preenchido', async () => {
    tx.usuario.findUniqueOrThrow.mockResolvedValue({ nome: input.nome, primeiroAcessoConcluidoEm: new Date() });
    tx.usuarioEmpresa.findFirst.mockResolvedValue({ id: 'vinculo', telefone: null, dataNascimento: null });

    await service.completeFirstAccess('usuario', 'empresa', input);

    expect(tx.usuarioEmpresa.update).toHaveBeenCalled();
    expect(tx.usuario.update).toHaveBeenCalled();
  });

  it('preserva o vendedor quando os três campos já estão iguais', async () => {
    tx.vendedor.findMany.mockResolvedValue([{ id: 'vendedor', nome: input.nome, telefone: input.telefoneInstitucional, dataNascimento: new Date('1990-05-12T00:00:00Z') }]);
    await service.completeFirstAccess('usuario', 'empresa', input);
    expect(tx.vendedor.update).not.toHaveBeenCalled();
  });

  it('não altera dados sem vínculo ativo', async () => {
    tx.usuarioEmpresa.findFirst.mockResolvedValue(null);
    await expect(service.completeFirstAccess('usuario', 'empresa', input)).rejects.toThrow(ForbiddenException);
    expect(tx.usuario.update).not.toHaveBeenCalled();
  });

  it('rejeita arquivo disfarçado de imagem antes de gravar', async () => {
    await expect(service.uploadOwnAvatar('usuario', 'empresa', { size: 20, buffer: Buffer.from('<script>test</script>'), mimetype: 'image/png' } as Express.Multer.File)).rejects.toThrow('PNG, JPEG ou WEBP');
    expect(tx.usuario.update).not.toHaveBeenCalled();
  });

  it('associa somente avatares corporativos permitidos ao usuário', async () => {
    expect(avatarPadraoSchema.safeParse({ avatar: 'corporativo-02' }).success).toBe(true);
    expect(avatarPadraoSchema.safeParse({ avatar: '../../arquivo' }).success).toBe(false);

    await service.selectDefaultAvatar('usuario', 'empresa', 'corporativo-02');

    expect(prisma.usuario.update).toHaveBeenCalledWith({
      where: { id: 'usuario' },
      data: {
        avatarUrl: '/avatares-padrao/corporativo-02.jpg',
        updatedBy: 'usuario',
      },
    });
    expect(service.me).toHaveBeenCalledWith('usuario', 'empresa');
  });
});
