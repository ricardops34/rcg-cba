import type { TenantTx } from '../../common/prisma/prisma.service';
import { carregarCalendarioUtil } from '../../common/horario/calendario-util';
import {
  ajustarAoExpediente,
  carregarExpedienteUsuario,
} from '../../common/horario/expediente';

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
    clienteId: string | null;
    vendedorId: string;
    oportunidadeId: string | null;
    dataRetorno: Date;
  },
) {
  const calendario = await carregarCalendarioUtil(tx, empresaId);
  // O retorno é do vendedor: cai em dia útil e dentro do expediente dele.
  const vendedor = await tx.vendedor.findUnique({
    where: { id: params.vendedorId },
    select: { usuarioId: true },
  });
  const expediente = await carregarExpedienteUsuario(
    tx,
    vendedor?.usuarioId ?? autor,
  );
  const quando = ajustarAoExpediente(
    params.dataRetorno,
    calendario,
    expediente,
  );

  // Mudar a data do retorno **reagenda** o lembrete que já existe, em vez de
  // deixar dois na agenda — o antigo ficaria como pendência fantasma.
  const existente = await tx.atividade.findFirst({
    where: {
      empresaId,
      orcamentoId: params.orcamentoId,
      tipo: 'ligacao',
      titulo: { startsWith: 'Retorno:' },
      concluida: false,
      deletedAt: null,
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (existente) {
    await tx.atividade.update({
      where: { id: existente.id },
      data: {
        titulo: `Retorno: ${params.titulo}`,
        dataVencimento: quando,
        updatedBy: autor,
      },
    });
    return;
  }
  await tx.atividade.create({
    data: {
      empresaId,
      clienteId: params.clienteId,
      oportunidadeId: params.oportunidadeId,
      orcamentoId: params.orcamentoId,
      vendedorId: params.vendedorId,
      tipo: 'ligacao',
      titulo: `Retorno: ${params.titulo}`,
      dataVencimento: quando,
      createdBy: autor,
      updatedBy: autor,
    },
  });
}
