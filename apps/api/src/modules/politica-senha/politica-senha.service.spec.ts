import {
  PoliticaSenhaService,
  POLITICA_PADRAO,
} from './politica-senha.service';

/**
 * `usuario_empresas` tem RLS: sem `withUsuario` a leitura dos vínculos volta
 * vazia (login, "esqueci minha senha") ou só com a empresa ativa (logado), e a
 * política da conta deixava de ser a mais restritiva.
 */
describe('PoliticaSenhaService.getVigenteParaUsuario', () => {
  function montar(
    parametrosPorEmpresa: Record<string, Record<string, string>>,
  ) {
    const tx = {
      usuarioEmpresa: {
        findMany: jest.fn().mockResolvedValue(
          Object.keys(parametrosPorEmpresa).map((empresaId) => ({
            empresaId,
          })),
        ),
      },
    };
    const prisma = {
      withUsuario: jest.fn((_id: string, fn: (t: typeof tx) => unknown) =>
        fn(tx),
      ),
      // Fora do contexto do usuário, a RLS não devolve nada.
      usuarioEmpresa: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const valor = (empresaId: string, chave: string) =>
      parametrosPorEmpresa[empresaId]?.[chave];
    const parametros = {
      obterNumero: jest.fn((e: string, c: string, padrao: number) =>
        Promise.resolve(
          valor(e, c) !== undefined ? Number(valor(e, c)) : padrao,
        ),
      ),
      obterBoolean: jest.fn((e: string, c: string, padrao: boolean) =>
        Promise.resolve(
          valor(e, c) !== undefined ? valor(e, c) === 'true' : padrao,
        ),
      ),
    };
    const service = new PoliticaSenhaService(
      prisma as never,
      parametros as never,
    );
    return { service, prisma };
  }

  it('lê os vínculos no contexto do próprio usuário e combina as empresas', async () => {
    const { service, prisma } = montar({
      a: { SENHA_TAMANHO_MINIMO: '12', SENHA_TENTATIVAS_ANTES_BLOQUEIO: '3' },
      b: { SENHA_EXIGIR_ESPECIAL: 'true', SENHA_MINUTOS_BLOQUEIO: '60' },
    });

    const p = await service.getVigenteParaUsuario('u1');

    expect(prisma.withUsuario).toHaveBeenCalledWith('u1', expect.any(Function));
    expect(prisma.usuarioEmpresa.findMany).not.toHaveBeenCalled();
    expect(p).toMatchObject({
      tamanhoMinimo: 12,
      tentativasAntesBloqueio: 3,
      exigirEspecial: true,
      minutosBloqueio: 60,
    });
  });

  it('sem vínculo ativo, vale o padrão', async () => {
    const { service } = montar({});
    expect(await service.getVigenteParaUsuario('u1')).toEqual(POLITICA_PADRAO);
  });
});
