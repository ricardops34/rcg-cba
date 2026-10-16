import {
  mkdir,
  mkdtemp,
  readdir,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Armazenamento } from '../../common/armazenamento/armazenamento';
import { MidiaOrfaService } from './midia-orfa.service';

const DIA = 24 * 60 * 60 * 1000;

// Pasta temporária: a varredura apaga tudo o que não reconhece, e a pasta real
// do dev tem arquivos de verdade.
let RAIZ = '';

/** Caminhos dentro de `whatsapp/`: soltos (antes de 2026-10-13) e na pasta da empresa. */
const ARQ = {
  daMensagem: 'mensagem.jpg',
  daFoto: 'foto.jpg',
  orfao: 'orfao.pdf',
  recente: 'recente.jpg',
  daMensagemNaEmpresa: 'emp-1/nova.jpg',
  orfaoNaEmpresa: 'emp-1/orfao-novo.jpg',
};

async function naPasta() {
  const soltos = await readdir(join(RAIZ, 'whatsapp'), { withFileTypes: true });
  const daEmpresa = await readdir(join(RAIZ, 'whatsapp', 'emp-1'));
  return [
    ...soltos.filter((e) => e.isFile()).map((e) => e.name),
    ...daEmpresa.map((n) => `emp-1/${n}`),
  ].sort();
}

type Referencias = Record<string, { mensagens: string[]; fotos: string[] }>;

/** O que cada empresa referencia; a leitura é filtrada pelo `empresaId`. */
function montarPorEmpresa(refs: Referencias) {
  const daEmpresa = (where: { empresaId: string }) =>
    refs[where.empresaId] ?? { mensagens: [], fotos: [] };
  const tx = {
    empresa: {
      findMany: jest
        .fn()
        .mockResolvedValue(Object.keys(refs).map((id) => ({ id }))),
    },
    whatsappMensagem: {
      findMany: jest.fn(({ where }: { where: { empresaId: string } }) =>
        Promise.resolve(
          daEmpresa(where).mensagens.map((n) => ({
            arquivoUrl: `/uploads/whatsapp/${n}`,
          })),
        ),
      ),
    },
    whatsappContato: {
      findMany: jest.fn(({ where }: { where: { empresaId: string } }) =>
        Promise.resolve(
          daEmpresa(where).fotos.map((n) => ({
            fotoUrl: `/uploads/whatsapp/${n}`,
          })),
        ),
      ),
    },
  };
  const prisma = {
    withSistema: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    withTenant: jest.fn((_id: string, fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const service = new MidiaOrfaService(prisma as never);
  service.armazenamento = new Armazenamento({ raizDisco: RAIZ, pastasS3: [] });
  return { service, prisma };
}

/** Tudo referenciado pela `emp-1`, dona da pasta `whatsapp/emp-1/`. */
const montar = (mensagens: string[], fotos: string[]) =>
  montarPorEmpresa({ 'emp-1': { mensagens, fotos } });

describe('MidiaOrfaService', () => {
  const agora = Date.now();

  beforeEach(async () => {
    RAIZ = await mkdtemp(join(tmpdir(), 'midia-orfa-'));
    await mkdir(join(RAIZ, 'whatsapp', 'emp-1'), { recursive: true });
    const antigo = new Date(agora - 2 * DIA);
    for (const rel of Object.values(ARQ)) {
      const caminho = join(RAIZ, 'whatsapp', ...rel.split('/'));
      await writeFile(caminho, 'x'.repeat(10));
      if (rel !== ARQ.recente) await utimes(caminho, antigo, antigo);
    }
  });

  afterEach(() => rm(RAIZ, { recursive: true, force: true }));

  const usados = () =>
    montar([ARQ.daMensagem, ARQ.daMensagemNaEmpresa], [ARQ.daFoto]);

  it('lista sem apagar: só os antigos sem referência são órfãos, soltos ou na pasta da empresa', async () => {
    const { service, prisma } = usados();

    const r = await service.varrer(false, agora);

    expect(r.amostra.sort()).toEqual([ARQ.orfaoNaEmpresa, ARQ.orfao].sort());
    expect(r).toMatchObject({
      arquivosNaPasta: 6,
      recentesIgnorados: 1,
      apagados: 0,
    });
    expect(await naPasta()).toEqual(Object.values(ARQ).sort());
    // Mensagens e contatos lidos dentro do contexto da empresa (RLS).
    expect(prisma.withTenant).toHaveBeenCalledWith(
      'emp-1',
      expect.any(Function),
    );
  });

  it('não apaga a pasta de uma empresa cuja leitura voltou vazia, nem a de empresa desconhecida', async () => {
    const antigo = new Date(agora - 2 * DIA);
    for (const pasta of ['emp-2', 'emp-x']) {
      await mkdir(join(RAIZ, 'whatsapp', pasta), { recursive: true });
      const caminho = join(RAIZ, 'whatsapp', pasta, 'midia.jpg');
      await writeFile(caminho, 'x');
      await utimes(caminho, antigo, antigo);
    }
    // A emp-2 existe, mas a leitura dela não trouxe nada (RLS sem contexto,
    // por exemplo); as outras empresas leram normalmente.
    const { service } = montarPorEmpresa({
      'emp-1': {
        mensagens: [ARQ.daMensagem, ARQ.daMensagemNaEmpresa],
        fotos: [ARQ.daFoto],
      },
      'emp-2': { mensagens: [], fotos: [] },
    });

    const r = await service.varrer(true, agora);

    expect(r).toMatchObject({
      protegidos: 2,
      pastasProtegidas: ['emp-2', 'emp-x'],
    });
    expect(r.amostra.sort()).toEqual([ARQ.orfaoNaEmpresa, ARQ.orfao].sort());
    expect(await readdir(join(RAIZ, 'whatsapp', 'emp-2'))).toEqual([
      'midia.jpg',
    ]);
    expect(await readdir(join(RAIZ, 'whatsapp', 'emp-x'))).toEqual([
      'midia.jpg',
    ]);
  });

  it('apaga os órfãos e deixa os referenciados e o recente', async () => {
    const { service } = usados();

    await service.varrer(true, agora);

    expect(await naPasta()).toEqual(
      [ARQ.daFoto, ARQ.daMensagem, ARQ.daMensagemNaEmpresa, ARQ.recente].sort(),
    );
  });

  it('recusa apagar quando o banco não devolve nenhuma referência', async () => {
    const { service } = montar([], []);

    await expect(service.varrer(true, agora)).rejects.toThrow(/não apaga nada/);
    expect(await naPasta()).toHaveLength(6);
  });
});
