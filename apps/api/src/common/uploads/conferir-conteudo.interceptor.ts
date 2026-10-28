import { open, unlink } from 'node:fs/promises';
import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';

type ArquivoEnviado = {
  mimetype: string;
  path?: string;
  buffer?: Buffer;
};

const inicia = (b: Buffer, ...bytes: number[]) =>
  bytes.every((v, i) => b[i] === v);

/**
 * Assinatura (primeiros bytes) esperada por tipo. Tipo que não está aqui (áudio,
 * vídeo, planilhas, Office) não é conferido: o cabeçalho do cliente é o que há.
 */
const ASSINATURAS: Record<string, (b: Buffer) => boolean> = {
  'image/png': (b) => inicia(b, 0x89, 0x50, 0x4e, 0x47),
  'image/jpeg': (b) => inicia(b, 0xff, 0xd8, 0xff),
  'image/jpg': (b) => inicia(b, 0xff, 0xd8, 0xff),
  'image/gif': (b) => inicia(b, 0x47, 0x49, 0x46, 0x38),
  'image/webp': (b) =>
    b.subarray(0, 4).toString('latin1') === 'RIFF' &&
    b.subarray(8, 12).toString('latin1') === 'WEBP',
  'application/pdf': (b) => b.subarray(0, 1024).toString('latin1').includes('%PDF-'),
  'image/svg+xml': (b) => {
    const t = b.toString('utf8').trimStart().toLowerCase();
    return t.startsWith('<svg') || t.startsWith('<?xml') || t.startsWith('<!doctype svg');
  },
};

/** Quantos bytes bastam para as assinaturas acima (SVG precisa de um pouco mais). */
const BYTES_LIDOS = 1100;

/**
 * SEC-15: o tipo do arquivo vem no cabeçalho do cliente, que é falsificável. Depois
 * do `FileInterceptor`, confere os primeiros bytes contra o tipo declarado e, se não
 * bater, apaga o arquivo e recusa. Vai sempre DEPOIS do `FileInterceptor` na lista.
 */
@Injectable()
export class ConferirConteudoUploadInterceptor implements NestInterceptor {
  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { file?: ArquivoEnviado; files?: ArquivoEnviado[] }>();
    const arquivos = [
      ...(req.file ? [req.file] : []),
      ...(Array.isArray(req.files) ? req.files : []),
    ];
    for (const arquivo of arquivos) {
      const confere = ASSINATURAS[arquivo.mimetype];
      if (!confere) continue;
      const inicio = await this.lerInicio(arquivo);
      if (!inicio || !confere(inicio)) {
        await Promise.all(
          arquivos.map((a) => (a.path ? unlink(a.path).catch(() => undefined) : undefined)),
        );
        throw new BadRequestException(
          'O conteúdo do arquivo não corresponde ao tipo informado.',
        );
      }
    }
    return next.handle();
  }

  private async lerInicio(arquivo: ArquivoEnviado): Promise<Buffer | null> {
    if (arquivo.buffer) return arquivo.buffer.subarray(0, BYTES_LIDOS);
    if (!arquivo.path) return null;
    const fh = await open(arquivo.path, 'r');
    try {
      const buf = Buffer.alloc(BYTES_LIDOS);
      const { bytesRead } = await fh.read(buf, 0, BYTES_LIDOS, 0);
      return buf.subarray(0, bytesRead);
    } finally {
      await fh.close();
    }
  }
}
