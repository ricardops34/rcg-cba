import type { TenantTx } from '../../common/prisma/prisma.service';

/**
 * dataRetorno definida (na criação, ou numa edição que muda o valor) gera
 * uma Atividade de acompanhamento (tipo ligação) vinculada ao orçamento —
 * vira lembrete na Agenda/Atividades pro vendedor retomar contato com o
 * cliente, que pode resultar num novo orçamento. Compartilhado entre
 * OrcamentosService (tela) e IntegracaoOrcamentosService (API externa) —
 * mesma regra de negócio, independente do caminho de escrita.
 */
export async function criarAtividadeRetorno(
  tx: TenantTx,
  empresaId: string,
  autor: string,
  params: {
    orcamentoId: string;
    titulo: string;
    clienteId: string;
    vendedorId: string;
    oportunidadeId: string | null;
    dataRetorno: Date;
  },
) {
  await tx.atividade.create({
    data: {
      empresaId,
      clienteId: params.clienteId,
      oportunidadeId: params.oportunidadeId,
      orcamentoId: params.orcamentoId,
      vendedorId: params.vendedorId,
      tipo: 'ligacao',
      titulo: `Retorno: ${params.titulo}`,
      dataVencimento: params.dataRetorno,
      createdBy: autor,
      updatedBy: autor,
    },
  });
}
