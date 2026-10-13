import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { dirname, join, normalize, sep } from 'node:path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { UPLOADS_DIR } from '../uploads/uploads.config';

/**
 * Onde a plataforma guarda arquivos: em disco (`apps/api/uploads`, o volume
 * `uploads`) ou num S3 — o MinIO da VPS (ver
 * `docs/planos/2026-10-13-armazenamento-arquivos-minio.md`).
 *
 * **A chave é o caminho relativo a `uploads/`** (`whatsapp/<uuid>.jpg`), e o
 * endereço gravado no banco continua `/uploads/<chave>`. Por isso nada no banco
 * nem na tela muda quando uma pasta passa para o S3: quem serve
 * `/uploads/...` (o `main.ts`) pergunta aqui se o arquivo está no S3 e
 * redireciona para um link temporário dele.
 *
 * **A migração é por pasta** (`ARMAZENAMENTO_S3_PASTAS=whatsapp,fichas`). Numa
 * pasta no S3, o que se grava vai para o S3; o que se lê procura no S3 e, não
 * achando, no disco — os arquivos de antes da troca continuam servidos até
 * serem copiados. Apagar remove dos dois.
 */

export interface ConfigS3 {
  /** Endereço usado pela API (rede interna: `http://minio:9000`). */
  endpoint: string;
  /**
   * Endereço que o **navegador** alcança (`https://s3.rcgdist.com.br`). O link
   * temporário é assinado com ele — a assinatura cobre o host, então assinar
   * com o interno daria um link que o navegador não abre.
   */
  endpointPublico: string;
  regiao: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
}

export interface ConfigArmazenamento {
  raizDisco: string;
  s3?: ConfigS3;
  /** Primeiro segmento da chave (`whatsapp`, `fichas`…) que vai para o S3. */
  pastasS3: string[];
}

export interface ArquivoListado {
  chave: string;
  bytes: number;
  modificadoEm: number;
}

/** Validade padrão do link temporário do S3. */
const VALIDADE_LINK_SEGUNDOS = 60 * 60;

export class Armazenamento {
  private readonly s3?: S3Client;
  private readonly s3Publico?: S3Client;

  constructor(private readonly config: ConfigArmazenamento) {
    if (config.s3) {
      const base = {
        region: config.s3.regiao,
        forcePathStyle: true, // MinIO: bucket no caminho, não no subdomínio
        credentials: {
          accessKeyId: config.s3.accessKey,
          secretAccessKey: config.s3.secretKey,
        },
      };
      this.s3 = new S3Client({ ...base, endpoint: config.s3.endpoint });
      this.s3Publico = new S3Client({
        ...base,
        endpoint: config.s3.endpointPublico,
      });
    }
  }

  /** A chave cai numa pasta configurada para o S3 (e há S3 configurado)? */
  noS3(chave: string) {
    return (
      !!this.s3 &&
      this.config.pastasS3.includes(validarChave(chave).split('/')[0])
    );
  }

  async gravar(chave: string, conteudo: Buffer, mime?: string) {
    validarChave(chave);
    if (this.noS3(chave)) {
      await this.s3!.send(
        new PutObjectCommand({
          Bucket: this.config.s3!.bucket,
          Key: chave,
          Body: conteudo,
          ContentType: mime,
        }),
      );
      return;
    }
    const caminho = this.caminhoDisco(chave);
    await mkdir(dirname(caminho), { recursive: true });
    await writeFile(caminho, conteudo);
  }

  /**
   * Grava um arquivo local grande (o pacote de backup) sem carregá-lo na
   * memória: stream para o S3, cópia para o disco. O local fica onde está.
   */
  async gravarArquivo(chave: string, caminhoLocal: string, mime?: string) {
    validarChave(chave);
    if (this.noS3(chave)) {
      const { size } = await stat(caminhoLocal);
      await this.s3!.send(
        new PutObjectCommand({
          Bucket: this.config.s3!.bucket,
          Key: chave,
          Body: createReadStream(caminhoLocal),
          ContentLength: size,
          ContentType: mime,
        }),
      );
      return;
    }
    const destino = this.caminhoDisco(chave);
    await mkdir(dirname(destino), { recursive: true });
    await copyFile(caminhoLocal, destino);
  }

