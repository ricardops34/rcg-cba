import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  extensaoPorMime,
  whatsappPublicPath,
  WHATSAPP_DIR,
} from '../../common/uploads/uploads.config';
import {
  PrismaService,
  type TenantTx,
} from '../../common/prisma/prisma.service';
import { WhatsappConfigService } from './whatsapp-config.service';
import { WhatsappSessaoService } from './whatsapp-sessao.service';
import { WhatsappWorkerClient } from './whatsapp-worker.client';
import {
  marcarNotificacoesDaOrigem,
  registrarNotificacao,
  usuarioDoVendedor,
} from '../notificacoes/registrar-notificacao';
import {
  combinarFiltroVendedor,
  resolverEscopoVendedores,
} from '../../common/escopo/escopo-vendedores';
import { inicioDoDia } from '../titulos-receber/titulo-receber-status';
import type {
  WhatsappConversaQuery,
  WhatsappSituacaoTitulos,
  WhatsappStatusEntrega,
  WhatsappEnviar,
  WhatsappIniciarConversa,
  WhatsappMensagemQuery,
  WhatsappVincular,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { mensagemComAutor } from './mensagem-com-autor';

const PREVIA_TAMANHO = 120;

/** Tipos cuja mensagem carrega arquivo a baixar. */
const MIDIA = ['imagem', 'video', 'audio', 'documento'];

/**
 * Conversas e mensagens do atendimento.
 *
 * O corte de acesso é sempre pela **sessão**: uma conversa pertence à sessão de
 * um vendedor, e quem pode lê-la é quem `WhatsappSessaoService.escopoLeitura`
 * autoriza. Nenhuma consulta aqui parte do `clienteId` — se partisse, um
 * vendedor com o cliente na carteira leria a conversa que **outro** vendedor
 * teve com esse mesmo cliente.
 */
@Injectable()
export class WhatsappConversasService {
  private readonly logger = new Logger(WhatsappConversasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: WhatsappConfigService,
    private readonly sessoes: WhatsappSessaoService,
    private readonly worker: WhatsappWorkerClient,
  ) {}

  /** Filtro de sessão a partir do escopo de leitura. `[]` = não vê nada. */
  private async filtroSessao(
    tx: TenantTx,
    empresaId: string,
    user: AuthenticatedUser,
    vendedorIdQuery?: string,
  ) {
    const escopo = await this.sessoes.escopoLeitura(tx, empresaId, user);
    if (escopo === null) {
      return vendedorIdQuery ? { sessao: { vendedorId: vendedorIdQuery } } : {};
    }
    const permitidos = vendedorIdQuery
      ? escopo.includes(vendedorIdQuery)
        ? [vendedorIdQuery]
        : []
      : escopo;
    return { sessao: { vendedorId: { in: permitidos } } };
  }

  async listar(
    empresaId: string,
    user: AuthenticatedUser,
    query: WhatsappConversaQuery,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const filtro = await this.filtroSessao(
        tx,
        empresaId,
        user,
        query.vendedorId,
      );

      const where = {
        ...filtro,
        arquivada: query.arquivadas,
        // Conversa que não é com uma pessoa não é atendimento e não tem como
        // receber mensagem (ver `jidDePessoa`). O filtro existe porque a
        // listagem da agenda deixou passar `status@broadcast` antes de ser
        // corrigida, e a conversa criada naquela época continua no banco.
        contato: {
          NOT: [
            { jid: { endsWith: '@broadcast' } },
            { jid: { endsWith: '@newsletter' } },
            { jid: { endsWith: '@g.us' } },
          ],
        },
        ...(query.semVinculo ? { clienteId: null } : {}),
        ...(query.busca
          ? {
              OR: [
                {
                  contato: {
                    nomeExibicao: {
                      contains: query.busca,
                      mode: 'insensitive' as const,
                    },
                  },
                },
                { contato: { telefoneNormalizado: { contains: query.busca } } },
                {
                  cliente: {
                    razaoSocial: {
                      contains: query.busca,
                      mode: 'insensitive' as const,
                    },
                  },
                },
              ],
            }
          : {}),
      };

      const [total, linhas] = await Promise.all([
        tx.whatsappConversa.count({ where }),
        tx.whatsappConversa.findMany({
          where,
          include: {
            contato: true,
            cliente: {
              select: {
                razaoSocial: true,
                codigoErp: true,
                telefone: true,
                telefone2: true,
                celular: true,
              },
            },
            sessao: {
              select: {
                vendedorId: true,
                // Por qual número a conversa entrou — a lista da equipe mistura
                // conexões, e a resposta sai pela mesma conexão que recebeu.
                numero: true,
                vendedor: { select: { nome: true } },
              },
            },
            // Só a última mensagem, para a prévia da lista — trazer o rolo
            // inteiro de cada conversa aqui derrubaria a tela.
            mensagens: {
              orderBy: { criadaEm: 'desc' },
              take: 1,
              select: { conteudo: true, tipo: true },
            },
          },
          orderBy: [{ ultimaMensagemEm: 'desc' }, { updatedAt: 'desc' }],
          skip: (query.pagina - 1) * query.tamanho,
          take: query.tamanho,
        }),
      ]);

      const sinais = await this.sinaisDoCliente(
        tx,
        user,
        linhas.map((c) => c.clienteId).filter((id): id is string => !!id),
      );
      const outrosAtendentes = await this.outrosAtendentes(tx, linhas);

      return {
        total,
        pagina: query.pagina,
        tamanho: query.tamanho,
        itens: linhas.map((c) => ({
          id: c.id,
          empresaId: c.empresaId,
          sessaoId: c.sessaoId,
          contato: {
            id: c.contato.id,
            jid: c.contato.jid,
            nomeExibicao: c.contato.nomeExibicao,
            telefoneNormalizado: c.contato.telefoneNormalizado,
            tipo: c.contato.tipo,
            email: c.contato.email,
            clienteId: c.contato.clienteId,
            clienteRazaoSocial: c.cliente?.razaoSocial ?? null,
            clienteCodigoErp: c.cliente?.codigoErp ?? null,
            clienteTelefones: [
              ...new Set(
                [
                  c.cliente?.telefone,
                  c.cliente?.telefone2,
                  c.cliente?.celular,
                ].filter((telefone): telefone is string => !!telefone),
              ),
            ],
            ignorado: c.contato.ignorado,
          },
          clienteId: c.clienteId,
          ultimaMensagemEm: c.ultimaMensagemEm,
          ultimaMensagemPrevia: this.previa(c.mensagens[0]),
          naoLidas: c.naoLidas,
          arquivada: c.arquivada,
          vendedorId: c.sessao.vendedorId,
          vendedorNome: c.sessao.vendedor.nome,
          sessaoNumero: c.sessao.numero,
          diasSemComprar: c.clienteId
            ? (sinais.diasSemComprar.get(c.clienteId) ?? null)
            : null,
          situacaoTitulos: c.clienteId
            ? (sinais.situacaoTitulos.get(c.clienteId) ?? null)
            : null,
          proximoRetornoEm: c.clienteId
            ? (sinais.proximoRetornoEm.get(c.clienteId) ?? null)
            : null,
          orcamentoAguardandoAprovacao: c.clienteId
            ? sinais.aprovacaoPendente.has(c.clienteId)
            : false,
          outrosAtendentes: outrosAtendentes.get(c.id) ?? [],
        })),
      };
    });
  }

  /**
   * Onde parou o atendimento por WhatsApp com um cliente.
   *
   * Parte do `clienteId`, o que o resto deste serviço evita — e por isso o
   * corte de sessão vem **antes**, no `where`: sem ele, um vendedor com o
   * cliente na carteira leria a conversa que outro teve com a mesma pessoa,
   * que é exatamente o que a regra do módulo proíbe. Com o filtro, quem não
   * alcança a sessão recebe zero conversas, mesmo alcançando o cliente.
   *
   * Devolve o suficiente para decidir se liga ou espera: quantas conversas,
   * quando foi o último contato e a prévia da última mensagem — a mesma que a
   * lista de atendimento já mostra. O rolo inteiro fica na tela.
   */
  async historicoDoCliente(
    empresaId: string,
    user: AuthenticatedUser,
    clienteId: string,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const filtro = await this.filtroSessao(tx, empresaId, user);
      const conversas = await tx.whatsappConversa.findMany({
        where: { ...filtro, empresaId, clienteId },
        include: {
          sessao: { select: { vendedor: { select: { nome: true } } } },
          mensagens: {
            orderBy: { criadaEm: 'desc' },
            take: 1,
            select: { conteudo: true, tipo: true, direcao: true },
          },
        },
        orderBy: { ultimaMensagemEm: 'desc' },
        take: 5,
      });

      return {
        conversas: conversas.length,
        ultimoContato: conversas[0]?.ultimaMensagemEm ?? null,
        itens: conversas.map((c) => ({
          atendente: c.sessao.vendedor,
          ultimaMensagemEm: c.ultimaMensagemEm,
          // `saida` = fomos nós que falamos por último — quem está devendo
          // resposta é a informação que decide o próximo passo.
          ultimaDe: c.mensagens[0]?.direcao ?? null,
          previa: this.previa(c.mensagens[0]),
          naoLidas: c.naoLidas,
          arquivada: c.arquivada,
        })),
      };
    });
  }

  /**
   * Quem mais está falando com estes mesmos contatos.
   *
   * O telefone do cliente não pertence a um atendimento: a mesma pessoa pode
   * estar em conversa com dois vendedores ao mesmo tempo, e nenhum dos dois
   * enxerga o outro — cada um só vê a própria sessão. Sem este aviso, dois
   * orçamentos concorrentes para o mesmo cliente saem sem ninguém perceber.
   *
   * Deliberadamente **fora** do escopo de leitura: a consulta atravessa as
   * sessões de outros vendedores de propósito. O que sai daqui é só o **nome
   * de quem atende** — nunca a conversa dele, que continua invisível para
   * quem não tem escopo sobre ela.
   */
  private async outrosAtendentes(
    tx: TenantTx,
    conversas: { id: string; contatoId: string; sessaoId: string }[],
  ) {
    const porConversa = new Map<string, string[]>();
    const contatoIds = [...new Set(conversas.map((c) => c.contatoId))];
    if (contatoIds.length === 0) return porConversa;

    const todas = await tx.whatsappConversa.findMany({
      where: { contatoId: { in: contatoIds } },
      select: {
        contatoId: true,
        sessaoId: true,
        sessao: { select: { vendedor: { select: { nome: true } } } },
      },
    });

    for (const conversa of conversas) {
      const nomes = todas
        .filter(
          (outra) =>
            outra.contatoId === conversa.contatoId &&
            outra.sessaoId !== conversa.sessaoId,
        )
        .map((outra) => outra.sessao.vendedor.nome);
      if (nomes.length) porConversa.set(conversa.id, [...new Set(nomes)]);
    }
    return porConversa;
  }

  /**
   * Positivação e cobrança dos clientes da página, para os ícones da lista.
   *
   * **Duas consultas agregadas para a página inteira**, não uma por conversa:
   * com 30 linhas e dois indicadores, o N+1 seriam 60 idas ao banco a cada
   * atualização da lista — que roda a cada 15 s.
   *
   * Cada indicador respeita a permissão da rotina dona do dado: quem não pode
   * ver título no sistema não descobre a situação da cobrança por um ícone
   * colorido. Sem permissão, o campo vem nulo e a tela não mostra nada.
   */
  private async sinaisDoCliente(
    tx: TenantTx,
    user: AuthenticatedUser,
    clienteIds: string[],
  ) {
    const diasSemComprar = new Map<string, number | null>();
    const situacaoTitulos = new Map<string, WhatsappSituacaoTitulos>();
    const proximoRetornoEm = new Map<string, Date>();
    const aprovacaoPendente = new Set<string>();
    const ids = [...new Set(clienteIds)];
    if (ids.length === 0) {
      return {
        diasSemComprar,
        situacaoTitulos,
        proximoRetornoEm,
        aprovacaoPendente,
      };
    }

    const pode = (permissao: string) =>
      user.isAdmin || user.permissoes.includes(permissao);
    const hoje = inicioDoDia();

    if (pode('notas-saida.visualizar')) {
      // Comodato não é venda: contar a remessa como compra faria um cliente
      // que só recebeu equipamento aparecer como positivado.
      const compras = await tx.notaSaida.groupBy({
        by: ['clienteId'],
        where: {
          clienteId: { in: ids },
          deletedAt: null,
          ativo: true,
          comodato: false,
        },
        _max: { dtEmissao: true },
      });
      for (const linha of compras) {
        if (!linha.clienteId) continue;
        const ultima = linha._max.dtEmissao;
        diasSemComprar.set(
          linha.clienteId,
          ultima
            ? Math.max(
                0,
                Math.floor(
                  (hoje.getTime() - inicioDoDia(ultima).getTime()) / 86_400_000,
                ),
              )
            : null,
        );
      }
    }

    if (pode('titulos-receber.visualizar')) {
      // O vencimento mais antigo entre os títulos em aberto decide a cor: é o
      // pior caso, que é o que o vendedor precisa ver antes de abrir a
      // conversa. `_min` ignora nulos, então título sem vencimento não
      // inventa atraso.
      const cobranca = await tx.tituloReceber.groupBy({
        by: ['clienteId'],
        where: {
          clienteId: { in: ids },
          deletedAt: null,
          ativo: true,
          dtBaixa: null,
        },
        _min: { vencimento: true },
      });
      const emSeteDias = new Date(hoje.getTime() + 7 * 86_400_000);
      for (const linha of cobranca) {
        if (!linha.clienteId) continue;
        const vence = linha._min.vencimento;
        situacaoTitulos.set(
          linha.clienteId,
          !vence
            ? 'em_dia'
            : vence.getTime() < hoje.getTime()
              ? 'vencido'
              : vence.getTime() <= emSeteDias.getTime()
                ? 'vencendo'
                : 'em_dia',
        );
      }
    }

    if (pode('atividades.visualizar')) {
      const retornos = await tx.atividade.findMany({
        where: {
          clienteId: { in: ids },
          concluida: false,
          ativo: true,
          deletedAt: null,
          dataVencimento: { not: null },
        },
        select: { clienteId: true, dataVencimento: true },
        orderBy: { dataVencimento: 'asc' },
      });
      for (const retorno of retornos) {
        if (
          retorno.clienteId &&
          retorno.dataVencimento &&
          !proximoRetornoEm.has(retorno.clienteId)
        ) {
          proximoRetornoEm.set(retorno.clienteId, retorno.dataVencimento);
        }
      }
    }

    if (pode('orcamentos.visualizar')) {
      const pendentes = await tx.orcamento.findMany({
        where: {
          clienteId: { in: ids },
          ativo: true,
          deletedAt: null,
          descontoSolicitadoEm: { not: null },
          descontoAutorizadoEm: null,
        },
        select: { clienteId: true },
        distinct: ['clienteId'],
      });
      pendentes.forEach((orcamento) =>
        aprovacaoPendente.add(orcamento.clienteId),
      );
    }

    return {
      diasSemComprar,
      situacaoTitulos,
      proximoRetornoEm,
      aprovacaoPendente,
    };
  }

  private previa(ultima?: { conteudo: string | null; tipo: string }) {
    if (!ultima) return null;
    if (ultima.tipo !== 'texto') return `[${ultima.tipo}]`;
    const texto = (ultima.conteudo ?? '').replace(/\s+/g, ' ').trim();
    return texto.length > PREVIA_TAMANHO
      ? `${texto.slice(0, PREVIA_TAMANHO)}…`
      : texto;
  }

  /** Carrega a conversa garantindo que o usuário pode lê-la. 404 fora do escopo. */
  private async conversaNoEscopo(
    tx: TenantTx,
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
  ) {
    const filtro = await this.filtroSessao(tx, empresaId, user);
    const conversa = await tx.whatsappConversa.findFirst({
      where: { id: conversaId, ...filtro },
      include: {
        contato: true,
        sessao: { select: { id: true, vendedorId: true, status: true } },
      },
    });
    // 404 e não 403: fora do escopo, a conversa não deve nem revelar que existe.
    if (!conversa) throw new NotFoundException('Conversa não encontrada');
    return conversa;
  }

  /**
   * A conversa, se o usuário puder lê-la. Exposto para o agendamento aplicar
   * o mesmo corte de escopo sem reimplementá-lo.
   */
  conversaNoEscopoPublica(
    tx: TenantTx,
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
  ) {
    return this.conversaNoEscopo(tx, empresaId, user, conversaId);
  }

  /**
   * A conversa, se o usuário puder **falar** nela — leitura mais a regra de
   * que só o dono da sessão envia. É a porta única de quem manda mensagem,
   * agendada ou não: agendar não pode ser um contorno da permissão.
   */
  async conversaParaEnvio(
    tx: TenantTx,
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
  ) {
    const conversa = await this.conversaNoEscopo(
      tx,
      empresaId,
      user,
      conversaId,
    );
    await this.garantirDono(tx, empresaId, user, conversa);
    return conversa;
  }

  async mensagens(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
    query: WhatsappMensagemQuery,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const conversa = await this.conversaNoEscopo(tx, empresaId, user, conversaId);

      const linhas = await tx.whatsappMensagem.findMany({
        where: {
          conversaId,
          ...(query.antesDe
            ? { criadaEm: { lt: new Date(query.antesDe) } }
            : {}),
        },
        // No máximo duas por mensagem (uma de cada lado), então vêm juntas em
        // vez de numa segunda consulta.
        include: {
          reacoes: { select: { emoji: true, deQuem: true } },
        },
        orderBy: { criadaEm: 'desc' },
        take: query.tamanho,
      });
      // Devolve em ordem cronológica: a paginação é para trás, a leitura é para
      // frente.
      const usuarioIds = [
        ...new Set(
          linhas
            .map((mensagem) => mensagem.enviadaPor)
            .filter((id): id is string => !!id),
        ),
      ];
      const usuarios = usuarioIds.length
        ? await tx.usuario.findMany({
            where: { id: { in: usuarioIds } },
            select: { id: true, nome: true },
          })
        : [];
      const nomeUsuario = new Map(
        usuarios.map((usuario) => [usuario.id, usuario.nome]),
      );
      const nomeContato =
        conversa.contato.nomeExibicao ??
        conversa.contato.telefoneNormalizado ??
        'Contato';

      return linhas.reverse().map((mensagem) => ({
        ...mensagem,
        enviadaPorNome: mensagem.enviadaPor
          ? nomeUsuario.get(mensagem.enviadaPor) ?? null
          : null,
        autorNome:
          mensagem.direcao === 'entrada'
            ? nomeContato
            : mensagem.enviadaPor
              ? nomeUsuario.get(mensagem.enviadaPor) ?? 'Atendente'
              : 'Atendente',
      }));
    });
  }

  /** Eventos comerciais internos, separados das mensagens enviadas ao cliente. */
  async eventos(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      await this.conversaNoEscopo(tx, empresaId, user, conversaId);
      const eventos = await tx.whatsappAcaoRegistro.findMany({
        where: { conversaId },
        orderBy: { criadaEm: 'asc' },
      });
      const usuarioIds = [
        ...new Set(
          eventos
            .map((evento) => evento.executadaPor)
            .filter((id): id is string => !!id),
        ),
      ];
      const usuarios = usuarioIds.length
        ? await tx.usuario.findMany({
            where: { id: { in: usuarioIds } },
            select: { id: true, nome: true },
          })
        : [];
      const nomePorId = new Map(
        usuarios.map((usuario) => [usuario.id, usuario.nome]),
      );

      return eventos.map((evento) => ({
        id: evento.id,
        acao: evento.acao,
        orcamentoId: evento.orcamentoId,
        atividadeId: evento.atividadeId,
        tituloReceberId: evento.tituloReceberId,
        detalhe:
          evento.detalhe &&
          typeof evento.detalhe === 'object' &&
          !Array.isArray(evento.detalhe)
            ? evento.detalhe
            : null,
        executadaPorNome: evento.executadaPor
          ? (nomePorId.get(evento.executadaPor) ?? null)
          : null,
        criadaEm: evento.criadaEm,
      }));
    });
  }

  /**
   * Envia mensagem pela sessão da conversa.
   *
   * A mensagem só é gravada depois que o worker confirma o envio — gravar antes
   * deixaria no histórico do vendedor uma mensagem que o cliente nunca recebeu.
   */
  async enviar(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
    input: WhatsappEnviar,
  ) {
    const config = await this.config.obter(empresaId);

    return this.prisma.withTenant(empresaId, async (tx) => {
      const conversa = await this.conversaNoEscopo(
        tx,
        empresaId,
        user,
        conversaId,
      );

      // Supervisor lê, mas não fala pelo aparelho do subordinado: quem envia é
      // o dono da sessão.
      await this.garantirDono(tx, empresaId, user, conversa);

      const enviada = await this.worker.chamar<{ externoId: string }>(
        config.workerUrl,
        `/sessoes/${conversa.sessaoId}/mensagens`,
        {
          metodo: 'POST',
          corpo: {
            jid: conversa.contato.jid,
            texto: mensagemComAutor(user.nome, input.texto),
            respondeuA: input.respondeuA ?? null,
          },
        },
      );

      const mensagem = await tx.whatsappMensagem.create({
        data: {
          empresaId,
          conversaId,
          externoId: enviada.externoId,
          direcao: 'saida',
          tipo: 'texto',
          conteudo: input.texto,
          respondeuA: input.respondeuA ?? null,
          enviadaPor: user.id,
          statusEntrega: 'enviada',
        },
      });

      await tx.whatsappConversa.update({
        where: { id: conversaId },
        data: { ultimaMensagemEm: mensagem.criadaEm },
      });

      return mensagem;
    });
  }

  /**
   * Envia um arquivo já salvo em disco pelo upload.
   *
   * A gravação da mensagem acontece **depois** da confirmação do provedor,
   * como no texto: um anexo que o cliente nunca recebeu não pode aparecer no
   * histórico como enviado.
   */
  async enviarArquivo(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
    arquivo: {
      caminhoDisco: string;
      nome: string;
      mime: string;
      tamanho: number;
    },
    input: { legenda?: string; ptt?: boolean },
  ) {
    const conteudo = await readFile(arquivo.caminhoDisco);
    return this.enviarConteudo(
      empresaId,
      user,
      conversaId,
      {
        conteudo,
        nome: arquivo.nome,
        mime: arquivo.mime,
        // O multer já gravou o arquivo em WHATSAPP_DIR; não há o que gravar
        // de novo, só apontar a mensagem para ele.
        arquivoEmDisco: basename(arquivo.caminhoDisco),
      },
      input,
    );
  }

  /**
   * Envia conteúdo que a própria plataforma produziu — hoje a proposta de
   * orçamento em PDF (ver `WhatsappAcoesService.enviarOrcamento`).
   *
   * Sem `arquivoEmDisco`, o arquivo é gravado em `WHATSAPP_DIR` **depois** da
   * confirmação do provedor, com nome opaco: se o envio falhar não fica lixo
   * no disco, e a conversa não exibe anexo que o cliente nunca recebeu.
   */
  async enviarConteudo(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
    arquivo: {
      conteudo: Buffer;
      nome: string;
      mime: string;
      arquivoEmDisco?: string;
    },
    input: { legenda?: string; ptt?: boolean },
  ) {
    const config = await this.config.obter(empresaId);

    return this.prisma.withTenant(empresaId, async (tx) => {
      const conversa = await this.conversaNoEscopo(
        tx,
        empresaId,
        user,
        conversaId,
      );
      await this.garantirDono(tx, empresaId, user, conversa);

      const tipo = this.tipoPorMime(arquivo.mime);
      const enviada = await this.worker.chamar<{ externoId: string }>(
        config.workerUrl,
        `/sessoes/${conversa.sessaoId}/arquivos`,
        {
          metodo: 'POST',
          corpo: {
            jid: conversa.contato.jid,
            tipo,
            nome: arquivo.nome,
            mime: arquivo.mime,
            legenda: input.legenda
              ? mensagemComAutor(user.nome, input.legenda)
              : mensagemComAutor(user.nome, ''),
            ptt: input.ptt ?? false,
            conteudoBase64: arquivo.conteudo.toString('base64'),
          },
        },
      );

      let emDisco = arquivo.arquivoEmDisco;
      if (!emDisco) {
        emDisco = `${randomUUID()}${extensaoPorMime(arquivo.mime)}`;
        await mkdir(WHATSAPP_DIR, { recursive: true });
        await writeFile(join(WHATSAPP_DIR, emDisco), arquivo.conteudo);
      }

      const mensagem = await tx.whatsappMensagem.create({
        data: {
          empresaId,
          conversaId,
          externoId: enviada.externoId,
          direcao: 'saida',
          tipo,
          conteudo: input.legenda ?? null,
          arquivoUrl: whatsappPublicPath(emDisco),
          arquivoNome: arquivo.nome,
          enviadaPor: user.id,
          statusEntrega: 'enviada',
        },
      });

      await tx.whatsappConversa.update({
        where: { id: conversaId },
        data: { ultimaMensagemEm: mensagem.criadaEm },
      });

      return mensagem;
    });
  }

  /**
   * Reage a uma mensagem da conversa (emoji vazio remove).
   *
   * A reação vai ao provedor **antes** de ser gravada, como o envio de
   * mensagem: emoji que o cliente não viu não pode aparecer na tela do
   * vendedor como se tivesse ido.
   *
   * Só o dono da sessão reage — supervisor lê a conversa, mas não fala pelo
   * aparelho de quem ele supervisiona, nem com emoji.
   */
  async reagir(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
    mensagemId: string,
    emoji: string,
  ) {
    const config = await this.config.obter(empresaId);

    return this.prisma.withTenant(empresaId, async (tx) => {
      const conversa = await this.conversaNoEscopo(
        tx,
        empresaId,
        user,
        conversaId,
      );
      await this.garantirDono(tx, empresaId, user, conversa);

      const mensagem = await tx.whatsappMensagem.findFirst({
        where: { id: mensagemId, conversaId },
        select: { id: true, externoId: true, direcao: true },
      });
      if (!mensagem) throw new NotFoundException('Mensagem não encontrada');

      await this.worker.chamar(
        config.workerUrl,
        `/sessoes/${conversa.sessaoId}/reacoes`,
        {
          metodo: 'POST',
          corpo: {
            jid: conversa.contato.jid,
            alvoExternoId: mensagem.externoId,
            // O provedor precisa saber se a mensagem reagida saiu daqui para
            // localizá-la — é o `fromMe` da chave dela.
            alvoNosso: mensagem.direcao === 'saida',
            emoji,
          },
        },
      );

      if (!emoji) {
        await tx.whatsappReacao.deleteMany({
          where: { mensagemId: mensagem.id, deQuem: 'nos' },
        });
        return { emoji: null };
      }

      await tx.whatsappReacao.upsert({
        where: {
          empresaId_mensagemId_deQuem: {
            empresaId,
            mensagemId: mensagem.id,
            deQuem: 'nos',
          },
        },
        create: {
          empresaId,
          mensagemId: mensagem.id,
          emoji,
          deQuem: 'nos',
          reagiuPor: user.id,
        },
        // Reagir de novo troca o emoji: o WhatsApp não acumula reações do
        // mesmo autor na mesma mensagem.
        update: { emoji, reagiuPor: user.id },
      });
      return { emoji };
    });
  }

  /**
   * Reação que chegou do celular.
   *
   * Encontrada pelo `externoId` da mensagem alvo. Reação a mensagem que a
   * plataforma **não gravou** (conversa sem cliente vinculado à época) é
   * silenciosamente ignorada: não há em que pendurar o emoji, e criar a
   * mensagem agora seria gravação retroativa — justamente o que a regra de
   * privacidade proíbe.
   */
  async receberReacao(entrada: {
    sessaoId: string;
    empresaId: string;
    jid: string;
    alvoExternoId: string;
    emoji: string;
  }) {
    const { empresaId } = entrada;

    return this.prisma.withTenant(empresaId, async (tx) => {
      const mensagem = await tx.whatsappMensagem.findFirst({
        where: {
          externoId: entrada.alvoExternoId,
          conversa: { sessaoId: entrada.sessaoId },
        },
        select: { id: true },
      });
      if (!mensagem) return { gravada: false, motivo: 'mensagem-desconhecida' };

      if (!entrada.emoji) {
        await tx.whatsappReacao.deleteMany({
          where: { mensagemId: mensagem.id, deQuem: 'contato' },
        });
        return { gravada: true, removida: true };
      }

      await tx.whatsappReacao.upsert({
        where: {
          empresaId_mensagemId_deQuem: {
            empresaId,
            mensagemId: mensagem.id,
            deQuem: 'contato',
          },
        },
        create: {
          empresaId,
          mensagemId: mensagem.id,
          emoji: entrada.emoji,
          deQuem: 'contato',
        },
        update: { emoji: entrada.emoji },
      });
      return { gravada: true, removida: false };
    });
  }

  /**
   * Recibo de entrega/leitura vindo do celular do cliente.
   *
   * `updateMany` por `externoId`, e não um por id: o WhatsApp confirma em
   * lote — abrir a conversa gera **um** recibo para tudo que estava por ler.
   *
   * O filtro `direcao: 'saida'` é a trava: recibo só fala de mensagem que
   * saiu daqui. E o `in` de status impede o retrocesso — uma mensagem já
   * `lida` não volta para `entregue` quando um recibo atrasado chega fora de
   * ordem, o que faria o visto azul piscar de volta para cinza.
   */
  async receberRecibo(entrada: {
    sessaoId: string;
    empresaId: string;
    externoIds: string[];
    status: 'entregue' | 'lida';
  }) {
    const { empresaId, status } = entrada;
    const ids = [...new Set(entrada.externoIds)].filter(Boolean);
    if (ids.length === 0) return { atualizadas: 0 };

    const anteriores: WhatsappStatusEntrega[] =
      status === 'lida' ? ['enviada', 'entregue'] : ['enviada'];

    return this.prisma.withTenant(empresaId, async (tx) => {
      const { count } = await tx.whatsappMensagem.updateMany({
        where: {
          externoId: { in: ids },
          direcao: 'saida',
          statusEntrega: { in: anteriores },
          conversa: { sessaoId: entrada.sessaoId },
        },
        data: { statusEntrega: status },
      });
      return { atualizadas: count };
    });
  }

  /**
   * Grava o arquivo de uma mensagem recebida — segundo passo do recebimento.
   *
   * O worker só chega aqui quando a API confirmou que a mensagem foi gravada;
   * mídia de conversa não vinculada a cliente nunca é baixada.
   */
  async gravarArquivoRecebido(entrada: {
    empresaId: string;
    sessaoId: string;
    externoId: string;
    nome: string | null;
    mime: string | null;
    conteudoBase64: string;
  }) {
    const conteudo = Buffer.from(entrada.conteudoBase64, 'base64');
    const mime = entrada.mime ?? 'application/octet-stream';
    // Nome opaco em disco; o nome que o cliente deu fica só na coluna.
    const arquivo = `${randomUUID()}${extensaoPorMime(mime)}`;

    await mkdir(WHATSAPP_DIR, { recursive: true });
    await writeFile(join(WHATSAPP_DIR, arquivo), conteudo);

    return this.prisma.withTenant(entrada.empresaId, async (tx) => {
      const mensagem = await tx.whatsappMensagem.findFirst({
        where: { externoId: entrada.externoId },
        select: { id: true },
      });
      if (!mensagem) return { gravado: false };

      await tx.whatsappMensagem.update({
        where: { id: mensagem.id },
        data: {
          arquivoUrl: whatsappPublicPath(arquivo),
          arquivoNome: entrada.nome,
        },
      });
      return { gravado: true };
    });
  }

  /**
   * Este usuário é o vendedor dono da sessão?
   *
   * Existe separado de `garantirDono` porque nem todo caminho quer o 403: a
   * tela chama `marcarLida` sozinha ao abrir a conversa, e o supervisor que
   * está apenas lendo não pode receber erro — nem disparar os efeitos.
   */
  private async ehDono(
    tx: TenantTx,
    empresaId: string,
    user: AuthenticatedUser,
    conversa: { sessao: { vendedorId: string } },
  ) {
    const vendedor = await tx.vendedor.findFirst({
      where: { usuarioId: user.id, empresaId, deletedAt: null },
      select: { id: true },
    });
    return !!vendedor && vendedor.id === conversa.sessao.vendedorId;
  }

  /** Só o dono da sessão fala pelo aparelho — o supervisor lê, não responde. */
  private async garantirDono(
    tx: TenantTx,
    empresaId: string,
    user: AuthenticatedUser,
    conversa: { sessao: { vendedorId: string; status: string } },
  ) {
    if (!(await this.ehDono(tx, empresaId, user, conversa))) {
      throw new ForbiddenException(
        'Só o vendedor dono da sessão pode responder por ela.',
      );
    }
    if (conversa.sessao.status !== 'conectada') {
      throw new BadRequestException(
        'O WhatsApp não está conectado. Conecte o aparelho pelo botão da tela de Atendimento.',
      );
    }
  }

  /** O WhatsApp mostra a mídia conforme o tipo, não conforme a extensão. */
  private tipoPorMime(
    mime: string,
  ): 'imagem' | 'video' | 'audio' | 'documento' {
    if (mime.startsWith('image/')) return 'imagem';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    return 'documento';
  }

  /**
   * Vincula (ou desvincula) o contato a um cliente.
   *
   * É o vínculo que **autoriza a gravação** da conversa — por isso o cliente
   * precisa estar na carteira de quem vincula, senão bastaria apontar para
   * qualquer cliente para começar a gravar.
   *
   * Gravação retroativa não acontece: o que passou antes do vínculo não existe
   * e não é recuperado.
   */
  async vincular(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
    input: WhatsappVincular,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const conversa = await this.conversaNoEscopo(
        tx,
        empresaId,
        user,
        conversaId,
      );

      // Supervisor e gerente acompanham o atendimento alheio para monitorar, e
      // só isso. Vincular não é detalhe de cadastro: é o vínculo que autoriza a
      // **gravação** da conversa, então deixá-lo aberto ao supervisor seria
      // ligar a gravação do atendimento de outra pessoa.
      if (!(await this.ehDono(tx, empresaId, user, conversa))) {
        throw new ForbiddenException(
          'Só o vendedor dono da conversa pode vincular o contato a um cliente.',
        );
      }

      if (input.clienteId) {
        // A carteira que vale é a do **vendedor dono da conversa**, não a do
        // escopo de quem está mexendo: um supervisor enxerga a equipe inteira,
        // e vincular ali um cliente de outro vendedor criaria atendimento
        // cruzado — o dono da conversa passaria a ver posição, títulos e
        // orçamentos de um cliente que não é dele.
        const cliente = await tx.cliente.findFirst({
          where: {
            id: input.clienteId,
            deletedAt: null,
            vendedorId: conversa.sessao.vendedorId,
          },
          select: { id: true },
        });
        if (!cliente) {
          throw new NotFoundException(
            'Só é possível vincular um cliente da carteira do vendedor desta conversa.',
          );
        }
      }

      await tx.whatsappContato.update({
        where: { id: conversa.contatoId },
        data: {
          clienteId: input.clienteId,
          ignorado: input.ignorar,
          tipo: input.tipo,
          nomeExibicao: input.nome ?? undefined,
          email: input.email ?? undefined,
          vinculadoPor: user.id,
          vinculadoEm: input.clienteId ? new Date() : null,
        },
      });

      return tx.whatsappConversa.update({
        where: { id: conversaId },
        data: { clienteId: input.clienteId },
      });
    });
  }

  /**
   * Abre (ou reabre) a conversa com um contato — o "começar conversa" da tela.
   *
   * Sem isto o vendedor só conseguia responder quem escrevesse primeiro, que
   * é o oposto de como ele trabalha: o cliente está na agenda dele há anos.
   *
   * Aceita dois caminhos, e nenhum dos dois cria conversa às cegas:
   * - **por cliente da carteira**, usando o telefone do cadastro;
   * - **por jid da agenda**, para contato que ainda não é cliente.
   *
   * Note que abrir conversa **não** grava mensagem nenhuma: continua valendo
   * que só conversa de contato vinculado a cliente é registrada.
   */
  async iniciarConversa(
    empresaId: string,
    user: AuthenticatedUser,
    input: WhatsappIniciarConversa,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const vendedor = await tx.vendedor.findFirst({
        where: { usuarioId: user.id, empresaId, deletedAt: null },
        select: { id: true },
      });
      if (!vendedor) {
        throw new BadRequestException(
          'Seu usuário não está vinculado a um cadastro de vendedor.',
        );
      }

      const sessao = await tx.whatsappSessao.findUnique({
        where: { empresaId_vendedorId: { empresaId, vendedorId: vendedor.id } },
        select: { id: true, status: true },
      });
      if (!sessao || sessao.status !== 'conectada') {
        throw new BadRequestException(
          'Seu WhatsApp não está conectado. Conecte o aparelho para iniciar uma conversa.',
        );
      }

      let jid = input.jid ?? null;
      let telefone = input.telefone ? input.telefone.replace(/\D/g, '') : null;
      const clienteId = input.clienteId ?? null;
      let nome = input.nome ?? null;

      if (clienteId) {
        const escopo = await resolverEscopoVendedores(tx, empresaId, user);
        const cliente = await tx.cliente.findFirst({
          where: {
            id: clienteId,
            deletedAt: null,
            ...combinarFiltroVendedor(escopo),
          },
          select: {
            razaoSocial: true,
            celular: true,
            telefone: true,
            telefone2: true,
          },
        });
        if (!cliente) {
          throw new NotFoundException(
            'Cliente não encontrado na sua carteira.',
          );
        }
        nome = nome ?? cliente.razaoSocial;
        // Celular primeiro: é o que costuma ter WhatsApp.
        telefone =
          telefone ??
          this.primeiroTelefoneValido([
            cliente.celular,
            cliente.telefone,
            cliente.telefone2,
          ]);
        if (!telefone) {
          throw new BadRequestException(
            `${cliente.razaoSocial} não tem telefone no cadastro. Informe o número para iniciar a conversa.`,
          );
        }
      }

      if (!jid) {
        if (!telefone) {
          throw new BadRequestException('Informe o cliente ou o número.');
        }
        jid = `${await this.numeroCompleto(empresaId, telefone)}@s.whatsapp.net`;
      }

      // Feed de status, lista de transmissão, canal e grupo não são
      // atendimento — e o envio para eles falha lá no provedor, sem sessão
      // Signal, depois da conversa já existir na tela. A lista da agenda já
      // os esconde; esconder não é recusar, e foi por aqui que um
      // `status@broadcast` virou conversa.
      if (!this.jidDePessoa(jid)) {
        throw new BadRequestException(
          'Só é possível conversar com um contato — status, canais, listas de transmissão e grupos não são atendimento.',
        );
      }

      const contato = await tx.whatsappContato.upsert({
        where: { empresaId_jid: { empresaId, jid } },
        create: {
          empresaId,
          jid,
          nomeExibicao: nome,
          telefoneNormalizado: telefone,
          clienteId,
          ...(clienteId
            ? { vinculadoPor: user.id, vinculadoEm: new Date() }
            : {}),
        },
        update: {
          // Vínculo existente não é sobrescrito por um "iniciar conversa":
          // desvincular é decisão explícita, feita na tela de vínculo.
          ...(clienteId
            ? { clienteId, vinculadoPor: user.id, vinculadoEm: new Date() }
            : {}),
          ...(nome ? { nomeExibicao: nome } : {}),
          ...(telefone ? { telefoneNormalizado: telefone } : {}),
        },
      });

      const conversa = await tx.whatsappConversa.upsert({
        where: {
          empresaId_sessaoId_contatoId: {
            empresaId,
            sessaoId: sessao.id,
            contatoId: contato.id,
          },
        },
        create: {
          empresaId,
          sessaoId: sessao.id,
          contatoId: contato.id,
          clienteId: contato.clienteId,
        },
        // Reabrir uma conversa arquivada é justamente o que o vendedor quer
        // ao procurá-la de novo.
        update: { clienteId: contato.clienteId, arquivada: false },
      });

      return conversa;
    });
  }

  /**
   * O jid é de uma pessoa (contato individual), e não de status, canal, lista
   * de transmissão ou grupo?
   *
   * Vale para os dois formatos que o WhatsApp entrega — `@s.whatsapp.net` e o
   * `@lid` opaco (ver `contatoPorTelefone`).
   */
  private jidDePessoa(jid: string): boolean {
    const destino = jid.trim().toLowerCase();
    if (!destino) return false;
    if (
      destino === 'status@broadcast' ||
      destino.endsWith('@broadcast') ||
      destino.endsWith('@newsletter') ||
      destino.endsWith('@g.us')
    ) {
      return false;
    }
    return destino.endsWith('@s.whatsapp.net') || destino.endsWith('@lid');
  }

  private primeiroTelefoneValido(candidatos: (string | null)[]): string | null {
    for (const bruto of candidatos) {
      const digitos = (bruto ?? '').replace(/\D/g, '');
      // 8 dígitos é o mínimo de um número local — nesta base a maioria dos
      // telefones está gravada sem DDD (ver `numeroCompleto`).
      if (digitos.length >= 8) return digitos;
    }
    return null;
  }

  /**
   * Monta o número no formato que o provedor exige (DDI + DDD + número).
   *
   * O ponto delicado: **a maioria dos telefones desta base está sem DDD**
   * (8 ou 9 dígitos). Completar por dedução — pelo estado do cliente, pela
   * cidade da empresa — manda mensagem para um desconhecido em outro DDD.
   * Por isso o DDD padrão é configuração explícita da empresa, e sem ela o
   * sistema recusa em vez de chutar.
   */
  private async numeroCompleto(empresaId: string, telefone: string) {
    const digitos = telefone.replace(/\D/g, '');
    // Já veio com DDI (55 + DDD + 8/9 dígitos).
    if (digitos.length >= 12) return digitos;
    // DDD presente, DDI ausente.
    if (digitos.length >= 10) return `55${digitos}`;

    const config = await this.config.obter(empresaId);
    if (!config.dddPadrao) {
      throw new BadRequestException(
        `O telefone ${telefone} está cadastrado sem DDD, e não há DDD padrão ` +
          'configurado em Administração > WhatsApp. Informe o número completo ' +
          'com DDD para iniciar a conversa.',
      );
    }
    return `55${config.dddPadrao}${digitos}`;
  }

  /**
   * Zera o contador de não lidas — a tela chama ao abrir a conversa.
   *
   * Também manda o recibo de leitura pelo provedor: sem isso a conversa
   * continua marcada como não lida no celular do vendedor, e ele acaba
   * respondendo duas vezes a mesma mensagem.
   *
   * **Só tem efeito para o dono da sessão.** Gerente e supervisor leem o
   * atendimento alheio sem tocar nele: marcar lida zeraria o contador do
   * vendedor, apagaria o item do sino dele e — o pior — mandaria o visto azul
   * ao cliente pelo aparelho dele, que é interferência visível de fora. Quem
   * não é dono sai daqui sem efeito nenhum, e não com 403: a tela chama este
   * endpoint sozinha ao abrir a conversa, e o erro apareceria para quem não
   * fez nada.
   */
  async marcarLida(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
  ) {
    const config = await this.config.obter(empresaId);

    return this.prisma.withTenant(empresaId, async (tx) => {
      const conversa = await this.conversaNoEscopo(
        tx,
        empresaId,
        user,
        conversaId,
      );
      if (!(await this.ehDono(tx, empresaId, user, conversa))) return conversa;

      const ultima = await tx.whatsappMensagem.findFirst({
        where: { conversaId, direcao: 'entrada' },
        orderBy: { criadaEm: 'desc' },
        select: { externoId: true },
      });

      if (ultima && conversa.sessao.status === 'conectada') {
        // Cortesia com o cliente, não pode derrubar a abertura da conversa.
        await this.worker
          .chamar(config.workerUrl, `/sessoes/${conversa.sessaoId}/lida`, {
            metodo: 'POST',
            corpo: { jid: conversa.contato.jid, externoId: ultima.externoId },
          })
          .catch(() => undefined);
      }

      // A tabela de notificações é fonte única do sino, então zerar as não
      // lidas aqui e deixar a linha pendente lá faria o badge insistir numa
      // conversa que o vendedor acabou de ler.
      await marcarNotificacoesDaOrigem(tx, {
        empresaId,
        tipos: ['whatsapp_mensagem'],
        referenciaId: conversaId,
      });

      return tx.whatsappConversa.update({
        where: { id: conversaId },
        data: { naoLidas: 0 },
      });
    });
  }

  /**
   * As mensagens de uma conversa da **própria** conexão.
   *
   * O agente de IA lê por aqui, e não por `mensagens`, porque o corte é outro.
   * `mensagens` usa o escopo da tela, onde gerente e supervisor alcançam o
   * atendimento da equipe para monitorar — e monitorar é olhar, na tela, o que
   * já está gravado. Perguntar ao assistente é diferente: o texto da conversa
   * viaja para o provedor de IA. Decisão do usuário em 2026-08-25: pelo
   * agente, cada um lê só o que ele mesmo atendeu.
   *
   * 404, e não 403, pela mesma razão de `conversaNoEscopo`: a conversa de
   * outro vendedor não deve nem revelar que existe.
   */
  async mensagensDaPropriaConexao(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
    query: WhatsappMensagemQuery,
  ) {
    await this.prisma.withTenant(empresaId, async (tx) => {
      const conversa = await this.conversaNoEscopo(
        tx,
        empresaId,
        user,
        conversaId,
      );
      if (!(await this.ehDono(tx, empresaId, user, conversa))) {
        throw new NotFoundException('Conversa não encontrada');
      }
    });

    return this.mensagens(empresaId, user, conversaId, query);
  }

  /**
   * Recebe uma mensagem vinda do worker.
   *
   * **Aqui mora a regra de privacidade do módulo:** só se persiste conversa de
   * contato ligado a um cliente. Se o vendedor parear um número que também usa
   * na vida pessoal, o sistema estaria gravando a conversa dele com a família.
   *
   * Contato sem cliente gera apenas o registro mínimo de "existe uma conversa
   * não vinculada" — o texto **não** é gravado. Se o vendedor vincular depois,
   * a gravação começa dali em diante: **retroativo nunca acontece**, porque o
   * que não foi gravado não existe para ser recuperado.
   */
  async receber(entrada: {
    sessaoId: string;
    empresaId: string;
    externoId: string;
    jid: string;
    telefone?: string | null;
    nomeExibicao: string | null;
    texto: string | null;
    tipo: string;
    arquivoNome?: string | null;
    arquivoMime?: string | null;
    respondeuA?: string | null;
    /** Saiu do aparelho do vendedor (celular), não do cliente. */
    minha?: boolean;
  }) {
    const { empresaId } = entrada;
    const minha = Boolean(entrada.minha);

    return this.prisma.withTenant(empresaId, async (tx) => {
      const sessao = await tx.whatsappSessao.findFirst({
        where: { id: entrada.sessaoId },
        select: { id: true, vendedorId: true },
      });
      if (!sessao) return { gravada: false, motivo: 'sessao-desconhecida' };

      // O jid nem sempre contém o número: no formato novo do WhatsApp
      // (`253368761077916@lid`) ele é um identificador opaco, e extrair
      // dígitos dali produziria um "telefone" que nunca casa com cliente
      // nenhum. O telefone de verdade vem resolvido pelo worker.
      const telefone =
        (entrada.telefone ?? '').replace(/\D/g, '') ||
        (entrada.jid.includes('@lid')
          ? ''
          : entrada.jid.split(/[:@]/)[0].replace(/\D/g, ''));

      // Mesmo contato pode chegar com dois jids diferentes (o formato novo
      // `@lid` e o clássico `@s.whatsapp.net`). Procurar pelo telefone antes
      // de criar é o que evita duas conversas com a mesma pessoa — e o
      // vínculo com cliente que ficaria só em uma delas.
      const existente = telefone
        ? await tx.whatsappContato.findFirst({
            where: { telefoneNormalizado: telefone },
            select: { id: true, jid: true },
          })
        : null;

      const contato = existente
        ? await tx.whatsappContato.update({
            where: { id: existente.id },
            data: { nomeExibicao: entrada.nomeExibicao ?? undefined },
          })
        : await tx.whatsappContato.upsert({
            where: { empresaId_jid: { empresaId, jid: entrada.jid } },
            create: {
              empresaId,
              jid: entrada.jid,
              nomeExibicao: entrada.nomeExibicao,
              telefoneNormalizado: telefone || null,
              // Casamento automático pelo telefone, restrito à carteira do
              // vendedor dono da sessão. Ambiguidade não adivinha: dois
              // clientes com o mesmo telefone deixam o vínculo em branco.
              clienteId: await this.casarCliente(
                tx,
                empresaId,
                sessao.vendedorId,
                telefone,
              ),
            },
            update: {
              nomeExibicao: entrada.nomeExibicao ?? undefined,
              ...(telefone ? { telefoneNormalizado: telefone } : {}),
            },
          });

      const conversa = await tx.whatsappConversa.upsert({
        where: {
          empresaId_sessaoId_contatoId: {
            empresaId,
            sessaoId: sessao.id,
            contatoId: contato.id,
          },
        },
        create: {
          empresaId,
          sessaoId: sessao.id,
          contatoId: contato.id,
          clienteId: contato.clienteId,
          ultimaMensagemEm: new Date(),
          // A que o próprio vendedor mandou não conta como não lida: ele
          // acabou de escrevê-la. Contar faria o badge subir pela resposta
          // dele mesmo, e a conversa pedir atenção que já teve.
          naoLidas: minha ? 0 : 1,
        },
        update: {
          clienteId: contato.clienteId,
          ultimaMensagemEm: new Date(),
          ...(minha ? {} : { naoLidas: { increment: 1 } }),
        },
      });

      // Quem é avisado pelo sino: o usuário do vendedor dono da sessão. Sem
      // login vinculado não há destinatário, e a mensagem só fica na tela.
      const destinatario = await usuarioDoVendedor(
        tx,
        empresaId,
        sessao.vendedorId,
      );
      const nomeNoAviso =
        contato.nomeExibicao ??
        contato.telefoneNormalizado ??
        contato.jid.split('@')[0];

      if (!contato.clienteId) {
        // A conversa existe para o vendedor poder vinculá-la; o conteúdo, não.
        //
        // O log existe porque este descarte é indistinguível, de fora, de uma
        // mensagem que se perdeu: a conversa sobe na lista, o texto não
        // aparece, e nada em lugar nenhum dizia o motivo. Custou uma
        // investigação inteira (ver docs/planos/whatsapp-vendedor.md).
        this.logger.log(
          `Mensagem descartada por falta de vínculo: conversa ${conversa.id}, contato ${contato.jid}`,
        );
        // Notifica mesmo assim: o **fato** de o contato ter escrito não é
        // conteúdo, e é o que faz o vendedor abrir a conversa e vinculá-la ao
        // cliente. Sem aviso, mensagem de contato não vinculado não chega a
        // lugar nenhum — foi exatamente o relato de "mandei e não chegou".
        // Nada a avisar quando a mensagem é do próprio vendedor.
        if (destinatario && !minha) {
          await registrarNotificacao(tx, {
            empresaId,
            usuarioId: destinatario,
            tipo: 'whatsapp_mensagem',
            titulo: nomeNoAviso,
            rota: `/comercial/atendimento?conversa=${conversa.id}`,
            referenciaId: conversa.id,
            acumular: true,
          });
        }
        return {
          gravada: false,
          motivo: 'sem-vinculo',
          conversaId: conversa.id,
        };
      }

      // Se esta mensagem já tinha sido gravada, é reenvio da reconexão: o
      // upsert abaixo é idempotente e o aviso também precisa ser, senão o
      // contador do sino sobe sozinho a cada reconexão do aparelho.
      const jaGravada = await tx.whatsappMensagem.findUnique({
        where: {
          empresaId_conversaId_externoId: {
            empresaId,
            conversaId: conversa.id,
            externoId: entrada.externoId,
          },
        },
        select: { id: true },
      });

      const mensagem = await tx.whatsappMensagem.upsert({
        // Idempotência da reconexão: o provedor reenvia o que já entregou.
        where: {
          empresaId_conversaId_externoId: {
            empresaId,
            conversaId: conversa.id,
            externoId: entrada.externoId,
          },
        },
        create: {
          empresaId,
          conversaId: conversa.id,
          externoId: entrada.externoId,
          direcao: minha ? 'saida' : 'entrada',
          tipo: (entrada.tipo as 'texto') ?? 'texto',
          conteudo: entrada.texto,
          arquivoNome: entrada.arquivoNome ?? null,
          respondeuA: entrada.respondeuA ?? null,
          // A do celular já saiu do aparelho, mas o recibo do destinatário
          // ainda não passou por aqui: entra como `enviada`, e o evento
          // `receipt` a leva a entregue/lida como qualquer outra.
          statusEntrega: minha ? 'enviada' : 'entregue',
        },
        update: {},
        select: { id: true, arquivoUrl: true },
      });

      // Mensagem do próprio vendedor não vira aviso para ele mesmo.
      if (destinatario && !jaGravada && !minha) {
        await registrarNotificacao(tx, {
          empresaId,
          usuarioId: destinatario,
          tipo: 'whatsapp_mensagem',
          titulo: nomeNoAviso,
          // Sem prévia do texto: o sino aparece na tela inteira do sistema, e
          // a conversa com o cliente não precisa ficar legível por cima do
          // ombro de quem passa. Quem quer ler abre a conversa.
          rota: `/comercial/atendimento?conversa=${conversa.id}`,
          referenciaId: conversa.id,
          acumular: true,
        });
      }

      return {
        gravada: true,
        conversaId: conversa.id,
        // Pedir o arquivo é um segundo passo: só depois de decidir que a
        // mensagem fica é que faz sentido baixar a mídia dela. Reenvio de
        // mensagem já baixada não pede de novo.
        arquivoNecessario: MIDIA.includes(entrada.tipo) && !mensagem.arquivoUrl,
      };
    });
  }

  /** null quando não há candidato **ou** quando há mais de um (não adivinha). */
  private async casarCliente(
    tx: TenantTx,
    empresaId: string,
    vendedorId: string,
    telefone: string,
  ): Promise<string | null> {
    if (telefone.length < 8) return null;
    // Compara pelos últimos 8 dígitos: cobre com/sem DDI 55 e com/sem o 9º
    // dígito sem precisar normalizar a base inteira.
    const sufixo = telefone.slice(-8);
    const candidatos = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM clientes
      WHERE "empresaId" = ${empresaId}
        AND "vendedorId" = ${vendedorId}
        AND "deletedAt" IS NULL
        AND (
          right(regexp_replace(coalesce(telefone,  ''), '\D', '', 'g'), 8) = ${sufixo} OR
          right(regexp_replace(coalesce(telefone2, ''), '\D', '', 'g'), 8) = ${sufixo} OR
          right(regexp_replace(coalesce(celular,   ''), '\D', '', 'g'), 8) = ${sufixo}
        )
      LIMIT 2`;
    return candidatos.length === 1 ? candidatos[0].id : null;
  }

  /**
   * Sessões a reabrir quando o worker sobe.
   *
   * Percorre empresa a empresa porque `whatsapp_sessoes` tem RLS: uma consulta
   * sem tenant no contexto volta vazia, por desenho.
   *
   * Só as `conectada`: quem estava em `pareando` não chegou a ler o QR, e
   * reabrir essa sessão faria o worker manter um socket aberto gerando QR que
   * ninguém está olhando.
   */
  async sessoesParaRestaurar() {
    const empresas = await this.prisma.empresa.findMany({
      where: { ativo: true, deletedAt: null },
      select: { id: true },
    });

    const restaurar: { sessaoId: string; empresaId: string }[] = [];
    for (const empresa of empresas) {
      const sessoes = await this.prisma.withTenant(empresa.id, (tx) =>
        tx.whatsappSessao.findMany({
          where: { status: 'conectada' },
          select: { id: true },
        }),
      );
      for (const s of sessoes) {
        restaurar.push({ sessaoId: s.id, empresaId: empresa.id });
      }
    }
    return restaurar;
  }

  /**
   * O que o WhatsApp tem a dizer ao sino: conversas não lidas e agendamentos
   * que falharam.
   *
   * As duas consultas ficam **no mesmo `withTenant`** porque o feed roda em
   * intervalo curto para cada usuário logado — abrir duas transações por
   * passagem dobraria o custo sem necessidade.
   *
   * O escopo é o mesmo da tela (`filtroSessao`): quem não pode ler a conversa
   * do colega também não é notificado por ela.
   */
  async resumoParaNotificacoes(empresaId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const filtro = await this.filtroSessao(tx, empresaId, user);
      const [naoLidas, agendamentos] = await Promise.all([
        tx.whatsappConversa.findMany({
          where: { ...filtro, naoLidas: { gt: 0 }, arquivada: false },
          select: {
            id: true,
            naoLidas: true,
            ultimaMensagemEm: true,
            contato: {
              select: {
                jid: true,
                nomeExibicao: true,
                telefoneNormalizado: true,
              },
            },
            cliente: { select: { razaoSocial: true } },
          },
          orderBy: { ultimaMensagemEm: 'desc' },
          take: 10,
        }),
        // Agendamento que falhou já aparece como erro dentro da conversa, mas
        // só para quem a abre. No sino é o único aviso de que a mensagem
        // combinada com o cliente **não saiu**.
        tx.whatsappMensagemAgendada.findMany({
          where: { status: 'erro', conversa: filtro },
          select: {
            id: true,
            conversaId: true,
            texto: true,
            enviarEm: true,
            erro: true,
            conversa: {
              select: {
                contato: {
                  select: {
                    jid: true,
                    nomeExibicao: true,
                    telefoneNormalizado: true,
                  },
                },
              },
            },
          },
          orderBy: { enviarEm: 'desc' },
          take: 10,
        }),
      ]);
      return { naoLidas, agendamentos };
    });
  }
}
