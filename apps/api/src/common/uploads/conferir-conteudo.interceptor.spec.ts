import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { ConferirConteudoUploadInterceptor } from './conferir-conteudo.interceptor';

describe('ConferirConteudoUploadInterceptor (SEC-15)', () => {
  const interceptor = new ConferirConteudoUploadInterceptor();
  const next = { handle: jest.fn().mockReturnValue('ok') };
  const ctx = (file: unknown) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ file }) }) }) as never;
  const dir = mkdtempSync(join(tmpdir(), 'conf-'));

  it('PNG de verdade passa', async () => {
    const p = join(dir, 'a.png');
    writeFileSync(p, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]));
    await expect(interceptor.intercept(ctx({ mimetype: 'image/png', path: p }), next)).resolves.toBe('ok');
    expect(existsSync(p)).toBe(true);
  });

  it('HTML dizendo ser PNG é recusado e o arquivo é apagado', async () => {
    const p = join(dir, 'b.png');
    writeFileSync(p, '<html><script>alert(1)</script></html>');
    await expect(
      interceptor.intercept(ctx({ mimetype: 'image/png', path: p }), next),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(existsSync(p)).toBe(false);
  });

  it('buffer em memória e PDF', async () => {
    await expect(
      interceptor.intercept(ctx({ mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.7 ...') }), next),
    ).resolves.toBe('ok');
    await expect(
      interceptor.intercept(ctx({ mimetype: 'application/pdf', buffer: Buffer.from('MZ....') }), next),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('SVG precisa parecer SVG; tipo não conferido passa', async () => {
    await expect(
      interceptor.intercept(ctx({ mimetype: 'image/svg+xml', buffer: Buffer.from('  <svg xmlns="x"/>') }), next),
    ).resolves.toBe('ok');
    await expect(
      interceptor.intercept(ctx({ mimetype: 'audio/ogg', buffer: Buffer.from('qualquer') }), next),
    ).resolves.toBe('ok');
  });
});
