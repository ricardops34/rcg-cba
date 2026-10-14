import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { S3Client } from '@aws-sdk/client-s3';
import {
  Armazenamento,
  explicarErroS3,
  chaveDoEndereco,
  configDoAmbiente,
  validarChave,
} from './armazenamento';

const S3 = {
  endpoint: 'http://minio:9000',
  endpointPublico: 'https://s3.exemplo.com.br',
  regiao: 'eu-south',
  bucket: 'plataforma',
  accessKey: 'chave',
  secretKey: 'segredo',
};

describe('validarChave / chaveDoEndereco', () => {
  it('aceita caminho relativo simples', () => {
    expect(validarChave('whatsapp/a.jpg')).toBe('whatsapp/a.jpg');
  });

  it.each([
    '',
    '/whatsapp/a.jpg',
    'whatsapp/../logos/a.png',
    'whatsapp//a.jpg',
    'whatsapp\\a.jpg',
    './a',
  ])('recusa %p', (chave) => expect(() => validarChave(chave)).toThrow());

  it('tira a chave do endereço gravado no banco, com ou sem assinatura', () => {
    expect(chaveDoEndereco('/uploads/whatsapp/a.jpg?exp=1&sig=x')).toBe(
      'whatsapp/a.jpg',
    );
    expect(chaveDoEndereco('/uploads/whatsapp/%2e%2e/logos/a.png')).toBeNull();
    expect(chaveDoEndereco('https://cdn/a.jpg')).toBeNull();
    expect(chaveDoEndereco(null)).toBeNull();
  });
});

describe('configDoAmbiente', () => {
  it('sem todas as variáveis do S3, fica só no disco', () => {
    const c = configDoAmbiente({
      S3_ENDPOINT: 'http://minio:9000',
      ARMAZENAMENTO_S3_PASTAS: 'whatsapp',
    });
    expect(c.s3).toBeUndefined();
    expect(c.pastasS3).toEqual(['whatsapp']);
  });

  it('com o S3 completo, o endereço público cai no interno quando não informado', () => {
    const c = configDoAmbiente({
      S3_ENDPOINT: 'http://minio:9000',
      S3_BUCKET: 'b',
      S3_ACCESS_KEY: 'k',
      S3_SECRET_KEY: 's',
      ARMAZENAMENTO_S3_PASTAS: ' whatsapp , fichas ',
    });
    expect(c.s3?.endpointPublico).toBe('http://minio:9000');
    expect(c.pastasS3).toEqual(['whatsapp', 'fichas']);
  });
});

describe('Armazenamento em disco', () => {
  let raiz = '';
  beforeEach(async () => {
    raiz = await mkdtemp(join(tmpdir(), 'armazenamento-'));
  });
  afterEach(() => rm(raiz, { recursive: true, force: true }));

  it('grava, lê, lista e apaga; sem S3 não há link temporário', async () => {
    const a = new Armazenamento({ raizDisco: raiz, pastasS3: ['whatsapp'] });

    await a.gravar('whatsapp/a.txt', Buffer.from('oi'));
    expect((await a.ler('whatsapp/a.txt'))?.toString()).toBe('oi');
    expect((await a.listar('whatsapp')).map((x) => x.chave)).toEqual([
      'whatsapp/a.txt',
    ]);
    expect(await a.linkTemporario('whatsapp/a.txt')).toBeNull();

    await a.apagar('whatsapp/a.txt');
    await a.apagar('whatsapp/a.txt'); // de novo: não é erro
    expect(await a.ler('whatsapp/a.txt')).toBeNull();
    expect(await a.listar('nada')).toEqual([]);
  });
});

describe('Armazenamento com pasta no S3', () => {
  let raiz = '';
  let send: jest.SpyInstance;
  beforeEach(async () => {
    raiz = await mkdtemp(join(tmpdir(), 'armazenamento-'));
    send = jest.spyOn(S3Client.prototype, 'send');
  });
  afterEach(async () => {
    send.mockRestore();
    await rm(raiz, { recursive: true, force: true });
  });

  const naoExiste = () => Object.assign(new Error('x'), { name: 'NoSuchKey' });

  it('grava no S3 só a pasta configurada', async () => {
    send.mockResolvedValue({});
    const a = new Armazenamento({
      raizDisco: raiz,
      s3: S3,
      pastasS3: ['whatsapp'],
    });

    await a.gravar('whatsapp/a.jpg', Buffer.from('x'), 'image/jpeg');
    await a.gravar('logos/b.png', Buffer.from('y'));

    expect(send).toHaveBeenCalledTimes(1);
    const [[comando]] = send.mock.calls as [
      [{ input: Record<string, unknown> }],
    ];
    expect(comando.input).toMatchObject({
      Bucket: 'plataforma',
      Key: 'whatsapp/a.jpg',
      ContentType: 'image/jpeg',
    });
    expect((await readFile(join(raiz, 'logos', 'b.png'))).toString()).toBe('y');
  });

  it('lê do disco o arquivo de antes da troca, que o S3 ainda não tem', async () => {
    send.mockRejectedValue(naoExiste());
    await mkdir(join(raiz, 'whatsapp'), { recursive: true });
    await writeFile(join(raiz, 'whatsapp', 'antigo.jpg'), 'antigo');
    const a = new Armazenamento({
      raizDisco: raiz,
      s3: S3,
      pastasS3: ['whatsapp'],
    });

    expect((await a.ler('whatsapp/antigo.jpg'))?.toString()).toBe('antigo');
    // Sem objeto no S3, o link é null: o main.ts serve do disco.
    expect(await a.linkTemporario('whatsapp/antigo.jpg')).toBeNull();
  });

  it('o link temporário é assinado com o endereço público', async () => {
    send.mockResolvedValue({});
    const a = new Armazenamento({
      raizDisco: raiz,
      s3: S3,
      pastasS3: ['whatsapp'],
    });

    const link = await a.linkTemporario('whatsapp/a.jpg', 60);

    expect(link).toMatch(
      /^https:\/\/s3\.exemplo\.com\.br\/plataforma\/whatsapp\/a\.jpg\?/,
    );
    expect(link).toContain('X-Amz-Expires=60');
  });
});

