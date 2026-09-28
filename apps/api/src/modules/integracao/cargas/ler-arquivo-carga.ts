import { gunzipSync, gzipSync } from 'node:zlib';
import {
  INTEGRACAO_CARGA_ENTIDADES,
  type IntegracaoCargaEntidade,
} from '@plataforma/contracts';

/**
 * Teto do arquivo **descompactado**. O limite de upload (100 MB) vale para o
 * que chega, e JSON compacta ~10×: sem este teto, um arquivo pequeno poderia
 * inflar até derrubar a API por memória.
 */
export const CARGA_MAX_DESCOMPACTADO = 512 * 1024 * 1024;

/** Quantos problemas o 400 lista — o suficiente para achar o padrão. */
const MAX_PROBLEMAS = 20;

export interface LinhaCarga {
  /** Número da linha no arquivo, começando em 1 (linhas em branco contam). */
  linha: number;
  entidade: IntegracaoCargaEntidade;
  registro: Record<string, unknown>;
}

export class ArquivoCargaInvalido extends Error {
  constructor(readonly problemas: string[]) {
    super(`Arquivo de carga recusado: ${problemas.join(' | ')}`);
  }
}

const ENTIDADES = new Set<string>(INTEGRACAO_CARGA_ENTIDADES);

/** gzip começa com 1f 8b. Qualquer outra coisa é tratada como texto puro. */
export function ehGzip(conteudo: Buffer): boolean {
  return conteudo.length >= 2 && conteudo[0] === 0x1f && conteudo[1] === 0x8b;
}

/** O arquivo como texto (em bytes), descompactado se veio compactado. */
export function descompactar(conteudo: Buffer): Buffer {
  if (!ehGzip(conteudo)) {
    if (conteudo.length > CARGA_MAX_DESCOMPACTADO) {
      throw new ArquivoCargaInvalido([
        `arquivo passa de ${CARGA_MAX_DESCOMPACTADO / 1024 / 1024} MB — divida em mais de um`,
      ]);
    }
    return conteudo;
  }
  try {
    return gunzipSync(conteudo, { maxOutputLength: CARGA_MAX_DESCOMPACTADO });
  } catch (erro) {
    const codigo = (erro as { code?: string }).code;
    if (codigo === 'ERR_BUFFER_TOO_LARGE') {
      throw new ArquivoCargaInvalido([
        `arquivo descompactado passa de ${CARGA_MAX_DESCOMPACTADO / 1024 / 1024} MB — divida em mais de um`,
      ]);
    }
    throw new ArquivoCargaInvalido(['gzip corrompido ou incompleto']);
  }
}

/** O que guardar no banco: sempre compactado, venha como vier. */
export function compactarParaGuardar(conteudo: Buffer): Buffer {
  return ehGzip(conteudo) ? conteudo : gzipSync(conteudo);
}

/**
 * As linhas do arquivo, uma a uma, sem montar uma string do arquivo inteiro —
 * 500 MB de texto num `toString()` só é o limite de string do V8.
 *
 * `aPartirDe` pula as linhas já aplicadas (retomada): conta as quebras sem
 * fazer parse do que ficou para trás.
 */
export function* linhasDoArquivo(
  texto: Buffer,
  aPartirDe = 0,
): Generator<{ linha: number; conteudo: string }> {
  let inicio = 0;
  let numero = 0;
  // BOM do UTF-8: o Protheus grava com ele conforme a função usada.
  if (texto[0] === 0xef && texto[1] === 0xbb && texto[2] === 0xbf) inicio = 3;

  while (inicio < texto.length) {
    let fim = texto.indexOf(0x0a, inicio);
    if (fim === -1) fim = texto.length;
    numero++;
    if (numero > aPartirDe) {
      let ate = fim;
      if (ate > inicio && texto[ate - 1] === 0x0d) ate--; // CRLF
      const conteudo = texto.toString('utf8', inicio, ate).trim();
      if (conteudo.length > 0) yield { linha: numero, conteudo };
    }
    inicio = fim + 1;
  }
}

