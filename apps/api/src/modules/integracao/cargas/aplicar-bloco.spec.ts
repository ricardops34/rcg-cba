import { z } from 'zod';
import type { IntegracaoLoteResultado } from '@plataforma/contracts';
import { aplicarBloco } from './aplicar-bloco';
import type { EntidadeCarga } from './entidades-carga';
import type { LinhaCarga } from './ler-arquivo-carga';

const schema = z.object({ chave: z.string().min(1), descricao: z.string() });

function entidadeFalsa(
  responder: (registros: unknown[]) => IntegracaoLoteResultado,
): EntidadeCarga & { recebidos: unknown[][] } {
  const recebidos: unknown[][] = [];
  return {
    schema,
    recebidos,
    aplicar: (_e, _k, registros) => {
      recebidos.push(registros);
      return Promise.resolve(responder(registros));
    },
  };
}

const linhaCarga = (
  linha: number,
  registro: Record<string, unknown>,
): LinhaCarga => ({
  linha,
  entidade: 'categorias',
  registro,
});

describe('aplicarBloco', () => {
  it('manda só os válidos ao upsertLote e aponta a linha do inválido', async () => {
    const entidade = entidadeFalsa((r) => ({
      processados: r.length,
      criados: r.length,
      atualizados: 0,
      excluidos: 0,
      erros: [],
    }));

    const resultado = await aplicarBloco(entidade, 'emp', 'key', [
      linhaCarga(10, { chave: 'A', descricao: 'x' }),
      linhaCarga(11, { chave: 'B' }),
      linhaCarga(12, { chave: 'C', descricao: 'z' }),
    ]);

    expect(entidade.recebidos).toEqual([
      [
        { chave: 'A', descricao: 'x' },
        { chave: 'C', descricao: 'z' },
      ],
    ]);
    expect(resultado.criados).toBe(2);
    expect(resultado.erros).toEqual([
      { linha: 11, chave: 'B', mensagem: expect.stringContaining('descricao') },
    ]);
  });

  it('traduz o índice do relatório do lote para a linha do arquivo', async () => {
    const entidade = entidadeFalsa(() => ({
      processados: 2,
      criados: 1,
      atualizados: 0,
      excluidos: 0,
      // índice 1 do array enviado = o segundo VÁLIDO, que é a linha 22
      erros: [
        {
          indice: 1,
          chave: 'C',
          mensagem: "vendedorChave '999' não encontrado",
        },
      ],
    }));

    const resultado = await aplicarBloco(entidade, 'emp', 'key', [
      linhaCarga(20, { chave: 'A', descricao: 'x' }),
      linhaCarga(21, { chave: 'B' }),
      linhaCarga(22, { chave: 'C', descricao: 'z' }),
    ]);

    expect(resultado.erros.map((e) => e.linha)).toEqual([21, 22]);
    expect(resultado.erros[1].mensagem).toBe(
      "vendedorChave '999' não encontrado",
    );
  });

  it('não chama o upsertLote quando nada passou no schema', async () => {
    const entidade = entidadeFalsa(() => {
      throw new Error('não devia ser chamado');
    });
    const resultado = await aplicarBloco(entidade, 'emp', 'key', [
      linhaCarga(1, { descricao: 'sem chave' }),
    ]);
    expect(entidade.recebidos).toHaveLength(0);
    expect(resultado.erros).toEqual([
      { linha: 1, chave: null, mensagem: expect.stringContaining('chave') },
    ]);
  });
});
