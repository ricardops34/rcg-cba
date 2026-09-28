import type { ZodError } from 'zod';
import type { EntidadeCarga } from './entidades-carga';
import type { LinhaCarga } from './ler-arquivo-carga';

export interface ErroDeLinha {
  linha: number;
  chave: string | null;
  mensagem: string;
}

export interface ResultadoBloco {
  criados: number;
  atualizados: number;
  excluidos: number;
  erros: ErroDeLinha[];
}

/** Mensagem do erro gravada por linha — o suficiente para achar a causa. */
const MAX_MENSAGEM = 1000;

/** `campo: motivo; campo: motivo` — o caminho diz ao ERP qual campo faltou. */
function mensagemDoSchema(erro: ZodError): string {
  return erro.issues
    .map((i) =>
      i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message,
    )
    .join('; ');
}

function chaveDe(registro: Record<string, unknown>): string | null {
  return typeof registro.chave === 'string' ? registro.chave : null;
}

/**
 * Aplica um bloco de linhas da mesma entidade: valida cada registro pelo
 * schema do `PUT` e grava os válidos pelo `upsertLote` — o mesmo caminho do
 * `PUT /integracao/<entidade>`.
 *
 * A diferença para o `PUT` é só onde o erro de schema aparece: lá um item
 * inválido recusa o envelope inteiro com 400; aqui ele vira erro **daquela
 * linha** e o resto do bloco segue. Recusar mil linhas por uma, num arquivo
 * que já foi aceito, deixaria a carga sem ter como continuar.
 */
export async function aplicarBloco(
  entidade: EntidadeCarga,
  empresaId: string,
  apiKeyId: string,
  linhas: LinhaCarga[],
): Promise<ResultadoBloco> {
  const erros: ErroDeLinha[] = [];
  const validos: { linha: number; registro: unknown }[] = [];

  for (const l of linhas) {
    const conferido = entidade.schema.safeParse(l.registro);
    if (conferido.success) {
      validos.push({ linha: l.linha, registro: conferido.data });
    } else {
      erros.push({
        linha: l.linha,
        chave: chaveDe(l.registro),
        mensagem: mensagemDoSchema(conferido.error).slice(0, MAX_MENSAGEM),
      });
    }
  }

  let criados = 0;
  let atualizados = 0;
  let excluidos = 0;

  if (validos.length > 0) {
    const resultado = await entidade.aplicar(
      empresaId,
      apiKeyId,
      validos.map((v) => v.registro),
    );
    criados = resultado.criados;
    atualizados = resultado.atualizados;
    excluidos = resultado.excluidos;

    // O índice do relatório é a posição no array enviado ao upsertLote, que
    // tem só os válidos — é por `validos` que se volta à linha do arquivo.
    for (const e of resultado.erros) {
      erros.push({
        linha: validos[e.indice]?.linha ?? 0,
        chave: e.chave,
        mensagem: e.mensagem.slice(0, MAX_MENSAGEM),
      });
    }
  }

  erros.sort((a, b) => a.linha - b.linha);
  return { criados, atualizados, excluidos, erros };
}
