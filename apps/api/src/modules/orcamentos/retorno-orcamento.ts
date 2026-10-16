import { BadRequestException } from '@nestjs/common';
import type { TenantTx } from '../../common/prisma/prisma.service';
import { carregarCalendarioUtil } from '../../common/horario/calendario-util';
import {
  ajustarAoExpediente,
  carregarExpedienteUsuario,
  diaLocal,
} from '../../common/horario/expediente';

/**
 * A data e hora de retorno do orçamento: cai em **dia útil e dentro do
 * expediente** de quem vai retomar o contato (o vendedor), e **não pode passar
 * da validade** — retornar sobre uma proposta que já venceu não tem o que
 * fechar.
 *
 * A validade é um dia civil (vale até o fim dele); o retorno é um instante no
 * fuso da operação, então a comparação é pelo dia local.
 *
 * Devolve o retorno **já ajustado**, que é o valor gravado e o da atividade da
 * agenda. Se o ajuste empurra o retorno para depois da validade (validade na
 * sexta e expediente que já acabou), recusa com a explicação em vez de gravar
 * uma data que o vendedor não escolheu.
 */
export async function ajustarRetornoOrcamento(
  tx: TenantTx,
  empresaId: string,
  params: {
    retorno: Date;
    validade: Date | null | undefined;
    vendedorUsuarioId: string | null | undefined;
    autorId: string;
  },
): Promise<Date> {
  const calendario = await carregarCalendarioUtil(tx, empresaId);
  const expediente = await carregarExpedienteUsuario(
    tx,
    params.vendedorUsuarioId ?? params.autorId,
  );
  const ajustado = ajustarAoExpediente(params.retorno, calendario, expediente);

  if (params.validade) {
    const limite = params.validade.toISOString().slice(0, 10);
    if (diaLocal(ajustado) > limite) {
      throw new BadRequestException(
        'A data de retorno não pode ser posterior à validade do orçamento. ' +
          (diaLocal(params.retorno) <= limite
            ? 'Ao respeitar o dia útil e o expediente, ela passaria da validade: escolha um horário anterior.'
            : 'Escolha um retorno até a data de validade.'),
      );
    }
  }
  return ajustado;
}