  /** Conteúdo do arquivo, ou `null` se não existe em lugar nenhum. */
  async ler(chave: string): Promise<Buffer | null> {
    validarChave(chave);
    if (this.noS3(chave)) {
      try {
        const r = await this.s3!.send(
          new GetObjectCommand({ Bucket: this.config.s3!.bucket, Key: chave }),
        );
        if (r.Body) return Buffer.from(await r.Body.transformToByteArray());
      } catch (erro) {
        if (!naoEncontrado(erro)) throw erro;
      }
    }
    return readFile(this.caminhoDisco(chave)).catch(
      (erro: NodeJS.ErrnoException) => {
        if (erro.code === 'ENOENT') return null;
        throw erro;
      },
    );
  }

  /**
   * Caminho no disco, se o arquivo está lá — para quem lê em stream (o zip do
   * backup) não carregar o arquivo na memória. `null` se só existe no S3 ou
   * em lugar nenhum.
   */
  async caminhoNoDisco(chave: string): Promise<string | null> {
    const caminho = this.caminhoDisco(validarChave(chave));
    const info = await stat(caminho).catch(() => null);
    return info?.isFile() ? caminho : null;
  }

  /** Apaga dos dois lugares. Já não existir não é erro. */
  async apagar(chave: string) {
    validarChave(chave);
    if (this.noS3(chave)) {
      await this.s3!.send(
        new DeleteObjectCommand({ Bucket: this.config.s3!.bucket, Key: chave }),
      );
    }
    await unlink(this.caminhoDisco(chave)).catch(
      (erro: NodeJS.ErrnoException) => {
        if (erro.code !== 'ENOENT') throw erro;
      },
    );
  }

  /**
   * Link temporário do S3 para o navegador, ou `null` quando o arquivo deve
   * ser servido do disco (pasta fora do S3, ou arquivo de antes da troca que
   * ainda não foi copiado).
   */
  async linkTemporario(chave: string, segundos = VALIDADE_LINK_SEGUNDOS) {
    if (!this.noS3(chave)) return null;
    try {
      await this.s3!.send(
        new HeadObjectCommand({ Bucket: this.config.s3!.bucket, Key: chave }),
      );
    } catch (erro) {
      if (naoEncontrado(erro)) return null;
      throw erro;
    }
    return getSignedUrl(
      this.s3Publico!,
      new GetObjectCommand({ Bucket: this.config.s3!.bucket, Key: chave }),
      { expiresIn: segundos },
    );
  }

  /** Arquivos de uma pasta (`whatsapp`), do disco e do S3, sem repetir. */
  async listar(pasta: string): Promise<ArquivoListado[]> {
    validarChave(pasta);
    const porChave = new Map<string, ArquivoListado>();

    const raiz = this.caminhoDisco(pasta);
    const nomes = await readdir(raiz).catch((erro: NodeJS.ErrnoException) => {
      if (erro.code === 'ENOENT') return [] as string[];
      throw erro;
    });
    for (const nome of nomes) {
      const info = await stat(join(raiz, nome)).catch(() => null);
      if (!info?.isFile()) continue;
      const chave = `${pasta}/${nome}`;
      porChave.set(chave, {
        chave,
        bytes: info.size,
        modificadoEm: info.mtimeMs,
      });
    }

    if (this.noS3(`${pasta}/x`)) {
      let continuacao: string | undefined;
      do {
        const r = await this.s3!.send(
          new ListObjectsV2Command({
            Bucket: this.config.s3!.bucket,
            Prefix: `${pasta}/`,
            ContinuationToken: continuacao,
          }),
        );
        for (const o of r.Contents ?? []) {
          if (!o.Key) continue;
          porChave.set(o.Key, {
            chave: o.Key,
            bytes: o.Size ?? 0,
            modificadoEm: o.LastModified?.getTime() ?? 0,
          });
        }
        continuacao = r.IsTruncated ? r.NextContinuationToken : undefined;
      } while (continuacao);
    }

    return [...porChave.values()];
  }

  /** Para a tela: se há S3, quais pastas vão para ele e quanto ainda está em disco. */
  async situacao() {
    const pastas = await Promise.all(
      this.config.pastasS3.map(async (pasta) => ({
        pasta,
        noDisco: (
          await readdir(this.caminhoDisco(pasta)).catch(() => [] as string[])
        ).length,
      })),
    );
    return {
      s3Configurado: !!this.s3,
      bucket: this.config.s3?.bucket ?? null,
      pastas,
    };
  }

