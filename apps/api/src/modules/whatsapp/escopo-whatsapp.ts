import type { TenantTx } from '../../common/prisma/prisma.service';
import { resolverEscopoVendedores } from '../../common/escopo/escopo-vendedores';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/**
 * Quais vendedores este usuário pode **ler** no WhatsApp.
 *
 * A hierarquia (`resolverEscopoVendedores`) diz quem está no time; a
 * permissão `whatsapp-equipe.visualizar` diz se ler o time é permitido. As
 * duas coisas são necessárias: um supervisor sem essa permissão continua
 * vendo só o próprio atendimento.
 *
 * Note a diferença para o resto do sistema: aqui, usuário sem cadastro de
 * vendedor e sem a permissão de equipe não vê **nada**, em vez de ver tudo.
 * Conversa de cliente é dado pessoal — o default é não enxergar.
 *
 * `null` = sem restrição (admin); `[]` = não vê nada.
 *
 * É função solta, e não método de service, porque quem precisa dela está fora
 * do módulo: a listagem de Posição de Cliente oferece "Atendimento" só para o
 * cliente cuja conversa este usuário pode abrir, e injetar
 * `WhatsappSessaoService` no `ClientesService` fecharia um ciclo de módulos
 * (WhatsApp já depende de Orçamentos, que depende de Clientes).
 */
export async function escopoLeituraWhatsapp(
  tx: TenantTx,
  empresaId: string,
  user: AuthenticatedUser,
): Promise<string[] | null> {
  const podeVerEquipe =
    user.isAdmin || user.permissoes.includes('whatsapp-equipe.visualizar');

  if (podeVerEquipe) {
    // null = sem restrição (admin). Para supervisor/gerente vem a lista do
    // time, que é exatamente "quem eu supervisiono" + eu mesmo.
    return resolverEscopoVendedores(tx, empresaId, user);
  }

  const vendedor = await tx.vendedor.findFirst({
    where: { usuarioId: user.id, empresaId, deletedAt: null },
    select: { id: true },
  });
  return vendedor ? [vendedor.id] : [];
}
