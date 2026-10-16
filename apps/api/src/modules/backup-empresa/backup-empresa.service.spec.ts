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

describe('BackupEmpresaService — poda dos agendados', () => {
  type Linha = {
    id: string;
    situacao: 'pronto' | 'falhou';
    iniciadoEm: Date;
    chave: string | null;
  };
  type Filtro = {
    where: { situacao: string; iniciadoEm?: { lt: Date } };
    skip?: number;
  };

  /** Banco em memória com o que a poda usa: filtro, ordem decrescente e skip. */
  function montarPoda(linhas: Linha[], manter: number) {
    const apagados: string[] = [];
    const tx = {
      empresaBackup: {
        findMany: jest.fn(({ where, skip = 0 }: Filtro) =>
          Promise.resolve(
            linhas
              .filter(
                (l) =>
                  l.situacao === where.situacao &&
                  (!where.iniciadoEm || l.iniciadoEm < where.iniciadoEm.lt),
              )
              .sort((a, b) => b.iniciadoEm.getTime() - a.iniciadoEm.getTime())
              .slice(skip),
          ),
        ),
        delete: jest.fn(({ where }: { where: { id: string } }) => {
          apagados.push(where.id);
          return Promise.resolve();
        }),
      },
    };
    const prisma = {
      withTenant: jest.fn((_id: string, fn: (t: typeof tx) => unknown) =>
        fn(tx),
      ),
      backupEmpresaConfig: {
        upsert: jest
          .fn()
          .mockResolvedValue({ ativo: true, frequenciaDias: 7, manter }),
      },
    };
    const service = new BackupEmpresaService(prisma as never);
    const apagar = jest.fn().mockResolvedValue(undefined);
    service.armazenamento = { apagar } as never;
    const podar = (sucesso: Date) =>
      (
        service as unknown as {
          podarAgendados: (e: string, s: Date) => Promise<void>;
        }
      ).podarAgendados('e1', sucesso);
    return { podar, apagados, apagar };
  }

  const dia = (n: number) => new Date(AGORA - n * DIA);
  const linha = (id: string, situacao: Linha['situacao'], dias: number) => ({
    id,
    situacao,
    iniciadoEm: dia(dias),
    chave: situacao === 'pronto' ? `backups-empresas/e1/${id}.zip` : null,
  });

  it('falhas recentes não empurram os backups bons para fora', async () => {
    // Do mais novo ao mais antigo: o pronto de agora, três falhas, três prontos.
    const { podar, apagados, apagar } = montarPoda(
      [
        linha('agora', 'pronto', 0),
        linha('f1', 'falhou', 1),
        linha('f2', 'falhou', 2),
        linha('f3', 'falhou', 3),
        linha('p1', 'pronto', 7),
        linha('p2', 'pronto', 14),
        linha('p3', 'pronto', 21),
      ],
      4,
    );

    await podar(dia(0));

    // Os quatro prontos ficam; só as falhas, que não têm pacote, saem.
    expect(apagados.sort()).toEqual(['f1', 'f2', 'f3']);
    expect(apagar).not.toHaveBeenCalled();
  });

  it('com mais prontos que o limite, apaga o pacote e o registro dos mais antigos', async () => {
    const { podar, apagados, apagar } = montarPoda(
      [
        linha('agora', 'pronto', 0),
        linha('p1', 'pronto', 7),
        linha('p2', 'pronto', 14),
      ],
      2,
    );

    await podar(dia(0));

    expect(apagados).toEqual(['p2']);
    expect(apagar).toHaveBeenCalledWith('backups-empresas/e1/p2.zip');
  });
});
