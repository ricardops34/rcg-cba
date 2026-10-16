import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import {
  RecuperacaoSenhaService,
  hashDoToken,
} from './recuperacao-senha.service';

const USUARIO = { id: 'u1', nome: 'Fulana', email: 'fulana@exemplo.com.br' };

const prismaVinculos = {
  findMany: jest.fn().mockResolvedValue([
    { empresaId: 'e1', empresa: { alias: 'primeira' } },
    { empresaId: 'e2', empresa: { alias: 'bj' } },
  ]),
};

function montar(
  opcoes: {
    usuario?: typeof USUARIO | null;
    senhaProvisoria?: boolean;
    /** Links pedidos pela conta na última hora. */
    recentes?: number;
  } = {},
) {
  const criados: { tokenHash: string; expiraEm: Date }[] = [];
  const tx = {
    senhaRedefinicao: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn(
        ({ data }: { data: { tokenHash: string; expiraEm: Date } }) => {
          criados.push(data);
          return Promise.resolve(data);
        },
      ),
    },
    usuario: {
      update: jest
        .fn<Promise<object>, [{ data: Record<string, unknown> }]>()
        .mockResolvedValue({}),
    },
    refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
  };
  const prisma = {
    usuario: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          opcoes.usuario === undefined ? USUARIO : opcoes.usuario,
        ),
    },
    empresa: {
      findFirst: jest.fn().mockResolvedValue({
        nomeFantasia: 'BJ',
        razaoSocial: 'BJ LTDA',
        cnpj: '1',
        alias: 'bj',
      }),
    },
    senhaRedefinicao: {
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(opcoes.recentes ?? 0),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    // usuario_empresas tem RLS pelo próprio usuário: lida por withUsuario.
    withUsuario: jest.fn((_id: string, fn: (t: unknown) => unknown) =>
      fn({ usuarioEmpresa: prismaVinculos }),
    ),
  };
  const mail = {
    send: jest
      .fn<Promise<boolean>, [string, string, string, unknown]>()
      .mockResolvedValue(true),
  };
  const parametros = {
    obterTexto: jest.fn().mockResolvedValue('smtp.bj'),
    obterNumero: jest.fn(),
    obterBoolean: jest.fn(),
  };
  const emailConfig = {
    disponibilidade: jest
      .fn()
      .mockResolvedValue({ senhaProvisoria: opcoes.senhaProvisoria ?? true }),
  };
  const politica = {
    validarSenhaDoUsuario: jest.fn().mockResolvedValue(undefined),
    validarReuso: jest.fn().mockResolvedValue(undefined),
    registrarHistorico: jest.fn().mockResolvedValue(undefined),
  };
  const acessos = { registrar: jest.fn(), encerrarSessoesDoUsuario: jest.fn() };
  const service = new RecuperacaoSenhaService(
    prisma as never,
    mail as never,
    parametros as never,
    emailConfig as never,
    politica as never,
    acessos as never,
  );
  return { service, prisma, tx, mail, emailConfig, politica, acessos, criados };
}

