import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WhatsappConversasService } from './whatsapp-conversas.service';
import { TitulosReceberService } from '../titulos-receber/titulos-receber.service';
import { NotasSaidaService } from '../notas-saida/notas-saida.service';
import { AtividadesService } from '../atividades/atividades.service';
import { OrcamentosService } from '../orcamentos/orcamentos.service';
import { registrarAtividadeOrcamento } from '../orcamentos/registrar-atividade-orcamento';
import type {
  WhatsappAgendarVisita,
  WhatsappEnviarOrcamento,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/**
 * As ferramentas da plataforma dentro da conversa.
 *
 * É o que separa esta tela de um WhatsApp Web comum: o vendedor está falando
 * com um cliente conhecido, e o que ele precisa responder — o que está em
 * aberto, o que foi comprado, quando é a próxima visita — já existe no
 * sistema. Sem isso ele sai da tela, procura o dado em outro módulo e volta.
 *
 * Três regras aqui:
 *
 * 1. **Nenhuma ação toca o Prisma direto** para buscar dado de negócio: cada
 *    uma delega ao service que a tela já usa, com o mesmo `AuthenticatedUser`.
 *    Assim o escopo de carteira e o RLS continuam valendo sem serem
 *    reimplementados — mesma regra do catálogo do agente de IA.
 * 2. **Só para contato vinculado a cliente.** Sem vínculo não há o que
 *    consultar, e mandar dado financeiro para um contato que a plataforma não
 *    sabe quem é seria pior do que inútil.
 * 3. A permissão é conferida na rota (`@RequirePermission`), com a rotina do
 *    módulo dono do dado — quem não pode ver título no sistema não manda
 *    título pela conversa.
 */
@Injectable()
export class WhatsappAcoesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversas: WhatsappConversasService,
    private readonly titulos: TitulosReceberService,
    private readonly notas: NotasSaidaService,
    private readonly atividades: AtividadesService,
    private readonly orcamentos: OrcamentosService,
  ) {}

  /** Cliente e vendedor da conversa, garantindo que ela é visível ao usuário. */
  private async contexto(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
  ) {
    const conversa = await this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappConversa.findFirst({
        where: { id: conversaId },
        select: {
          id: true,
          clienteId: true,
          sessao: { select: { vendedorId: true } },
          cliente: { select: { razaoSocial: true } },
        },
      }),
    );
    if (!conversa) throw new NotFoundException('Conversa não encontrada');
    if (!conversa.clienteId) {
      throw new BadRequestException(
        'Vincule o contato a um cliente para usar as ações do sistema.',
      );
    }
    return {
      clienteId: conversa.clienteId,
      clienteNome: conversa.cliente?.razaoSocial ?? 'cliente',
      vendedorId: conversa.sessao.vendedorId,
    };
  }

  /**
   * Títulos em aberto do cliente — o "manda os boletos" do dia a dia.
   *
   * Manda os **dados** do título, não o boleto renderizado: a plataforma não
   * emite nem guarda PDF de boleto (isso depende de integração bancária que
   * não existe). Com número, vencimento e valor o cliente identifica o que
   * está em aberto, que é o que ele pergunta.
   */
  async enviarTitulos(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
  ) {
    const { clienteId } = await this.contexto(empresaId, user, conversaId);

    const resultado = (await this.titulos.findAll(empresaId, user, {
      page: 1,
      pageSize: 20,
      sortBy: 'vencimento',
      sortOrder: 'asc',
      status: 'aberto',
      clienteId,
    } as never)) as { data: TituloLinha[] };

    const linhas = resultado.data ?? [];
    if (linhas.length === 0) {
      throw new BadRequestException(
        'Este cliente não tem títulos em aberto para enviar.',
      );
    }

    const total = linhas.reduce((soma, t) => soma + Number(t.saldo ?? 0), 0);
    const texto = [
      '*Títulos em aberto*',
      '',
      ...linhas.map(
        (t) =>
          `• ${t.numero ?? 's/n'} — venc. ${this.data(t.vencimento)} — ${this.moeda(Number(t.saldo ?? 0))}`,
      ),
      '',
      `Total: ${this.moeda(total)}`,
    ].join('\n');

    return this.conversas.enviar(empresaId, user, conversaId, { texto });
  }

  /** Últimas notas do cliente: número, data e valor — sem o DANFE, que a plataforma não guarda. */
  async enviarNotas(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
  ) {
    const { clienteId } = await this.contexto(empresaId, user, conversaId);

    const resultado = (await this.notas.findAll(empresaId, user, {
      // Pede mais do que vai mandar porque a base legada tem notas com valor
      // zerado (devolução, ajuste), e uma lista com "R$ 0,00" no WhatsApp do
      // cliente só gera pergunta.
      page: 1,
      pageSize: 30,
      sortBy: 'dtEmissao',
      sortOrder: 'desc',
      clienteId,
    } as never)) as { data: NotaLinha[] };

    const linhas = (resultado.data ?? [])
      .filter((n) => Number(n.vlrBruto ?? 0) > 0)
      .slice(0, 10);
    if (linhas.length === 0) {
      throw new BadRequestException(
        'Não há notas fiscais deste cliente para enviar.',
      );
    }

    const texto = [
      '*Últimas notas fiscais*',
      '',
      ...linhas.map(
        (n) =>
          `• NF ${n.numero ?? 's/n'} — ${this.data(n.dtEmissao)} — ${this.moeda(Number(n.vlrBruto ?? 0))}`,
      ),
    ].join('\n');

    return this.conversas.enviar(empresaId, user, conversaId, { texto });
  }

  /**
   * Orçamentos do cliente da conversa, para o vendedor escolher qual mandar.
   *
   * Delega ao `OrcamentosService` com o usuário logado: o escopo de carteira e
   * o RLS continuam sendo os do módulo de orçamentos. O filtro por cliente é o
   * que impede a lista de virar um seletor de orçamento de outro cliente.
   */
  async listarOrcamentos(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
  ) {
    const { clienteId } = await this.contexto(empresaId, user, conversaId);
    return this.orcamentos.findAll(empresaId, user, {
      page: 1,
      pageSize: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      clienteId,
    } as never);
  }

  /**
   * Manda a proposta comercial em PDF pela conversa.
   *
   * O arquivo é o mesmo que a tela de orçamento baixa — gerado pelo
   * `OrcamentosService`, que aplica a trava de desconto sem autorização (409)
   * e o escopo do vendedor. Aqui só se confere que o orçamento é **do cliente
   * desta conversa**: sem isso, um id válido de outro cliente da carteira
   * mandaria a proposta errada para a pessoa errada.
   *
   * O evento no histórico é "proposta enviada pelo WhatsApp", e não "PDF
   * gerado" — quem lê o histórico do cliente precisa saber que o documento
   * saiu para ele.
   */
  async enviarOrcamento(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
    input: WhatsappEnviarOrcamento,
  ) {
    const { clienteId, clienteNome } = await this.contexto(
      empresaId,
      user,
      conversaId,
    );

    const orcamento = await this.orcamentos.findOne(
      empresaId,
      user,
      input.orcamentoId,
    );
    if (orcamento.clienteId !== clienteId) {
      throw new BadRequestException(
        `Este orçamento não é do cliente ${clienteNome}.`,
      );
    }

    const { conteudo, nomeArquivo, numero } = await this.orcamentos.gerarPdf(
      empresaId,
      user,
      input.orcamentoId,
      // O rastro deste envio é registrado abaixo; dois eventos para a mesma
      // ação só poluiriam o histórico.
      { registrarEvento: false },
    );

    const mensagem = await this.conversas.enviarConteudo(
      empresaId,
      user,
      conversaId,
      { conteudo, nome: nomeArquivo, mime: 'application/pdf' },
      { legenda: input.legenda?.trim() || `Orçamento nº ${numero}` },
    );

    await this.prisma.withTenant(empresaId, async (tx) => {
      await tx.whatsappAcaoRegistro.create({
        data: {
          empresaId,
          conversaId,
          acao: 'orcamento',
          orcamentoId: input.orcamentoId,
          executadaPor: user.id,
        },
      });
      await registrarAtividadeOrcamento(
        tx,
        empresaId,
        user.id,
        'envio_whatsapp',
        orcamento,
      );
    });

    return mensagem;
  }

  /**
   * Agenda visita/retorno para o cliente da conversa.
   *
   * Não manda mensagem: é compromisso do vendedor, não recado para o cliente.
   * O vendedor da atividade é o **dono da sessão** — quem está atendendo.
   */
  async agendarVisita(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
    input: WhatsappAgendarVisita,
  ) {
    const { clienteId, vendedorId } = await this.contexto(
      empresaId,
      user,
      conversaId,
    );

    return this.atividades.create(empresaId, user, {
      tipo: input.tipo,
      titulo: input.titulo,
      ...(input.descricao ? { descricao: input.descricao } : {}),
      dataVencimento: input.dataVencimento ?? null,
      clienteId,
      vendedorId,
      concluida: false,
      ativo: true,
    } as never);
  }

  private moeda(valor: number) {
    return valor.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }

  private data(valor: Date | string | null) {
    if (!valor) return 'sem data';
    return new Date(valor).toLocaleDateString('pt-BR');
  }
}

/** Só o que estas ações leem do resultado dos services. */
type TituloLinha = {
  numero: string | null;
  vencimento: Date | string | null;
  saldo: unknown;
};
type NotaLinha = {
  numero: string | null;
  dtEmissao: Date | string | null;
  vlrBruto: unknown;
};
