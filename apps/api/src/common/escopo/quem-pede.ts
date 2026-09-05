import type { TenantTx } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { resolverEscopoVendedores } from './escopo-vendedores';

/**
 * Quem está pedindo um documento (boleto, DANFE, PDF de orçamento) e por onde
 * ele é alcançável.
 *
 * Existem dois solicitantes legítimos, e o recorte de cada um é diferente:
 *
 * - **usuário** — alguém logado no sistema. Alcança o que a carteira dele
 *   alcança, pela hierarquia de `resolverEscopoVendedores`.
 * - **cliente** — a pessoa do outro lado do WhatsApp institucional, num número
 *   que um vendedor vinculou a um cadastro. Alcança **o que é dela**, e nada
 *   mais. Não há carteira envolvida: o cliente não é da carteira de ninguém do
 *   ponto de vista dele mesmo.
 *
 * Isto existe para as regras de negócio do documento — janela de reemissão do
 * boleto, encargos do vencido, XML ausente — valerem **igual nos dois
 * caminhos**. Duplicar o gerador para o bot faria as duas cópias divergirem na
 * primeira mudança, e a divergência apareceria como um boleto com valor
 * diferente do que o vendedor manda.
 *
 * É também a resposta à ressalva que estava escrita em `triagem-ferramentas.ts`:
 * fabricar um `AuthenticatedUser` sintético para o bot atravessar essas portas
 * poria um ator de escopo indefinido circulando por serviços que assumem uma
 * pessoa com carteira. Aqui o bot não finge ser ninguém — ele diz de qual
 * cliente está falando, e o serviço recorta por isso.
 */
export type QuemPede =
  | { tipo: 'usuario'; user: AuthenticatedUser }
  | { tipo: 'cliente'; clienteId: string };

export interface RecorteSolicitante {
  /**
   * Ids de vendedor cujas carteiras o solicitante alcança. `null` = sem
   * restrição por carteira (admin, Diretor, ou o recorte por cliente, que já
   * é mais estreito).
   */
  escopoVendedores: string[] | null;
  /** Quando presente, o documento só é alcançável se for deste cliente. */
  clienteId: string | null;
}

/**
 * Traduz o solicitante no recorte a aplicar.
 *
 * Cada serviço monta o `where` do seu próprio modelo a partir daqui — a forma
 * do filtro muda (`vendedorId` no título, `cliente.vendedorId` na nota), mas a
 * decisão de **quem alcança o quê** é uma só.
 */
export async function recorteDoSolicitante(
  tx: TenantTx,
  empresaId: string,
  quem: QuemPede,
): Promise<RecorteSolicitante> {
  if (quem.tipo === 'cliente') {
    return { escopoVendedores: null, clienteId: quem.clienteId };
  }
  return {
    escopoVendedores: await resolverEscopoVendedores(tx, empresaId, quem.user),
    clienteId: null,
  };
}

/**
 * Quem assina o evento no histórico do cliente.
 *
 * `null` quando o pedido veio do cliente pelo WhatsApp: não há usuário, e
 * inventar um poria o nome de alguém numa ação que a pessoa não fez. É a mesma
 * convenção do recebimento de mensagem, que grava autor nulo porque quem
 * trouxe a mensagem foi o worker.
 */
export function autorDoEvento(quem: QuemPede): string | null {
  return quem.tipo === 'usuario' ? quem.user.id : null;
}
