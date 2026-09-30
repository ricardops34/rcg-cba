import { ForbiddenException } from '@nestjs/common';

/**
 * Código no corpo do 403 quando a sessão do token foi encerrada no servidor —
 * novo acesso com o mesmo usuário em outro lugar, ou desconexão pela tela de
 * Acessos. Mesmo formato do FORA_HORARIO: o web volta ao login mostrando o
 * motivo, em vez de um "acesso negado" solto (ver api-client.ts).
 */
export const CODIGO_SESSAO_ENCERRADA = 'SESSAO_ENCERRADA';

/** Motivos gravados em `sessoes.motivoFim` que tiram a pessoa na hora. */
export const MOTIVO_NOVO_ACESSO = 'novo_acesso';
export const MOTIVO_DESCONECTADO = 'desconectado';

const MENSAGENS: Record<string, string> = {
  [MOTIVO_NOVO_ACESSO]:
    'Sua sessão foi encerrada porque houve um novo acesso com este usuário em outro navegador ou computador.',
  [MOTIVO_DESCONECTADO]: 'Sua sessão foi encerrada pela administração.',
};

export class SessaoEncerradaException extends ForbiddenException {
  constructor(motivo: string | null | undefined) {
    super({
      message: (motivo && MENSAGENS[motivo]) ?? 'Sua sessão foi encerrada. Entre novamente.',
      codigo: CODIGO_SESSAO_ENCERRADA,
    });
  }
}
