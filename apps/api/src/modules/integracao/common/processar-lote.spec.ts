import { NotFoundException } from '@nestjs/common';
import { processarLote, type AcaoLote } from './processar-lote';

describe('processarLote', () => {
  it('conta cada acao separadamente', async () => {
    const acoes: Record<string, AcaoLote> = {
      A: 'criado',
      B: 'atualizado',
      C: 'atualizado',
      D: 'excluido',
    };
    const resultado = await processarLote(
      [{ codigoErp: 'A' }, { codigoErp: 'B' }, { codigoErp: 'C' }, { codigoErp: 'D' }],
      (item) => Promise.resolve(acoes[item.codigoErp]),
    );

    expect(resultado).toEqual({
      processados: 4,
      criados: 1,
      atualizados: 2,
      excluidos: 1,
      erros: [],
    });
  });

  it('registra o item que falhou e segue com os demais', async () => {
    const aplicados: string[] = [];
    const resultado = await processarLote(
      [{ codigoErp: 'A' }, { codigoErp: 'B' }, { codigoErp: 'C' }],
      (item) => {
        if (item.codigoErp === 'B') {
          throw new NotFoundException("vendedorCodigo '000999' não encontrado");
        }
        aplicados.push(item.codigoErp);
        return Promise.resolve('criado' as AcaoLote);
      },
    );

    // O que passou continua gravado: o lote não é tudo-ou-nada.
    expect(aplicados).toEqual(['A', 'C']);
    expect(resultado.processados).toBe(3);
    expect(resultado.criados).toBe(2);
    expect(resultado.erros).toEqual([
      {
        indice: 1,
        codigoErp: 'B',
        mensagem: "vendedorCodigo '000999' não encontrado",
      },
    ]);
  });

  it('aplica na ordem recebida, para o registro que depende de outro do mesmo lote', async () => {
    const ordem: string[] = [];
    await processarLote(
      [{ codigoErp: 'pai' }, { codigoErp: 'filho' }],
      async (item) => {
        // Espera decrescente: em paralelo, 'filho' terminaria antes de 'pai'.
        await new Promise((r) => setTimeout(r, item.codigoErp === 'pai' ? 20 : 1));
        ordem.push(item.codigoErp);
        return 'criado';
      },
    );

    expect(ordem).toEqual(['pai', 'filho']);
  });

  it('encaminha a exclusao pedida no proprio registro', async () => {
    const resultado = await processarLote(
      [{ codigoErp: 'A', excluido: true }],
      (item) => Promise.resolve(item.excluido ? 'excluido' : 'criado'),
    );

    expect(resultado.excluidos).toBe(1);
    expect(resultado.criados).toBe(0);
  });

  it('extrai a mensagem util da excecao do Nest, nao o "Not Found" de fora', async () => {
    const resultado = await processarLote([{ codigoErp: 'A' }], () => {
      throw new NotFoundException('Categoria não encontrada');
    });

    expect(resultado.erros[0].mensagem).toBe('Categoria não encontrada');
  });

  it('junta as mensagens quando a excecao traz uma lista', async () => {
    const resultado = await processarLote([{ codigoErp: 'A' }], () => {
      throw new NotFoundException(['descricao é obrigatório', 'ativo é obrigatório']);
    });

    expect(resultado.erros[0].mensagem).toBe(
      'descricao é obrigatório; ativo é obrigatório',
    );
  });

  it('nao quebra com erro que nao e excecao do Nest', async () => {
    const resultado = await processarLote([{ codigoErp: 'A' }], () => {
      throw new Error('conexao perdida');
    });

    expect(resultado.erros[0].mensagem).toBe('conexao perdida');
  });

  it('devolve relatorio zerado para lote sem registros', async () => {
    const resultado = await processarLote([], () => Promise.resolve('criado'));

    expect(resultado).toEqual({
      processados: 0,
      criados: 0,
      atualizados: 0,
      excluidos: 0,
      erros: [],
    });
  });
});
