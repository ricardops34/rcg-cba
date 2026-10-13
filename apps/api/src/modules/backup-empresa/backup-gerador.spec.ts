import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Armazenamento } from '../../common/armazenamento/armazenamento';
import { BackupGerador } from './backup-gerador';

const EMPRESA = 'emp-1';

/** Dados falsos por delegate; o que não está aqui volta vazio. */
const DADOS: Record<string, Record<string, unknown>[]> = {
  usuarioEmpresa: [{ id: 'ue1', usuarioId: 'u1', empresaId: EMPRESA }],
  parametroEmpresa: [
    {
      id: 'p1',
      empresaId: EMPRESA,
      parametro: 'SMTP_SENHA',
      conteudo: 'senha-do-smtp-secreta',
    },
    {
      id: 'p2',
      empresaId: EMPRESA,
      parametro: 'SMTP_HOST',
      conteudo: 'smtp.exemplo.com.br',
    },
  ],
  whatsappMensagem: [
    {
      id: 'm1',
      empresaId: EMPRESA,
      conteudo: 'oi; "tudo" bem',
      arquivoUrl: '/uploads/whatsapp/foto.jpg',
      criadaEm: new Date('2026-10-01T12:00:00Z'),
    },
    { id: 'm2', empresaId: EMPRESA, arquivoUrl: '/uploads/whatsapp/sumiu.jpg' },
  ],
  produtoFicha: [{ id: 'f1', empresaId: EMPRESA, arquivo: 'ficha.pdf' }],
  empresa: [
    { id: EMPRESA, grupoEconomicoId: 'g1', razaoSocial: 'Empresa Teste' },
  ],
  grupoEconomico: [{ id: 'g1', nome: 'Grupo' }],
  usuario: [{ id: 'u1', nome: 'Fulana', senhaHash: 'hash-da-senha-secreta' }],
};

function montarPrisma() {
  const consultas: { delegate: string; where: unknown }[] = [];
  const tx = new Proxy(
    {},
    {
      get: (_alvo, nome: string) => ({
        findMany: ({ where, skip }: { where: unknown; skip: number }) => {
          consultas.push({ delegate: nome, where });
          return Promise.resolve(skip === 0 ? (DADOS[nome] ?? []) : []);
        },
      }),
    },
  );
  const prisma = {
    withTenant: jest.fn((_id: string, fn: (t: unknown) => unknown) => fn(tx)),
  };
  return { prisma, consultas };
}

describe('BackupGerador', () => {
  let raiz = '';
  beforeEach(async () => {
    raiz = await mkdtemp(join(tmpdir(), 'backup-'));
    await mkdir(join(raiz, 'uploads', 'whatsapp'), { recursive: true });
    await mkdir(join(raiz, 'uploads', 'fichas'), { recursive: true });
    await writeFile(
      join(raiz, 'uploads', 'whatsapp', 'foto.jpg'),
      'CONTEUDO-DA-FOTO',
    );
    await writeFile(
      join(raiz, 'uploads', 'fichas', 'ficha.pdf'),
      'CONTEUDO-DA-FICHA',
    );
  });
  afterEach(() => rm(raiz, { recursive: true, force: true }));

  async function gerar() {
    const { prisma, consultas } = montarPrisma();
    const armazenamento = new Armazenamento({
      raizDisco: join(raiz, 'uploads'),
      pastasS3: [],
    });
    const gerador = new BackupGerador(
      prisma as never,
      armazenamento,
      EMPRESA,
      join(raiz, 'tmp'),
      true,
    );
    const r = await gerador.gerar({
      versaoSchema: 'v1',
      geradoEm: new Date('2026-10-13T00:00:00Z'),
      origem: 'manual',
    });
    return {
      r,
      zip: (await readFile(r.caminhoZip)).toString('latin1'),
      prisma,
      consultas,
    };
  }

  it('lê tudo no contexto da empresa e filtrando por ela', async () => {
    const { prisma, consultas } = await gerar();

    expect(prisma.withTenant.mock.calls.every(([id]) => id === EMPRESA)).toBe(
      true,
    );
    const daEmpresa = consultas.filter(
      (c) => !['empresa', 'grupoEconomico', 'usuario'].includes(c.delegate),
    );
    expect(daEmpresa.length).toBeGreaterThan(50);
    expect(
      daEmpresa.every(
        (c) =>
          JSON.stringify(c.where) === JSON.stringify({ empresaId: EMPRESA }),
      ),
    ).toBe(true);
    // Usuários: só os vinculados.
    expect(consultas.find((c) => c.delegate === 'usuario')?.where).toEqual({
      id: { in: ['u1'] },
    });
  });

  it('não leva senha nem credencial', async () => {
    const { zip } = await gerar();

    expect(zip).not.toContain('senha-do-smtp-secreta');
    expect(zip).not.toContain('hash-da-senha-secreta');
    expect(zip).toContain('smtp.exemplo.com.br'); // o resto do parâmetro vai
  });

  it('junta dados, planilhas, arquivos e o manifesto', async () => {
    const { r, zip } = await gerar();

    for (const nome of [
      'dados/whatsapp_mensagens.jsonl',
      'planilhas/whatsapp_mensagens.csv',
      'dados/empresas.jsonl',
      'arquivos/whatsapp/foto.jpg',
      'arquivos/fichas/ficha.pdf',
      'manifesto.json',
      'LEIA-ME.txt',
    ]) {
      expect(zip).toContain(nome);
    }
    expect(zip).toContain('CONTEUDO-DA-FOTO');
    expect(zip).toContain('CONTEUDO-DA-FICHA');
    // CSV com ; e aspas escapadas; data em ISO no JSONL.
    expect(zip).toContain('"oi; ""tudo"" bem"');
    expect(zip).toContain('"criadaEm":"2026-10-01T12:00:00.000Z"');
    // O arquivo que falta vai listado no manifesto, sem derrubar o backup.
    expect(zip).toMatch(/"arquivosAusentes": \[\s*"whatsapp\/sumiu.jpg"\s*\]/);
    expect(r.arquivos).toBe(2);
    expect(r.registros).toBe(9);
  });
});
