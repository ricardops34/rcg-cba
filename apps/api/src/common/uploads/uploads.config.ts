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
export const PRODUTOS_DIR = join(UPLOADS_DIR, 'produtos');
/** Fichas técnicas em PDF, anexadas ao produto. */
export const FICHAS_DIR = join(UPLOADS_DIR, 'fichas');
/**
 * PDFs esperando na fila de importação em lote.
 *
 * Diretório separado do das fichas porque o ciclo de vida é outro: aqui o
 * arquivo pode ser descartado sem dono, e ao virar ficha ele é **copiado**
 * para o outro diretório — descartar o item da fila depois não pode apagar o
 * PDF que um produto já usa.
 */
export const FICHAS_IMPORTACAO_DIR = join(UPLOADS_DIR, 'fichas-importacao');
/**
 * Arquivos anexados a uma mensagem do assistente interno.
 *
 * Diretório próprio porque o ciclo de vida é outro: o anexo é material de
 * passagem — vira ficha ou foto, e o que fica guardado de verdade é a cópia no
 * diretório de destino.
 */
export const AGENTE_DIR = join(UPLOADS_DIR, 'agente');
/** Imagem da faixa institucional do topo do sistema, por empresa. */
export const BANNERS_DIR = join(UPLOADS_DIR, 'banners');
export const BANCOS_DIR = join(UPLOADS_DIR, 'bancos');

/** Tamanho máximo aceito para o logo de uma empresa (2 MB). */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** Tipos de imagem aceitos no upload de logo. */
export const LOGO_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
];

/** Caminho público (servido em /uploads) de um arquivo salvo em LOGOS_DIR. */
export function logoPublicPath(filename: string) {
  return `/uploads/logos/${filename}`;
}

export function bancoLogoPublicPath(filename: string) {
  return `/uploads/bancos/${filename}`;
}

export function produtoFotoPublicPath(filename: string) {
  return `/uploads/produtos/${filename}`;
}

export function fichaPublicPath(filename: string) {
  return `/uploads/fichas/${filename}`;
}

/**
 * O que o assistente aceita como anexo: PDF (ficha técnica) e imagem (foto do
 * produto).
 *
 * A lista é branca, ao contrário do anexo de WhatsApp: aqui o arquivo é
 * **enviado a um provedor externo de IA**, e só faz sentido mandar o que ele
 * sabe ler. Um .docx viraria uma cobrança e um erro do provedor.
 */
export const AGENTE_ANEXO_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
];

/**
 * Teto do anexo do assistente (10 MB).
 *
 * Menor que o do WhatsApp de propósito: o arquivo vai em base64 dentro do
 * corpo da requisição ao provedor, o que já o infla em um terço, e provedor
 * nenhum aceita um documento de 16 MB numa chamada de chat.
 */
export const AGENTE_ANEXO_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Upload em lote de fichas técnicas: só PDF.
 *
 * A leitura é do modelo, e imagem solta não é ficha técnica — quem tem a foto
 * do produto usa a importação de fotos, que é outra tela e não custa uma
 * chamada de IA por arquivo.
 */
export const fichaImportacaoUploadOptions = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      if (!existsSync(FICHAS_IMPORTACAO_DIR)) {
        mkdirSync(FICHAS_IMPORTACAO_DIR, { recursive: true });
      }
      cb(null, FICHAS_IMPORTACAO_DIR);
    },
    filename: (_req: Request, file, cb) => {
      cb(null, `${randomUUID()}${extensaoPorMime(file.mimetype)}`);
    },
  }),
  limits: { fileSize: AGENTE_ANEXO_MAX_BYTES },
  fileFilter: (
    _req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(
        new BadRequestException(
          `${file.originalname}: só PDF nesta importação.`,
        ),
        false,
      );
    }
    cb(null, true);
  },
};

export const agenteAnexoUploadOptions = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      if (!existsSync(AGENTE_DIR)) mkdirSync(AGENTE_DIR, { recursive: true });
      cb(null, AGENTE_DIR);
    },
    filename: (_req: Request, file, cb) => {
      cb(null, `${randomUUID()}${extensaoPorMime(file.mimetype)}`);
    },
  }),
  limits: { fileSize: AGENTE_ANEXO_MAX_BYTES },
  fileFilter: (
    _req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (!AGENTE_ANEXO_MIME_TYPES.includes(file.mimetype)) {
      return cb(
        new BadRequestException(
          'Formato inválido. Envie PDF, PNG, JPEG ou WEBP.',
        ),
        false,
      );
    }
    cb(null, true);
  },
};

/** Caminho público (servido em /uploads) de um arquivo salvo em BANNERS_DIR. */
export function bannerPublicPath(filename: string) {
  return `/uploads/banners/${filename}`;
}

export const produtoFotoUploadOptions = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      if (!existsSync(PRODUTOS_DIR))
        mkdirSync(PRODUTOS_DIR, { recursive: true });
      cb(null, PRODUTOS_DIR);
    },
    filename: (_req: Request, file, cb) => {
      cb(
        null,
        `${randomUUID()}${file.mimetype === 'image/png' ? '.png' : '.jpg'}`,
      );
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (
    _req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (!['image/png', 'image/jpeg'].includes(file.mimetype)) {
      return cb(
        new BadRequestException('Formato inválido. Envie PNG ou JPEG.'),
        false,
      );
    }
    cb(null, true);
  },
};

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
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      '.xlsx',
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
      if (!existsSync(WHATSAPP_DIR))
        mkdirSync(WHATSAPP_DIR, { recursive: true });
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
/**
 * Upload da imagem da faixa institucional. Mesmas regras do logo (2 MB, PNG /
 * JPEG / WEBP / SVG, nome gerado no servidor) — muda só o diretório, para que
 * a troca de um não apague o outro.
 */
export const bannerUploadOptions = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      if (!existsSync(BANNERS_DIR)) mkdirSync(BANNERS_DIR, { recursive: true });
      cb(null, BANNERS_DIR);
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
        new BadRequestException(
          'Formato inválido. Envie PNG, JPEG, WEBP ou SVG.',
        ),
        false,
      );
    }
    cb(null, true);
  },
};

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
        new BadRequestException(
          'Formato inválido. Envie PNG, JPEG, WEBP ou SVG.',
        ),
        false,
      );
    }
    cb(null, true);
  },
};

export const bancoLogoUploadOptions = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      if (!existsSync(BANCOS_DIR)) mkdirSync(BANCOS_DIR, { recursive: true });
      cb(null, BANCOS_DIR);
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
        new BadRequestException(
          'Formato inválido. Envie PNG, JPEG, WEBP ou SVG.',
        ),
        false,
      );
    }
    cb(null, true);
  },
};
