import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { WHATSAPP_DIR } from '../../common/uploads/uploads.config';
import { apagarArquivosDaMidia, arquivoDaMidia } from './midia-arquivos';

describe('arquivoDaMidia', () => {
  it('tira o nome do endereço da pasta da mídia, com ou sem assinatura', () => {
    expect(arquivoDaMidia('/uploads/whatsapp/a.jpg')).toBe('a.jpg');
    expect(arquivoDaMidia('/uploads/whatsapp/a.jpg?exp=1&sig=x')).toBe('a.jpg');
  });

  it('ignora o que não é da pasta da mídia e não sai dela', () => {
    expect(arquivoDaMidia(null)).toBeNull();
    expect(arquivoDaMidia('/uploads/logos/a.png')).toBeNull();
    expect(arquivoDaMidia('https://cdn.exemplo/a.jpg')).toBeNull();
    expect(arquivoDaMidia('/uploads/whatsapp/../logos/a.png')).toBe('a.png');
    expect(arquivoDaMidia('/uploads/whatsapp/..')).toBeNull();
  });
});

describe('apagarArquivosDaMidia', () => {
  const nomes = ['teste-apagar-1.jpg', 'teste-apagar-2.pdf'];

  beforeAll(() => mkdir(WHATSAPP_DIR, { recursive: true }));
  afterAll(() =>
    Promise.all(nomes.map((n) => rm(join(WHATSAPP_DIR, n), { force: true }))),
  );

  it('apaga os arquivos e conta o que já não existia como apagado', async () => {
    await writeFile(join(WHATSAPP_DIR, nomes[0]), 'x');

    const r = await apagarArquivosDaMidia([
      `/uploads/whatsapp/${nomes[0]}`,
      `/uploads/whatsapp/${nomes[0]}`, // repetido: uma vez só
      `/uploads/whatsapp/${nomes[1]}`, // não existe
      null,
    ]);

    expect(r).toEqual({ apagados: 2, falhas: [] });
    expect(await readdir(WHATSAPP_DIR)).not.toContain(nomes[0]);
  });
});