/**
 * Lê uma linha: `{"entidade": "...", "registro": {...}}`. Devolve o problema
 * em texto em vez de lançar, para a conferência juntar vários de uma vez.
 */
export function lerLinha(
  linha: number,
  conteudo: string,
): LinhaCarga | { problema: string } {
  let valor: unknown;
  try {
    valor = JSON.parse(conteudo);
  } catch {
    return { problema: `linha ${linha}: não é um JSON válido` };
  }
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    return { problema: `linha ${linha}: esperado um objeto` };
  }
  const { entidade, registro } = valor as {
    entidade?: unknown;
    registro?: unknown;
  };
  if (typeof entidade !== 'string' || !ENTIDADES.has(entidade)) {
    return {
      problema: `linha ${linha}: entidade ${JSON.stringify(entidade ?? null)} não aceita em carga por arquivo`,
    };
  }
  if (!registro || typeof registro !== 'object' || Array.isArray(registro)) {
    return {
      problema: `linha ${linha}: "registro" ausente ou não é um objeto`,
    };
  }
  return {
    linha,
    entidade: entidade as IntegracaoCargaEntidade,
    registro: registro as Record<string, unknown>,
  };
}

/**
 * Confere a **estrutura** do arquivo inteiro antes de aceitá-lo: cada linha é
 * JSON, tem entidade aceita e um registro. Não valida o conteúdo do registro —
 * isso é do schema da entidade, no processamento, e um registro ruim não
 * recusa o arquivo (vai para a lista de erros da carga, como no `PUT`).
 *
 * Um arquivo com a estrutura errada é bug do gerador: aceitar metade dele só
 * produziria uma carga parcial que ninguém saberia completar.
 */
export function conferirArquivo(texto: Buffer): {
  totalLinhas: number;
  entidades: Record<string, number>;
} {
  const problemas: string[] = [];
  const entidades: Record<string, number> = {};
  let totalLinhas = 0;

  for (const { linha, conteudo } of linhasDoArquivo(texto)) {
    const lida = lerLinha(linha, conteudo);
    if ('problema' in lida) {
      if (problemas.length < MAX_PROBLEMAS) problemas.push(lida.problema);
      else if (problemas.length === MAX_PROBLEMAS) problemas.push('...');
      continue;
    }
    totalLinhas++;
    entidades[lida.entidade] = (entidades[lida.entidade] ?? 0) + 1;
  }

  if (problemas.length > 0) throw new ArquivoCargaInvalido(problemas);
  if (totalLinhas === 0)
    throw new ArquivoCargaInvalido(['arquivo sem nenhuma linha']);

  return { totalLinhas, entidades };
}

/**
 * Agrupa as linhas em blocos para o `upsertLote`: até `tamanho` linhas
 * **seguidas da mesma entidade**. Uma troca de entidade fecha o bloco — a
 * ordem do arquivo é a ordem de dependência (vendedor antes de título), e
 * reagrupar por entidade a desfaria.
 */
export function* blocosDoArquivo(
  texto: Buffer,
  aPartirDe: number,
  tamanho: number,
): Generator<{
  entidade: IntegracaoCargaEntidade;
  linhas: LinhaCarga[];
  ultimaLinha: number;
}> {
  let atual: LinhaCarga[] = [];

  for (const { linha, conteudo } of linhasDoArquivo(texto, aPartirDe)) {
    const lida = lerLinha(linha, conteudo);
    // A estrutura foi conferida no recebimento; uma linha ruim aqui só pode
    // ser arquivo trocado no banco. Não há o que aplicar dela.
    if ('problema' in lida) continue;

    if (
      atual.length > 0 &&
      (atual[0].entidade !== lida.entidade || atual.length >= tamanho)
    ) {
      yield {
        entidade: atual[0].entidade,
        linhas: atual,
        ultimaLinha: atual[atual.length - 1].linha,
      };
      atual = [];
    }
    atual.push(lida);
  }

  if (atual.length > 0) {
    yield {
      entidade: atual[0].entidade,
      linhas: atual,
      ultimaLinha: atual[atual.length - 1].linha,
    };
  }
}
