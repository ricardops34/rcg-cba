import { existsSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import type { Request } from 'express';

/**
 * Diretório raiz dos arquivos enviados pelos usuários (logos de empresa, etc.).
 * Fica em apps/api/uploads e é servido estaticamente em /uploads.
 *
 * Em produção isto deve apontar para um volume persistente ou ser trocado por
 * um storage de objetos (S3/GCS); em disco local os arquivos se perdem a cada
 * redeploy do container.
 */
export const UPLOADS_DIR = join(process.cwd(), 'uploads');

export const LOGOS_DIR = join(UPLOADS_DIR, 'logos');

/** Tamanho máximo aceito para o logo de uma empresa (2 MB). */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** Tipos de imagem aceitos no upload de logo. */
export const LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

/** Caminho público (servido em /uploads) de um arquivo salvo em LOGOS_DIR. */
export function logoPublicPath(filename: string) {
  return `/uploads/logos/${filename}`;
}

/** Mídia de conversa de WhatsApp (enviada e recebida). */
export const WHATSAPP_DIR = join(UPLOADS_DIR, 'whatsapp');

/** Teto do WhatsApp para anexo. Arquivo maior é recusado pelo provedor. */
export const WHATSAPP_MAX_BYTES = 16 * 1024 * 1024;

/** Caminho público (servido em /uploads) de um arquivo de conversa. */
export function whatsappPublicPath(filename: string) {
  return `/uploads/whatsapp/${filename}`;
}

/**
 * Extensão a partir do MIME.
 *
 * Nunca derivada do nome enviado pelo cliente: `file.originalname` pode
 * conter `../` e o multer não sanitiza o retorno de `filename` — seria um
 * path traversal na hora de gravar. O que o usuário mandou como nome fica
 * guardado na coluna `arquivoNome`, para exibição, e não toca o disco.
 */
export function extensaoPorMime(mime: string): string {
  const mapa: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/3gpp': '.3gp',
    'video/quicktime': '.mov',
    'audio/ogg': '.ogg',
    'audio/ogg; codecs=opus': '.ogg',
    'audio/mpeg': '.mp3',
    'audio/mp4': '.m4a',
    'audio/aac': '.aac',
    'audio/webm': '.webm',
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'text/plain': '.txt',
    'text/csv': '.csv',
    'application/zip': '.zip',
  };
  return mapa[mime] ?? '.bin';
}

/**
 * Opções do multer para anexo de conversa.
 *
 * Sem lista branca de MIME, ao contrário do logo: o vendedor manda para o
 * cliente o que o negócio pedir (planilha, PDF, foto, áudio), e o arquivo não
 * é executado nem servido como HTML — o nome em disco é sempre um UUID com
 * extensão derivada do MIME.
 */
export const whatsappUploadOptions = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      if (!existsSync(WHATSAPP_DIR)) mkdirSync(WHATSAPP_DIR, { recursive: true });
      cb(null, WHATSAPP_DIR);
    },
    filename: (_req: Request, file, cb) => {
      cb(null, `${randomUUID()}${extensaoPorMime(file.mimetype)}`);
    },
  }),
  limits: { fileSize: WHATSAPP_MAX_BYTES },
};

/** Extensões aceitas — mapeadas 1:1 a LOGO_MIME_TYPES, nunca derivadas do nome enviado pelo cliente. */
const EXT_POR_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
};

/**
 * Opções do multer para o upload de logo: grava em disco, valida MIME e tamanho.
 *
 * O nome do arquivo NUNCA deriva de input do cliente (nem `:id` da rota, nem
 * `file.originalname`/extname dele) — ambos podem conter sequências como
 * `../` (via segmento de rota percent-encoded, ou nome de arquivo forjado) e
 * o multer não sanitiza o valor retornado por `filename`, então uma extensão
 * ou nome malicioso vira um path traversal na hora de gravar em disco. O
 * nome final é sempre um UUID gerado no servidor + extensão fixa por MIME
 * (validado por fileFilter antes deste callback rodar).
 */
export const logoUploadOptions = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      if (!existsSync(LOGOS_DIR)) mkdirSync(LOGOS_DIR, { recursive: true });
      cb(null, LOGOS_DIR);
    },
    filename: (_req: Request, file, cb) => {
      const ext = EXT_POR_MIME[file.mimetype] ?? '.png';
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: LOGO_MAX_BYTES },
  fileFilter: (
    _req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (!LOGO_MIME_TYPES.includes(file.mimetype)) {
      return cb(
        new BadRequestException('Formato inválido. Envie PNG, JPEG, WEBP ou SVG.'),
        false,
      );
    }
    cb(null, true);
  },
};
