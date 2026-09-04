import type { IntegracaoLoteErro, IntegracaoLoteResultado } from '@plataforma/contracts';

/** O que aconteceu com um registro do lote. */
export type AcaoLote = 'criado' | 'atualizado' | 'excluido';

/** Todo item de lote traz a chave, e pode pedir a exclusão em vez do upsert. */
export type ItemLote = { codigoErp: string; excluido?: boolean };

/**
 * Aplica os registros de um lote, um a um, e devolve o relatório.
 *
 * **Sequencial, na ordem recebida** — de propósito, duas vezes:
 *
 * 1. Dependência dentro do próprio lote. Categoria pai antes da filha, cliente
 *    antes da nota. Em paralelo o segundo registro pode não achar o primeiro,
 *    e o ERP não teria como corrigir senão quebrando o lote na mão.
 * 2. Dois registros da mesma chave no mesmo lote (acontece em
 *    ressincronização) viram duas transações concorrentes de upsert sobre a
 *    mesma linha, que é receita de deadlock. Em série, o segundo simplesmente
 *    atualiza o que o primeiro criou.
 *
 * O custo é tempo de parede, não de banco: ~1.000 transações curtas por
 * chamada. Continua sendo ordens de grandeza melhor do que 1.000 requisições
 * HTTP contra um teto de 60/min, que era o desenho anterior.
 *
 * **Um item ruim não derruba o lote.** Cada `aplicar` roda na sua própria
 * transação (é o `withTenant` de cada service), então o que já passou está
 * gravado. O erro é registrado com o índice e o lote segue. Quem chama recebe
 * 200 com o relatório e decide — reenviar só os índices que falharam é o
 * caminho normal.
 */
export async function processarLote<T extends ItemLote>(
  registros: T[],
  aplicar: (item: T) => Promise<AcaoLote>,
): Promise<IntegracaoLoteResultado> {
  const erros: IntegracaoLoteErro[] = [];
  let criados = 0;
  let atualizados = 0;
  let excluidos = 0;

  for (const [indice, item] of registros.entries()) {
    try {
      const acao = await aplicar(item);
      if (acao === 'criado') criados++;
      else if (acao === 'atualizado') atualizados++;
      else excluidos++;
    } catch (erro) {
      erros.push({
        indice,
        codigoErp: item.codigoErp ?? null,
        mensagem: mensagemDoErro(erro),
      });
    }
  }

  return {
    processados: registros.length,
    criados,
    atualizados,
    excluidos,
    erros,
  };
}

/**
 * Texto legível de um erro para o relatório.
 *
 * As exceções do Nest (`NotFoundException` e companhia) guardam a mensagem útil
 * em `response.message`, que pode ser string ou array — o `message` de fora
 * traz só "Not Found" nesses casos, que não diz nada a quem está conferindo um
 * lote de mil registros.
 */
function mensagemDoErro(erro: unknown): string {
  if (erro && typeof erro === 'object' && 'response' in erro) {
    const resposta = (erro as { response?: unknown }).response;
    if (typeof resposta === 'string') return resposta;
    if (resposta && typeof resposta === 'object' && 'message' in resposta) {
      const mensagem = (resposta as { message?: unknown }).message;
      if (typeof mensagem === 'string') return mensagem;
      if (Array.isArray(mensagem)) return mensagem.join('; ');
    }
  }
  if (erro instanceof Error) return erro.message;
  return String(erro);
}
