import { existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
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

/**
 * Opções do multer para o upload de logo: grava em disco, valida MIME e tamanho.
 * O nome do arquivo é derivado do id da empresa (:id na rota) + timestamp.
 */
export const logoUploadOptions = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      if (!existsSync(LOGOS_DIR)) mkdirSync(LOGOS_DIR, { recursive: true });
      cb(null, LOGOS_DIR);
    },
    filename: (req: Request, file, cb) => {
      const empresaId = req.params.id ?? 'empresa';
      const ext = extname(file.originalname).toLowerCase() || '.png';
      cb(null, `${empresaId}-${Date.now()}${ext}`);
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