describe('migrarParaS3', () => {
  let raiz = '';
  let send: jest.SpyInstance;
  beforeEach(async () => {
    raiz = await mkdtemp(join(tmpdir(), 'armazenamento-'));
    await mkdir(join(raiz, 'whatsapp'), { recursive: true });
    await writeFile(join(raiz, 'whatsapp', 'a.jpg'), 'aaa');
    await writeFile(join(raiz, 'whatsapp', 'b.jpg'), 'bb');
    send = jest.spyOn(S3Client.prototype, 'send');
  });
  afterEach(async () => {
    send.mockRestore();
    await rm(raiz, { recursive: true, force: true });
  });

  it('sobe, confere o tamanho e só então tira do disco', async () => {
    // HEAD devolve o tamanho certo para a.jpg e errado para b.jpg.
    send.mockImplementation(
      (c: { constructor: { name: string }; input: { Key: string } }) =>
        Promise.resolve(
          c.constructor.name === 'HeadObjectCommand'
            ? { ContentLength: c.input.Key.endsWith('a.jpg') ? 3 : 99 }
            : {},
        ),
    );
    const a = new Armazenamento({
      raizDisco: raiz,
      s3: S3,
      pastasS3: ['whatsapp'],
    });

    const r = await a.migrarParaS3('whatsapp');

    expect(r).toEqual({
      copiados: 1,
      bytes: 3,
      falhas: ['b.jpg'],
      restantes: 1,
    });
    // O que não conferiu continua no disco.
    expect((await readFile(join(raiz, 'whatsapp', 'b.jpg'))).toString()).toBe(
      'bb',
    );
    expect(await a.situacao()).toEqual({
      s3Configurado: true,
      bucket: 'plataforma',
      conexao: 'ok',
      pastas: [{ pasta: 'whatsapp', noDisco: 1 }],
    });
  });

  it('recusa pasta que não está no S3', async () => {
    const a = new Armazenamento({ raizDisco: raiz, s3: S3, pastasS3: [] });
    await expect(a.migrarParaS3('whatsapp')).rejects.toThrow(
      /não está configurada/,
    );
  });
});

describe('subpastas (whatsapp/<empresaId>/, desde 2026-10-13)', () => {
  let raiz = '';
  beforeEach(async () => {
    raiz = await mkdtemp(join(tmpdir(), 'armazenamento-'));
    await mkdir(join(raiz, 'whatsapp', 'emp-1'), { recursive: true });
    await writeFile(join(raiz, 'whatsapp', 'antigo.jpg'), 'a');
    await writeFile(join(raiz, 'whatsapp', 'emp-1', 'novo.jpg'), 'bb');
  });
  afterEach(() => rm(raiz, { recursive: true, force: true }));

  it('lista e conta o que está solto e o que está na pasta da empresa', async () => {
    const a = new Armazenamento({ raizDisco: raiz, pastasS3: ['whatsapp'] });

    const chaves = (await a.listar('whatsapp')).map((x) => x.chave).sort();
    expect(chaves).toEqual(['whatsapp/antigo.jpg', 'whatsapp/emp-1/novo.jpg']);
  });

  it('a cópia para o S3 leva também as subpastas, na mesma chave', async () => {
    const send: jest.SpyInstance = jest.spyOn(S3Client.prototype, 'send');
    send.mockImplementation(
      (c: { constructor: { name: string }; input: { Key: string } }) =>
        Promise.resolve(
          c.constructor.name === 'HeadObjectCommand'
            ? { ContentLength: c.input.Key.endsWith('novo.jpg') ? 2 : 1 }
            : {},
        ),
    );
    const a = new Armazenamento({
      raizDisco: raiz,
      s3: S3,
      pastasS3: ['whatsapp'],
    });

    const r = await a.migrarParaS3('whatsapp');

    expect(r).toMatchObject({ copiados: 2, falhas: [], restantes: 0 });
    const enviados = send.mock.calls
      .map(
        ([c]) => c as { constructor: { name: string }; input: { Key: string } },
      )
      .filter((c) => c.constructor.name === 'PutObjectCommand')
      .map((c) => c.input.Key)
      .sort();
    expect(enviados).toEqual([
      'whatsapp/antigo.jpg',
      'whatsapp/emp-1/novo.jpg',
    ]);
    send.mockRestore();
  });
});

describe('explicarErroS3', () => {
  it('diz o que conferir para cada falha comum do MinIO', () => {
    expect(explicarErroS3({ code: 'ECONNREFUSED' })).toMatch(
      /fora de alcance.*S3_ENDPOINT/,
    );
    expect(
      explicarErroS3({
        name: 'NoSuchBucket',
        $metadata: { httpStatusCode: 404 },
      }),
    ).toMatch(/bucket "plataforma" não existe/);
    expect(
      explicarErroS3({
        name: 'InvalidAccessKeyId',
        $metadata: { httpStatusCode: 403 },
      }),
    ).toMatch(/S3_ACCESS_KEY e S3_SECRET_KEY/);
    expect(
      explicarErroS3({
        name: 'AccessDenied',
        $metadata: { httpStatusCode: 403 },
      }),
    ).toMatch(/política do usuário/);
  });

  it('erro que não é do S3 não é traduzido', () => {
    expect(explicarErroS3(new Error('outra coisa'))).toBeNull();
  });
});