  /**
   * Leva para o S3 até `limite` arquivos que ainda estão no disco numa pasta
   * já configurada para o S3. Cada um: sobe, confere o tamanho lá e só então
   * sai do disco. Chamado em rodadas até `restantes` zerar — uma requisição
   * só para gigabytes estouraria o tempo de qualquer proxy.
   */
  async migrarParaS3(pasta: string, limite = 200) {
    validarChave(pasta);
    if (!this.noS3(`${pasta}/x`)) {
      throw new Error(`A pasta ${pasta} não está configurada para o S3.`);
    }
    const raiz = this.caminhoDisco(pasta);
    const nomes = await readdir(raiz).catch((erro: NodeJS.ErrnoException) => {
      if (erro.code === 'ENOENT') return [] as string[];
      throw erro;
    });

    let copiados = 0;
    let bytes = 0;
    const falhas: string[] = [];
    for (const nome of nomes.slice(0, limite)) {
      const caminho = join(raiz, nome);
      const info = await stat(caminho).catch(() => null);
      if (!info?.isFile()) continue;
      const chave = `${pasta}/${nome}`;
      try {
        await this.s3!.send(
          new PutObjectCommand({
            Bucket: this.config.s3!.bucket,
            Key: chave,
            Body: await readFile(caminho),
          }),
        );
        const conferido = await this.s3!.send(
          new HeadObjectCommand({ Bucket: this.config.s3!.bucket, Key: chave }),
        );
        if (conferido.ContentLength !== info.size)
          throw new Error('tamanho diferente');
        await unlink(caminho);
        copiados += 1;
        bytes += info.size;
      } catch {
        falhas.push(nome);
      }
    }

    const restantes = (await readdir(raiz).catch(() => [] as string[])).length;
    return { copiados, bytes, falhas, restantes };
  }

  private caminhoDisco(chave: string) {
    return join(this.config.raizDisco, ...chave.split('/'));
  }
}

/**
 * Chave relativa, sem `..`, sem barra no começo, sem `\`. Um nome vindo do
 * banco ou de quem enviou nunca escapa de `uploads/`.
 */
export function validarChave(chave: string) {
  const normal = normalize(chave).split(sep).join('/');
  if (
    !chave ||
    chave.startsWith('/') ||
    chave.includes('\\') ||
    normal !== chave ||
    chave.split('/').some((p) => p === '..' || p === '.' || p === '')
  ) {
    throw new Error(`Chave de armazenamento inválida: ${chave}`);
  }
  return chave;
}

/** `/uploads/whatsapp/a.jpg?exp=…` → `whatsapp/a.jpg`; outro endereço → `null`. */
export function chaveDoEndereco(endereco: string | null | undefined) {
  if (!endereco) return null;
  const caminho = endereco.split('?')[0];
  if (!caminho.startsWith('/uploads/')) return null;
  try {
    return validarChave(decodeURIComponent(caminho.slice('/uploads/'.length)));
  } catch {
    return null;
  }
}

function naoEncontrado(erro: unknown) {
  const e = erro as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    e?.name === 'NoSuchKey' ||
    e?.name === 'NotFound' ||
    e?.$metadata?.httpStatusCode === 404
  );
}

/** Lê a configuração do ambiente. S3 só com todas as variáveis preenchidas. */
export function configDoAmbiente(env = process.env): ConfigArmazenamento {
  const pastasS3 = (env.ARMAZENAMENTO_S3_PASTAS ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const endpoint = env.S3_ENDPOINT?.trim();
  const bucket = env.S3_BUCKET?.trim();
  const accessKey = env.S3_ACCESS_KEY?.trim();
  const secretKey = env.S3_SECRET_KEY?.trim();
  const s3 =
    endpoint && bucket && accessKey && secretKey
      ? {
          endpoint,
          endpointPublico: env.S3_ENDPOINT_PUBLICO?.trim() || endpoint,
          regiao: env.S3_REGIAO?.trim() || 'us-east-1',
          bucket,
          accessKey,
          secretKey,
        }
      : undefined;
  return { raizDisco: UPLOADS_DIR, s3, pastasS3 };
}

let padrao: Armazenamento | undefined;

/**
 * A instância da aplicação, criada na primeira chamada. Função e não injeção
 * do Nest: quem grava arquivo inclui funções soltas (`apagarArquivosDaMidia`)
 * e o middleware do `main.ts`.
 */
export function armazenamento() {
  padrao ??= new Armazenamento(configDoAmbiente());
  return padrao;
}
