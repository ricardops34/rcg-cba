import type { TenantTx } from '../../common/prisma/prisma.service';
import {
  CAMPO_CLIENTE_LABEL,
  ORIGEM_ALTERACAO_CLIENTE_LABEL,
  type OrigemAlteracaoCliente,
} from '@plataforma/contracts';

/**
 * Pendência de aprovação do cadastro na Agenda de quem pode liberar — mesmo
 * mecanismo da autorização de desconto do orçamento
 * (`registrar-atividade-orcamento.ts`): uma Atividade em aberto, endereçada ao
 * superior, em vez de uma fila que só aparece para quem lembra de abrir a tela.
 *
 * Endereçada ao supervisor do vendedor do cliente, ou ao gerente quando não
 * houver supervisor. Sem hierarquia cadastrada, fica com o próprio vendedor:
 * melhor uma pendência visível do que uma atividade órfã.
 */
export async function registrarAtividadeAlteracaoCliente(
  tx: TenantTx,
  params: {
    empresaId: string;
    clienteId: string;
    autorId: string | null;
    origem: OrigemAlteracaoCliente;
    campos: string[];
  },
) {
  const { empresaId, clienteId, origem, campos } = params;

  const cliente = await tx.cliente.findFirst({
    where: { id: clienteId, empresaId },
    select: { razaoSocial: true, vendedorId: true },
  });
  // Cliente sem vendedor não tem a quem endereçar — a solicitação continua na
  // fila da tela, só não vira tarefa de agenda.
  if (!cliente?.vendedorId) return;

  const vendedor = await tx.vendedor.findFirst({
    where: { id: cliente.vendedorId, empresaId },
    select: { supervisorId: true, gerenteId: true },
  });
  const vendedorDestino =
    vendedor?.supervisorId ?? vendedor?.gerenteId ?? cliente.vendedorId;

  const rotulos = campos.map((c) => CAMPO_CLIENTE_LABEL[c] ?? c);
  // Lista longa vira "e mais N" — o título da agenda não comporta 20 campos.
  const resumo =
    rotulos.length > 4
      ? `${rotulos.slice(0, 4).join(', ')} e mais ${rotulos.length - 4}`
      : rotulos.join(', ');

  await tx.atividade.create({
    data: {
      empresaId,
      clienteId,
      vendedorId: vendedorDestino,
      tipo: 'tarefa',
      titulo: `Alteração de cadastro aguardando aprovação — ${cliente.razaoSocial}`,
      descricao: `Origem: ${ORIGEM_ALTERACAO_CLIENTE_LABEL[origem]}. Campos: ${resumo}.`,
      dataVencimento: new Date(),
      concluida: false,
      createdBy: params.autorId,
      updatedBy: params.autorId,
    },
  });
}
