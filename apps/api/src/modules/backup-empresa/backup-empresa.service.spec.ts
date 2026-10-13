import { BackupEmpresaService } from './backup-empresa.service';

const DIA = 24 * 60 * 60 * 1000;
const AGORA = new Date('2026-10-13T12:00:00Z').getTime();

function montar(
  ultimoPorEmpresa: Record<string, Date | null>,
  config = { ativo: true, frequenciaDias: 7, manter: 4 },
) {
  const tx = {
    empresa: {
      findMany: jest
        .fn()
        .mockResolvedValue(Object.keys(ultimoPorEmpresa).map((id) => ({ id }))),
    },
    empresaBackup: {
      findFirst: jest.fn(({ where }: { where: { empresaId: string } }) => {
        const data = ultimoPorEmpresa[where.empresaId];
        return Promise.resolve(data ? { iniciadoEm: data } : null);
      }),
    },
  };
  const prisma = {
    withSistema: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    withTenant: jest.fn((_id: string, fn: (t: typeof tx) => unknown) => fn(tx)),
    backupEmpresaConfig: { upsert: jest.fn().mockResolvedValue(config) },
  };
  const service = new BackupEmpresaService(prisma as never);
  const gerarAgora = jest
    .spyOn(service, 'gerarAgora')
    .mockResolvedValue({} as never);
  return { service, gerarAgora };
}

describe('BackupEmpresaService.agendados', () => {
  it('gera só para quem não tem backup agendado dentro da frequência, um de cada vez', async () => {
    const { service, gerarAgora } = montar({
      recente: new Date(AGORA - 2 * DIA),
      antigo: new Date(AGORA - 8 * DIA),
      nunca: null,
    });

    const r = await service.agendados(AGORA);

    expect(r).toEqual({ gerados: 2 });
    expect(gerarAgora.mock.calls.map(([id]) => id)).toEqual([
      'antigo',
      'nunca',
    ]);
    expect(
      gerarAgora.mock.calls.every(([, origem]) => origem === 'agendado'),
    ).toBe(true);
  });

  it('desligado, não gera nada', async () => {
    const { service, gerarAgora } = montar(
      { nunca: null },
      { ativo: false, frequenciaDias: 7, manter: 4 },
    );

    expect(await service.agendados(AGORA)).toEqual({ gerados: 0 });
    expect(gerarAgora).not.toHaveBeenCalled();
  });

  it('uma empresa que falha não para as outras', async () => {
    const { service, gerarAgora } = montar({ a: null, b: null });
    gerarAgora.mockRejectedValueOnce(new Error('conflito'));

    expect(await service.agendados(AGORA)).toEqual({ gerados: 1 });
    expect(gerarAgora).toHaveBeenCalledTimes(2);
  });
});
