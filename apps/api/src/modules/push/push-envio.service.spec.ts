import { PushEnvioService } from './push-envio.service';
import { rotaSegura } from './push-texto';

describe('PushEnvioService', () => {
  const agora = new Date();
  const linha = (over: Record<string, unknown> = {}) => ({
    id: 'n1',
    usuarioId: 'u1',
    tipo: 'desconto_pendente',
    rota: '/crm/orcamentos/1',
    referenciaId: 'orc-1',
    criadaEm: agora,
    ...over,
  });

  function montar(
    linhas: unknown[],
    opcoes: { aptos?: string[]; dentro?: boolean } = {},
  ) {
    const tx = { $queryRaw: jest.fn().mockResolvedValue(linhas) };
    const prisma = {
      empresa: { findMany: jest.fn().mockResolvedValue([{ id: 'e1' }]) },
      withTenant: jest.fn((_id: string, fn: (t: typeof tx) => unknown) =>
        fn(tx),
      ),
    };
    const push = {
      configurado: true,
      usuariosComAparelho: jest
        .fn()
        .mockResolvedValue(new Set(opcoes.aptos ?? ['u1'])),
      enviarParaUsuario: jest.fn().mockResolvedValue(1),
    };
    const horarios = {
      verificar: jest.fn().mockResolvedValue({ dentro: opcoes.dentro ?? true }),
    };
    const service = new PushEnvioService(
      prisma as never,
      push as never,
      horarios as never,
    );
    return { service, push, prisma, tx, horarios };
  }

  it('envia título genérico, sem dado do fato, com a rota da notificação', async () => {
    const { service, push } = montar([linha()]);
    await service.passar();
    expect(push.enviarParaUsuario).toHaveBeenCalledWith('u1', {
      titulo: 'Desconto aguardando sua liberação',
      corpo: 'Toque para abrir.',
      rota: '/crm/orcamentos/1',
      tag: 'desconto_pendente:orc-1',
    });
  });

  it('mensagem de WhatsApp não vai para o celular', async () => {
    const { service, push } = montar([linha({ tipo: 'whatsapp_mensagem' })]);
    await service.passar();
    expect(push.enviarParaUsuario).not.toHaveBeenCalled();
  });

  it('descarta quem não tem aparelho, quem está fora do expediente e aviso velho', async () => {
    const semAparelho = montar([linha({ usuarioId: 'u2' })]);
    await semAparelho.service.passar();
    expect(semAparelho.push.enviarParaUsuario).not.toHaveBeenCalled();

    const fora = montar([linha()], { dentro: false });
    await fora.service.passar();
    expect(fora.push.enviarParaUsuario).not.toHaveBeenCalled();

    const velho = montar([
      linha({ criadaEm: new Date(Date.now() - 60 * 60_000) }),
    ]);
    await velho.service.passar();
    expect(velho.push.enviarParaUsuario).not.toHaveBeenCalled();
  });

  it('sem nenhum aparelho apto, nem lê a fila', async () => {
    const { service, prisma } = montar([linha()], { aptos: [] });
    await service.passar();
    expect(prisma.withTenant).not.toHaveBeenCalled();
  });
});

describe('rotaSegura', () => {
  it('aceita só caminho interno', () => {
    expect(rotaSegura('/crm/agenda')).toBe('/crm/agenda');
    expect(rotaSegura('https://exemplo.com')).toBe('/');
    expect(rotaSegura('//exemplo.com')).toBe('/');
    expect(rotaSegura(null)).toBe('/');
  });
});
