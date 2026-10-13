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
const P = 'teste-orfa-';
// Pasta temporária: a varredura apaga tudo o que não reconhece, e a pasta real
// do dev tem arquivos de verdade.
let RAIZ = '';
let PASTA = '';
const nomes = {
  daMensagem: `${P}mensagem.jpg`,
  daFoto: `${P}foto.jpg`,
  orfao: `${P}orfao.pdf`,
  recente: `${P}recente.jpg`,
};

const doTeste = (lista: string[]) => lista.filter((n) => n.startsWith(P));

function montar(mensagens: string[], fotos: string[]) {
  const tx = {
    empresa: { findMany: jest.fn().mockResolvedValue([{ id: 'e1' }]) },
    whatsappMensagem: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          mensagens.map((n) => ({ arquivoUrl: `/uploads/whatsapp/${n}` })),
        ),
    },
    whatsappContato: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          fotos.map((n) => ({ fotoUrl: `/uploads/whatsapp/${n}` })),
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

describe('MidiaOrfaService', () => {
  const agora = Date.now();

  beforeEach(async () => {
    RAIZ = await mkdtemp(join(tmpdir(), 'midia-orfa-'));
    PASTA = join(RAIZ, 'whatsapp');
    await mkdir(PASTA);
    const antigo = new Date(agora - 2 * DIA);
    for (const nome of Object.values(nomes)) {
      await writeFile(join(PASTA, nome), 'x'.repeat(10));
      if (nome !== nomes.recente)
        await utimes(join(PASTA, nome), antigo, antigo);
    }
  });

  afterEach(() => rm(RAIZ, { recursive: true, force: true }));

  it('lista sem apagar: só o antigo que ninguém referencia é órfão', async () => {
    const { service, prisma } = montar([nomes.daMensagem], [nomes.daFoto]);

    const r = await service.varrer(false, agora);

    expect(doTeste(r.amostra)).toEqual([nomes.orfao]);
    expect(r.apagados).toBe(0);
    expect(doTeste(await readdir(PASTA)).sort()).toEqual(
      Object.values(nomes).sort(),
    );
    // Mensagens e contatos lidos dentro do contexto da empresa (RLS).
    expect(prisma.withTenant).toHaveBeenCalledWith('e1', expect.any(Function));
  });

  it('apaga o órfão e deixa o referenciado e o recente', async () => {
    const { service } = montar([nomes.daMensagem], [nomes.daFoto]);

    await service.varrer(true, agora);

    const restantes = doTeste(await readdir(PASTA)).sort();
    expect(restantes).toEqual(
      [nomes.daFoto, nomes.daMensagem, nomes.recente].sort(),
    );
  });

  it('recusa apagar quando o banco não devolve nenhuma referência', async () => {
    const { service } = montar([], []);

    await expect(service.varrer(true, agora)).rejects.toThrow(/não apaga nada/);
    expect(doTeste(await readdir(PASTA))).toHaveLength(4);
  });
});
