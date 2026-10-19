import type { TenantTx } from '../../common/prisma/prisma.service';

const POSICOES = [1, 2, 3, 4] as const;

type ClienteComContatos = Record<string, unknown> & { id: string };

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/**
 * Espelha os contatos planos do cliente (A1_CT*01 a 04) em `cliente_contatos`,
 * que é o cadastro que o WhatsApp e o Portal do Cliente usam para saber quem é
 * a pessoa. O ERP é a fonte desses quatro: cada posição vira um registro de
 * origem `erp`, atualizado pelo número da posição.
 *
 * Posição que o ERP esvaziou: o registro sai se ninguém o usa; se já tem acesso
 * ao portal, número de WhatsApp vinculado ou decisão de orçamento, fica
 * inativo — apagar levaria a conversa e o login junto. Contato digitado na
 * plataforma (origem `plataforma`) nunca é apagado por aqui.
 */
export async function sincronizarContatosErp(
  tx: TenantTx,
  empresaId: string,
  cliente: ClienteComContatos,
  autor: string | null,
): Promise<void> {
  for (const p of POSICOES) {
    const nome = texto(cliente[`contato${p}Nome`]);
    const email = texto(cliente[`contato${p}Email`]).toLowerCase() || null;
    const numero = texto(cliente[`contato${p}Telefone`]) || null;
    const tipo = texto(cliente[`contato${p}Tipo`]) || null;
    const whatsapp = cliente[`contato${p}Whatsapp`] === true;

    const atual = await tx.clienteContato.findFirst({
      where: { empresaId, clienteId: cliente.id, origem: 'erp', posicaoErp: p },
      include: {
        credencial: { select: { id: true } },
        _count: {
          select: { whatsappNumeros: true, orcamentosDecididos: true },
        },
      },
    });

    if (!nome && !email && !numero) {
      if (!atual) continue;
      const usado =
        atual.credencial ||
        atual._count.whatsappNumeros > 0 ||
        atual._count.orcamentosDecididos > 0;
      if (usado) {
        await tx.clienteContato.update({
          where: { id: atual.id },
          data: { ativo: false, updatedBy: autor },
        });
      } else {
        await tx.clienteContato.delete({ where: { id: atual.id } });
      }
      continue;
    }

    // Mesmo e-mail em outro registro do cliente: a unicidade é por e-mail. Um
    // contato digitado na plataforma é adotado (vira o da posição); o de outra
    // posição do ERP segura o e-mail e este fica sem.
    let emailGravado = email;
    let adotado: string | null = null;
    if (email) {
      const igual = await tx.clienteContato.findFirst({
        where: {
          empresaId,
          clienteId: cliente.id,
          email: { equals: email, mode: 'insensitive' },
          ...(atual ? { id: { not: atual.id } } : {}),
        },
        select: { id: true, origem: true, posicaoErp: true },
      });
      if (igual) {
        if (igual.origem === 'plataforma' && !atual) adotado = igual.id;
        else emailGravado = null;
      }
    }

    const dados = {
      nome: nome || `Contato ${p}`,
      email: emailGravado,
      telefone: whatsapp ? null : numero,
      celular: whatsapp ? numero : null,
      tipo,
      whatsapp,
      origem: 'erp',
      posicaoErp: p,
      ativo: true,
      updatedBy: autor,
    };
    const id = atual?.id ?? adotado;
    if (id) {
      await tx.clienteContato.update({ where: { id }, data: dados });
    } else {
      await tx.clienteContato.create({
        data: { ...dados, empresaId, clienteId: cliente.id, createdBy: autor },
      });
    }
  }
}