describe('RecuperacaoSenhaService.pedir', () => {
  const antes = process.env.WEB_URL;
  beforeAll(() => (process.env.WEB_URL = 'https://plataforma.exemplo.com.br'));
  afterAll(() => (process.env.WEB_URL = antes));

  it('e-mail sem conta: mesma resposta, nada enviado', async () => {
    const { service, mail } = montar({ usuario: null });

    expect(await service.pedir({ email: 'ninguem@exemplo.com.br' })).toEqual({
      ok: true,
    });
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('envia o link com o token, e o banco guarda só o hash; pedir de novo invalida o anterior', async () => {
    const { service, mail, tx, criados } = montar();

    await service.pedir({ email: 'Fulana@Exemplo.com.br', empresaAlias: 'bj' });

    const html = mail.send.mock.calls[0][2];
    const token = /redefinir-senha\?token=([\w-]+)/.exec(html)?.[1] ?? '';
    expect(token.length).toBeGreaterThan(30);
    expect(criados[0].tokenHash).toBe(hashDoToken(token));
    expect(html).not.toContain(criados[0].tokenHash);
    expect(tx.senhaRedefinicao.updateMany).toHaveBeenCalledWith({
      where: { usuarioId: 'u1', usadoEm: null },
      data: { usadoEm: expect.any(Date) as unknown },
    });
    // Vale 30 minutos.
    const minutos = (criados[0].expiraEm.getTime() - Date.now()) / 60_000;
    expect(minutos).toBeGreaterThan(29);
    expect(minutos).toBeLessThanOrEqual(30);
  });

  it('acima de 3 links na hora para a mesma conta: mesma resposta, sem e-mail nem link novo', async () => {
    const { service, mail, criados, prisma } = montar({ recentes: 3 });

    expect(await service.pedir({ email: USUARIO.email })).toEqual({ ok: true });
    expect(prisma.senhaRedefinicao.count).toHaveBeenCalledWith({
      where: {
        usuarioId: USUARIO.id,
        criadoEm: { gte: expect.any(Date) as unknown },
      },
    });
    expect(criados).toHaveLength(0);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('sai pelo servidor da empresa da tela de login quando ela liberou o e-mail de acesso', async () => {
    const { service, mail, emailConfig } = montar();

    await service.pedir({ email: USUARIO.email, empresaAlias: 'bj' });

    expect(emailConfig.disponibilidade).toHaveBeenCalledWith('e2');
    expect(mail.send.mock.calls[0][3]).toMatchObject({ host: 'smtp.bj' });
  });

  it('sem a liberação da empresa, usa o servidor da plataforma', async () => {
    const { service, mail } = montar({ senhaProvisoria: false });

    await service.pedir({ email: USUARIO.email });

    expect(mail.send.mock.calls[0][3]).toBeNull();
  });

  it('falha no envio não aparece para quem pediu', async () => {
    const { service, mail } = montar();
    mail.send.mockRejectedValueOnce(new Error('SMTP fora'));

    expect(await service.pedir({ email: USUARIO.email })).toEqual({ ok: true });
  });
});

describe('RecuperacaoSenhaService.redefinir', () => {
  const token = 'token-de-teste-com-mais-de-vinte-caracteres';
  const pedidoValido = () => ({
    id: 'p1',
    usadoEm: null,
    expiraEm: new Date(Date.now() + 60_000),
    usuario: {
      id: 'u1',
      email: USUARIO.email,
      senhaHash: 'hash-antigo',
      deletedAt: null,
      ativo: true,
    },
  });

  it.each([
    ['inexistente', null],
    ['já usado', { ...pedidoValido(), usadoEm: new Date() }],
    ['expirado', { ...pedidoValido(), expiraEm: new Date(Date.now() - 1) }],
    [
      'de usuário inativo',
      {
        ...pedidoValido(),
        usuario: { ...pedidoValido().usuario, ativo: false },
      },
    ],
  ])('link %s é recusado', async (_caso, pedido) => {
    const { service, prisma, tx } = montar();
    prisma.senhaRedefinicao.findUnique.mockResolvedValue(pedido);

    await expect(
      service.redefinir({ token, novaSenha: 'Nova@1234' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.usuario.update).not.toHaveBeenCalled();
  });

  it('troca a senha, desbloqueia, derruba as sessões e registra', async () => {
    const { service, prisma, tx, politica, acessos } = montar();
    prisma.senhaRedefinicao.findUnique.mockResolvedValue(pedidoValido());

    expect(await service.redefinir({ token, novaSenha: 'Nova@1234' })).toEqual({
      ok: true,
    });

    expect(prisma.senhaRedefinicao.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: hashDoToken(token) } }),
    );
    expect(politica.validarSenhaDoUsuario).toHaveBeenCalledWith(
      'u1',
      'Nova@1234',
    );
    expect(politica.registrarHistorico).toHaveBeenCalledWith(
      'u1',
      'hash-antigo',
      tx,
    );
    const dados = tx.usuario.update.mock.calls[0][0].data;
    expect(await bcrypt.compare('Nova@1234', dados.senhaHash as string)).toBe(
      true,
    );
    expect(dados).toMatchObject({
      tentativasFalhas: 0,
      bloqueadoAte: null,
      deveTrocarSenha: false,
    });
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { usuarioId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) as unknown },
    });
    expect(acessos.encerrarSessoesDoUsuario).toHaveBeenCalledWith(
      'u1',
      'senha_redefinida',
    );
    expect(acessos.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ evento: 'senha_redefinida' }),
    );
  });

  it('dois envios do mesmo link ao mesmo tempo: só um troca a senha', async () => {
    const { service, prisma, tx } = montar();
    prisma.senhaRedefinicao.findUnique.mockResolvedValue(pedidoValido());
    tx.senhaRedefinicao.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.redefinir({ token, novaSenha: 'Nova@1234' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.usuario.update).not.toHaveBeenCalled();
  });

  it('senha fora da política não troca nada', async () => {
    const { service, prisma, tx, politica } = montar();
    prisma.senhaRedefinicao.findUnique.mockResolvedValue(pedidoValido());
    politica.validarSenhaDoUsuario.mockRejectedValueOnce(
      new BadRequestException('Senha curta'),
    );

    await expect(service.redefinir({ token, novaSenha: '1' })).rejects.toThrow(
      'Senha curta',
    );
    expect(tx.usuario.update).not.toHaveBeenCalled();
  });
});
