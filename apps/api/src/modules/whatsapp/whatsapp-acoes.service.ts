import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '../../common/prisma/prisma.service';
import { WhatsappConversasService } from './whatsapp-conversas.service';
import { TitulosReceberService } from '../titulos-receber/titulos-receber.service';
import { NotasSaidaService } from '../notas-saida/notas-saida.service';
import { AtividadesService } from '../atividades/atividades.service';
import { OrcamentosService } from '../orcamentos/orcamentos.service';
import { registrarAtividadeOrcamento } from '../orcamentos/registrar-atividade-orcamento';
import { registrarAtividadeDocumento } from '../../common/atividades/registrar-atividade-documento';
import type {
  WhatsappAgendarVisita,
  WhatsappEnviarBoleto,
  WhatsappEnviarDanfe,
  WhatsappEnviarOrcamento,
  WhatsappNovoOrcamento,
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

  /**
   * Cliente e vendedor da conversa — e o dono dela é quem está pedindo.
   *
   * Passa pelo `conversaParaEnvio` do serviço de conversas em vez de ler a
   * linha direto: aquela é a porta única de quem fala pela sessão, e checa as
   * duas coisas que faltavam aqui — a conversa estar no escopo de leitura e o
   * usuário ser o **dono** dela. Sem isso, um `conversaId` de outro vendedor
   * devolvia o nome do cliente e alimentava os seletores de título, nota e
   * orçamento do atendimento alheio; o envio em si já era barrado adiante, mas
   * tarde demais para o que já tinha sido lido.
   */
  private async contexto(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
  ) {
    const conversa = await this.prisma.withTenant(empresaId, (tx) =>
      this.conversas.conversaParaEnvio(tx, empresaId, user, conversaId),
    );
    if (!conversa.clienteId) {
      throw new BadRequestException(
        'Vincule o contato a um cliente para usar as ações do sistema.',
      );
    }
    const cliente = await this.prisma.withTenant(empresaId, (tx) =>
      tx.cliente.findFirst({
        where: { id: conversa.clienteId as string, empresaId },
        select: { razaoSocial: true, vendedorId: true },
      }),
    );

    // De quem é a ação, quando ela precisa de um vendedor (a visita agendada
    // vira atividade dele).
    //
    // No aparelho do vendedor a resposta é imediata: a sessão é dele. No número
    // institucional não há dono, e a pergunta passa a ter ordem: quem assumiu a
    // conversa, e na falta dele o vendedor da carteira do cliente. Se nem isso
    // existir, a ação não tem a quem pertencer — e atribuí-la a alguém
    // arbitrário criaria tarefa na agenda de quem não a combinou.
    const vendedorId =
      conversa.sessao.vendedorId ??
      conversa.atendenteVendedorId ??
      cliente?.vendedorId ??
      null;

    return {
      clienteId: conversa.clienteId,
      clienteNome: cliente?.razaoSocial ?? 'cliente',
      vendedorId,
    };
  }

  /**
   * Resumo em texto dos títulos em aberto do cliente.
   *
   * Continua existindo ao lado do envio do boleto (`enviarBoleto`) porque
   * responde a outra pergunta: "o que eu tenho em aberto?" é uma lista, não um
   * documento. O boleto é de um título por vez.
   */
  async enviarTitulos(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
  ) {
    const { clienteId, vendedorId } = await this.contexto(
      empresaId,
      user,
      conversaId,
    );

    const resultado = (await this.titulos.findAll(empresaId, user, {
      page: 1,
      pageSize: 20,
      sortBy: 'vencimento',
      sortOrder: 'asc',
      status: 'em_aberto',
      ativo: true,
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

    const mensagem = await this.conversas.enviar(empresaId, user, conversaId, {
      texto,
    });
    await this.registrarAcao(empresaId, user, conversaId, 'titulos_resumo', {
      quantidade: linhas.length,
      total,
    });
    // O registro da conversa responde "o que saiu por aqui"; o histórico do
    // cliente responde "o que fizemos por ele". Mandar a lista de títulos é
    // atendimento, e a rotina de Atividades é onde o vendedor o revê.
    await this.prisma.withTenant(empresaId, (tx) =>
      registrarAtividadeDocumento(tx, {
        empresaId,
        autor: user.id,
        evento: 'titulos_whatsapp',
        clienteId,
        vendedorId,
        numero: '',
        descricao: `${linhas.length} título(s) · ${this.moeda(total)}`,
      }),
    );
    return mensagem;
  }

  /**
   * Títulos do cliente com a informação de quem tem 2ª via de boleto — o
   * seletor da tela de atendimento.
   *
   * Delega ao `TitulosReceberService`, então `temBoleto` já vem calculado com
   * a mesma regra da rota de download (nosso número, convênio, e a janela de
   * 30 dias após o vencimento).
   */
  async listarTitulos(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
  ) {
    const { clienteId } = await this.contexto(empresaId, user, conversaId);
    return this.titulos.findAll(empresaId, user, {
      page: 1,
      pageSize: 30,
      sortBy: 'vencimento',
      sortOrder: 'asc',
      status: 'em_aberto',
      ativo: true,
      clienteId,
    } as never);
  }

  /** Notas do cliente com a informação de quais têm XML — o seletor do DANFE. */
  async listarNotas(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
  ) {
    const { clienteId } = await this.contexto(empresaId, user, conversaId);
    return this.notas.findAll(empresaId, user, {
      page: 1,
      pageSize: 30,
      sortBy: 'dtEmissao',
      sortOrder: 'desc',
      clienteId,
    } as never);
  }

  /**
   * Manda a 2ª via do DANFE em PDF pela conversa.
   *
   * O arquivo é o mesmo que a tela baixa — renderizado do XML autorizado pelo
   * `NotasSaidaService`, com o escopo de carteira dele. Aqui só se confere que
   * a nota é **do cliente desta conversa**: sem isso, um id válido de outro
   * cliente da carteira mandaria a nota fiscal errada para a pessoa errada.
   *
   * Nota cancelada continua podendo ser enviada — o cliente às vezes precisa
   * dela justamente para conferir o cancelamento —, mas o PDF sai carimbado, e
   * a legenda padrão avisa.
   */
  async enviarDanfe(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
    input: WhatsappEnviarDanfe,
  ) {
    const { clienteId, clienteNome } = await this.contexto(
      empresaId,
      user,
      conversaId,
    );

    const nota = (await this.notas.findOne(
      empresaId,
      user,
      input.notaSaidaId,
    )) as { clienteId: string | null; numero: string };
    if (nota.clienteId !== clienteId) {
      throw new BadRequestException(
        `Esta nota fiscal não é do cliente ${clienteNome}.`,
      );
    }

    // O rastro deste envio é registrado abaixo como "DANFE enviado pelo
    // WhatsApp"; deixar o service registrar "gerada" também poria dois
    // eventos no histórico do cliente para a mesma ação.
    const danfe = await this.notas.gerarDanfe(
      empresaId,
      user,
      input.notaSaidaId,
      { registrarEvento: false },
    );

    const legenda =
      input.legenda?.trim() ||
      (danfe.cancelada
        ? `DANFE da NF ${danfe.numero} — nota CANCELADA`
        : `NF ${danfe.numero} — 2ª via do DANFE`);

    const mensagem = await this.conversas.enviarConteudo(
      empresaId,
      user,
      conversaId,
      {
        conteudo: danfe.conteudo,
        nome: danfe.nomeArquivo,
        mime: 'application/pdf',
      },
      { legenda },
    );

    // O XML vai como segunda mensagem, e não anexado ao PDF: são dois
    // arquivos distintos para quem recebe, e o contador do cliente costuma
    // pedir só o XML.
    //
    // Falhar aqui **não** derruba a ação: o DANFE já chegou ao cliente, e
    // deixar a exceção subir apagaria o registro de um envio que aconteceu. A
    // tela avisa que o XML não foi.
    let xmlEnviado = false;
    let motivoXml: string | null = null;
    if (input.incluirXml) {
      try {
        const xml = await this.notas.obterXml(
          empresaId,
          user,
          input.notaSaidaId,
          // O XML vai junto do DANFE, no mesmo envio: uma linha no histórico
          // do cliente, não duas.
          { registrarEvento: false },
        );
        await this.conversas.enviarConteudo(
          empresaId,
          user,
          conversaId,
          {
            conteudo: xml.conteudo,
            nome: xml.nomeArquivo,
            mime: 'application/xml',
          },
          { legenda: `XML da NF ${danfe.numero}` },
        );
        xmlEnviado = true;
      } catch (erro) {
        motivoXml =
          erro instanceof Error
            ? erro.message
            : 'Falha ao enviar o arquivo XML';
      }
    }

    await this.registrarAcao(empresaId, user, conversaId, 'danfe', {
      notaSaidaId: input.notaSaidaId,
      chave: String(danfe.chave),
      cancelada: Boolean(danfe.cancelada),
      xmlEnviado,
    });

    // Histórico de atendimento do cliente — a mesma agenda em que o envio de
    // proposta já aparece. O registro da conversa (`whatsapp_acoes`) é
    // auditoria do módulo; este é o que o comercial lê no cliente.
    await this.prisma.withTenant(empresaId, (tx) =>
      registrarAtividadeDocumento(tx, {
        empresaId,
        autor: user.id,
        evento: 'danfe_whatsapp',
        clienteId: danfe.clienteId,
        vendedorId: danfe.vendedorId,
        numero: String(danfe.numero),
        descricao: [
          `Enviado para ${clienteNome} pelo WhatsApp`,
          xmlEnviado ? 'com o XML' : null,
          danfe.cancelada ? 'NOTA CANCELADA' : null,
        ]
          .filter(Boolean)
          .join(' · '),
      }),
    );

    return { ...mensagem, xmlEnviado, motivoXml };
  }

  /**
   * Manda a 2ª via do boleto em PDF pela conversa — o "manda o boleto" do dia
   * a dia, agora com o arquivo e não só com os dados.
   *
   * Toda a regra fica no `TitulosReceberService`: valor atualizado quando
   * vencido, recusa depois de 30 dias de atraso, recusa sem nosso número. O
   * que se acrescenta aqui é a legenda com a linha digitável — o cliente que
   * paga pelo aplicativo do banco copia dali e nem abre o PDF.
   */
  async enviarBoleto(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
    input: WhatsappEnviarBoleto,
  ) {
    const { clienteId, clienteNome } = await this.contexto(
      empresaId,
      user,
      conversaId,
    );

    const titulo = (await this.titulos.findOne(
      empresaId,
      user,
      input.tituloReceberId,
    )) as { clienteId: string | null };
    if (titulo.clienteId !== clienteId) {
      throw new BadRequestException(
        `Este título não é do cliente ${clienteNome}.`,
      );
    }

    // Como no DANFE: o histórico do cliente recebe "boleto enviado", não
    // "boleto gerado" — é a mesma ação, e dois eventos só poluiriam a agenda.
    const boleto = await this.titulos.gerarBoleto(
      empresaId,
      user,
      input.tituloReceberId,
      { registrarEvento: false },
    );

    const cabecalho =
      boleto.encargos.diasAtraso > 0
        ? `Boleto do título ${boleto.numero} — valor atualizado até ${this.data(
            boleto.encargos.atualizadoAte,
          )}: ${this.moeda(boleto.valor)}`
        : `Boleto do título ${boleto.numero} — venc. ${this.data(
            boleto.vencimento,
          )} — ${this.moeda(boleto.valor)}`;

    const mensagem = await this.conversas.enviarConteudo(
      empresaId,
      user,
      conversaId,
      {
        conteudo: boleto.conteudo,
        nome: boleto.nomeArquivo,
        mime: 'application/pdf',
      },
      {
        legenda:
          input.legenda?.trim() ||
          `${cabecalho}\n\nLinha digitável:\n${boleto.linhaDigitavelFormatada}`,
      },
    );

    await this.registrarAcao(empresaId, user, conversaId, 'boleto', {
      tituloReceberId: input.tituloReceberId,
      valor: boleto.valor,
      diasAtraso: boleto.encargos.diasAtraso,
    });

    await this.prisma.withTenant(empresaId, (tx) =>
      registrarAtividadeDocumento(tx, {
        empresaId,
        autor: user.id,
        evento: 'boleto_whatsapp',
        clienteId: boleto.clienteId,
        vendedorId: boleto.vendedorId,
        numero: boleto.numeroDocumento,
        descricao: `Enviado para ${clienteNome} pelo WhatsApp · ${this.titulos.descreverBoleto(
          boleto.vencimento,
          boleto.encargos,
        )}`,
      }),
    );

    return mensagem;
  }

  /**
   * Rastro do que saiu pela conversa.
   *
   * É o que permite responder "este cliente já recebeu a 2ª via?" sem abrir a
   * conversa — e sobrevive à remoção do título ou da nota, porque os ids são
   * colunas simples, sem relação (ver `WhatsappAcaoRegistro`).
   */
  private registrarAcao(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
    acao: string,
    detalhe: {
      tituloReceberId?: string;
      notaSaidaId?: string;
      [chave: string]: string | number | boolean | null | undefined;
    },
  ) {
    // `undefined` não é JSON e o Prisma recusa a coluna Json com ele dentro;
    // sair da chave é o mesmo que não ter valor, e mantém o registro legível.
    const conteudo = Object.fromEntries(
      Object.entries(detalhe).filter(([, valor]) => valor !== undefined),
    ) as Prisma.InputJsonObject;

    return this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappAcaoRegistro.create({
        data: {
          empresaId,
          conversaId,
          acao,
          ...(detalhe.tituloReceberId
            ? { tituloReceberId: detalhe.tituloReceberId }
            : {}),
          detalhe: conteudo,
          executadaPor: user.id,
        },
      }),
    );
  }

  /** Últimas notas do cliente: número, data e valor — o resumo em texto. */
  async enviarNotas(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
  ) {
    const { clienteId, vendedorId } = await this.contexto(
      empresaId,
      user,
      conversaId,
    );

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

    const mensagem = await this.conversas.enviar(empresaId, user, conversaId, {
      texto,
    });
    await this.registrarAcao(empresaId, user, conversaId, 'notas_resumo', {
      quantidade: linhas.length,
    });
    // Mesma razão do resumo de títulos: o que foi entregue ao cliente aparece
    // no histórico dele, não só no registro da conversa.
    await this.prisma.withTenant(empresaId, (tx) =>
      registrarAtividadeDocumento(tx, {
        empresaId,
        autor: user.id,
        evento: 'notas_whatsapp',
        clienteId,
        vendedorId,
        numero: '',
        descricao: `${linhas.length} nota(s) fiscal(is)`,
      }),
    );
    return mensagem;
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
   * Monta um orçamento para o cliente da conversa e, por padrão, já manda a
   * proposta em PDF.
   *
   * O vendedor é o **dono da sessão** e o cliente é o da conversa — nenhum dos
   * dois vem do corpo. A criação delega ao `OrcamentosService`, então o
   * recálculo de preço pela tabela do cliente, o desconto por regra e a
   * numeração continuam sendo os mesmos da tela de Orçamentos; aqui não há
   * uma segunda maneira de orçar.
   *
   * Se o envio falhar, o orçamento **continua criado**: ele já é um registro
   * de negócio, e desfazer por causa da mensagem seria perder o trabalho do
   * vendedor. A tela avisa para reenviar.
   */
  async novoOrcamento(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
    input: WhatsappNovoOrcamento,
  ) {
    const { clienteId, vendedorId } = await this.contexto(
      empresaId,
      user,
      conversaId,
    );

    const orcamento = (await this.orcamentos.create(empresaId, user, {
      clienteId,
      vendedorId,
      titulo: input.titulo,
      status: 'rascunho',
      condicaoPagamentoId: input.condicaoPagamentoId ?? null,
      dataValidade: input.dataValidade ?? null,
      ...(input.observacao ? { observacao: input.observacao } : {}),
      ativo: true,
      itens: input.itens,
    } as never)) as { id: string; numero: number };

    if (!input.enviar) return { orcamento, enviado: false as const };

    try {
      await this.enviarOrcamento(empresaId, user, conversaId, {
        orcamentoId: orcamento.id,
      });
      return { orcamento, enviado: true as const };
    } catch (erro) {
      const motivo =
        erro instanceof Error ? erro.message : 'Falha ao enviar a proposta';
      return { orcamento, enviado: false as const, motivo };
    }
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

    if (!vendedorId) {
      throw new BadRequestException(
        'Esta conversa ainda não tem vendedor responsável. Assuma o atendimento ' +
          'ou vincule o cliente a um vendedor antes de agendar.',
      );
    }

    const atividade = await this.atividades.create(empresaId, user, {
      tipo: input.tipo,
      titulo: input.titulo,
      ...(input.descricao ? { descricao: input.descricao } : {}),
      dataVencimento: input.dataVencimento ?? null,
      clienteId,
      vendedorId,
      concluida: false,
      ativo: true,
    });

    await this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappAcaoRegistro.create({
        data: {
          empresaId,
          conversaId,
          acao: 'agendamento',
          atividadeId: atividade.id,
          executadaPor: user.id,
          detalhe: {
            tipo: input.tipo,
            titulo: input.titulo,
            dataVencimento: input.dataVencimento?.toISOString() ?? null,
          },
        },
      }),
    );

    return atividade;
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
