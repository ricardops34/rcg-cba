import { BadRequestException, ConflictException } from '@nestjs/common';
import type { TenantTx } from '../../common/prisma/prisma.service';
import { resolverTabelaPrecoCliente } from '../../common/precos/resolver-tabela-preco-cliente';

/**
 * Tabela de preços com que o orçamento é precificado.
 *
 * Nasce a do cadastro do cliente (`resolverTabelaPrecoCliente`, com o padrão de
 * capital/interior quando o cadastro está vazio ou inativo). Trocar por outra
 * só vale com o parâmetro ORCAMENTO_ALTERA_TABELA_PRECO ligado — a trava é
 * aqui, no servidor, e não só o campo desabilitado na tela.
 *
 * `atual` é a tabela já gravada no orçamento: reenviá-la numa edição não conta
 * como troca, então desligar o parâmetro depois não trava o salvamento de um
 * orçamento que já usava outra tabela.
 */
export async function resolverTabelaDoOrcamento(
  tx: TenantTx,
  empresaId: string,
  clienteId: string,
  escolhida: string | null | undefined,
  permiteAlterar: boolean,
  atual: string | null = null,
): Promise<string | null> {
  const padrao = await resolverTabelaPrecoCliente(tx, empresaId, clienteId);
  if (!escolhida || escolhida === padrao || escolhida === atual) {
    return escolhida && escolhida === atual ? atual : padrao;
  }
  if (!permiteAlterar) {
    throw new ConflictException(
      'A troca da tabela de preços não está liberada para o orçamento',
    );
  }
  const existe = await tx.tabelaPreco.findFirst({
    where: { id: escolhida, empresaId, ativo: true, deletedAt: null },
    select: { id: true },
  });
  if (!existe) {
    throw new BadRequestException('Tabela de preços inválida ou inativa');
  }
  return escolhida;
}
