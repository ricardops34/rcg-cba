import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { WhatsappTransporte } from '@plataforma/contracts';
import { EvolutionGoClient, lista, texto } from './evolution-go.client';
import type {
  ArquivoParaEnviar,
  ContatoAparelho,
  ContextoSessao,
  DadosInstancia,
  EstadoPareamento,
  FotoContato,
  WhatsappProvider,
} from './whatsapp-provider';

/**
 * Eventos que a instância assina ao conectar.
 *
 * É a lista mínima para o atendimento funcionar como funciona hoje no zapo:
 * mensagem recebida, eco do que o vendedor mandou pelo celular, recibo de
 * entrega/leitura, mudança de conexão, QR e agenda. Assinar mais do que se
 * processa só aumenta o tráfego e o ruído no log.
 */
const EVENTOS = [
  'MESSAGE',
  'SEND_MESSAGE',
  'READ_RECEIPT',
  'CONNECTION',
  'QRCODE',
  'CONTACT',
  'HISTORY_SYNC',
] as const;

/**
 * Provedor Evolution GO.
 *
 * A diferença central em relação ao zapo não é o protocolo, é **quem guarda a
 * sessão**: aqui o gateway mantém as credenciais, o QR e a reconexão no banco
 * dele. A plataforma deixa de ser dona da conexão e passa a ser cliente dela —
 * o que muda o significado das operações administrativas, e por isso
 * `desconectar` (para, preservando credencial) e `removerInstancia` (logout +
 * delete, exige novo QR) são coisas diferentes aqui, não sinônimos.
 *
 * O que **não** muda: a regra de só gravar conversa de contato vinculado a
 * cliente, o RBAC e o escopo de carteira continuam na API. Por isso a mídia é
 * baixada em dois tempos, exatamente como no worker — ver `baixarMidia`.
 *
 * Nomes de rota e formatos de payload seguem
 * `docs/whatsapp/integracao-evolution-go.md`. Os pontos que aquele documento
 * marca como "a validar" estão tratados de forma defensiva aqui, e cada um tem
 * o comentário dizendo o que acontece se a versão homologada divergir.
 */
@Injectable()
export class EvolutionGoProvider implements WhatsappProvider {
  readonly transporte: WhatsappTransporte = 'evolution_go';
  private readonly logger = new Logger(EvolutionGoProvider.name);

  constructor(private readonly http: EvolutionGoClient) {}

  // ----------------------------------------------------------------------
  // Instância e conexão
  // ----------------------------------------------------------------------

  /**
   * Nome técnico da instância.
   *
   * Determinístico a partir do id da sessão, e não sequencial nem pelo nome do
   * vendedor: precisa sobreviver a renomeação de pessoa, ser único entre
   * empresas do mesmo gateway e permitir reencontrar a instância quando a
   * linha local perdeu o `instanciaId` (deploy interrompido no meio da
   * criação).
   */
  private nomeInstancia(ctx: ContextoSessao): string {
    return ctx.instancia.nome ?? `rcg-${ctx.sessaoId}`;
  }

  /**
   * Endereço que a Evolution GO chama de volta.
   *
   * Carrega empresa e sessão no caminho porque o webhook chega **sem tenant no
   * contexto** e as tabelas têm RLS: sem a empresa, a API não conseguiria nem
   * localizar a própria sessão para descobrir de quem é o evento.
   *
   * A credencial vai no `userinfo` da URL. O cliente HTTP a transforma em
   * `Authorization: Basic`; o request-target enviado ao proxy não carrega o
   * segredo, ao contrário de uma query string.
   */
  private urlWebhook(ctx: ContextoSessao, segredo: string): string {
    const base = (
      process.env.WHATSAPP_EVOLUTION_WEBHOOK_BASE_URL ?? 'http://api:3001'
    ).replace(/\/+$/, '');
    const url = new URL(
      `${base}/api/v1/whatsapp/evolution/webhook/${ctx.empresaId}/${ctx.sessaoId}`,
    );
    url.username = 'webhook';
    url.password = segredo;
    return url.toString();
  }

  /** Credencial administrativa: cria, conecta e apaga instância. */
  private chaveAdmin(ctx: ContextoSessao): string | null {
    return ctx.config.evolutionApiKey;
  }

  /**
   * Credencial de operação. O token da instância quando existe; a chave
   * administrativa como retaguarda, para a sessão criada antes de o gateway
   * passar a devolver token não ficar muda.
   */
  private chaveInstancia(ctx: ContextoSessao): string | null {
    return ctx.instancia.token ?? ctx.config.evolutionApiKey;
  }

  /** Identificador aceito pelas rotas de operação. */
  private idInstancia(ctx: ContextoSessao): string {
    return ctx.instancia.id ?? this.nomeInstancia(ctx);
  }

  async iniciar(
    ctx: ContextoSessao,
    opcoes: { arquivarMensagens: boolean },
  ): Promise<DadosInstancia | null> {
    const url = ctx.config.evolutionUrl;
    const jaExiste = Boolean(ctx.instancia.nome);

    const nome = this.nomeInstancia(ctx);
    // Segredos novos só quando a instância nasce: regerá-los a cada reconexão
    // invalidaria o webhook já registrado no gateway entre a gravação local e
    // o próximo `connect`, e mensagens cairiam nesse intervalo.
    const token = ctx.instancia.token ?? randomBytes(32).toString('hex');
    const webhookSegredo =
      ctx.instancia.webhookSegredo ?? randomBytes(32).toString('hex');

    let instanciaId = ctx.instancia.id;

    if (!jaExiste) {
      // Corpo conferido contra o Swagger da 0.7.2: `{name, instanceId?, token,
      // advancedSettings?, proxy?}`. Não existe campo para desligar o arquivo
      // de mensagens nem o envio de mídia no webhook — isso é configuração do
      // **serviço** (`DATABASE_SAVE_MESSAGES`, `WEBHOOK_FILES`), fixada no
      // stack. Se o gateway subir sem elas, a regra de privacidade depende da
      // API descartar o que chegar a mais.
      const criada = await this.http.chamar<unknown>(url, '/instance/create', {
        metodo: 'POST',
        credencial: this.chaveAdmin(ctx),
        corpo: {
          name: nome,
          token,
          advancedSettings: {
            // Grupo não faz parte do atendimento; ignorar na origem evita
            // tráfego que a API descartaria de qualquer forma.
            ignoreGroups: true,
            ignoreStatus: true,
            // Quem marca como lida é o vendedor, abrindo a conversa. Ligar
            // isto mandaria o visto azul ao cliente sem ninguém ter lido.
            readMessages: false,
            alwaysOnline: false,
          },
        },
      });
      instanciaId =
        texto(criada, 'instanceId', 'id', 'instance_id', 'instance.id') ?? null;
    }

    // `connect` é chamado sempre, inclusive na instância que já existia: é ele
    // que (re)registra o webhook e a lista de eventos. Uma instância que voltou
    // do restart do gateway sem webhook fica conectada e muda — o pior estado
    // possível, porque parece que está funcionando.
    //
    // Os nomes vêm do Swagger da 0.7.2: a lista de eventos chama-se
    // `subscribe` (não `events`) e o callback, `webhookUrl` (não `webhook`).
    //
    // `arquivarMensagens` não tem para onde ir no `connect`: o gateway guarda
    // (ou não) conforme o `DATABASE_SAVE_MESSAGES` do serviço, e o histórico é
    // pedido depois, por `/chat/history-sync`, quando a administração manda.
    // Fica no log porque explica por que uma instância "com histórico ligado"
    // não traz nada sozinha.
    if (opcoes.arquivarMensagens) {
      this.logger.debug(
        `Sessão ${ctx.sessaoId} conectada com histórico habilitado; a importação ` +
          'é disparada pela tela, não pelo connect.',
      );
    }

    await this.http.chamar(url, '/instance/connect', {
      metodo: 'POST',
      credencial: this.chaveInstancia(ctx),
      corpo: {
        webhookUrl: this.urlWebhook(ctx, webhookSegredo),
        subscribe: [...EVENTOS],
      },
    });

    return { nome, id: instanciaId, token, webhookSegredo };
  }

  async pareamento(ctx: ContextoSessao): Promise<EstadoPareamento> {
    const url = ctx.config.evolutionUrl;

    // Sem `instanceId` na query: quem identifica a instância é a credencial no
    // cabeçalho — nenhuma rota de operação da 0.7.2 recebe o id.
    const estado = await this.http.chamar<unknown>(url, '/instance/status', {
      credencial: this.chaveInstancia(ctx),
      aceitarAusente: true,
    });

    const status = this.traduzirStatus(
      texto(estado, 'state', 'status', 'connection', 'instance.state'),
    );
    const numero = this.somenteDigitos(
      texto(estado, 'number', 'phone', 'owner', 'instance.owner', 'jid'),
    );

    // O QR só é buscado enquanto faz sentido: pedi-lo com a sessão conectada
    // devolve erro em algumas versões, e o erro apareceria na tela como falha
    // de uma sessão que está perfeitamente de pé.
    let qr: string | null = null;
    if (status === 'pareando' || status === 'desconectada') {
      const resposta = await this.http
        .chamar<unknown>(url, '/instance/qr', {
          credencial: this.chaveInstancia(ctx),
          aceitarAusente: true,
        })
        .catch(() => null);
      qr =
        texto(resposta, 'qrcode', 'qr', 'code', 'base64', 'qrcode.code') ??
        null;
    }

    return {
      // Sem QR e sem conexão, "pareando" seria mentira para a tela, que ficaria
      // girando para sempre; com QR na mão, é a verdade.
      status: status === 'desconectada' && qr ? 'pareando' : status,
      qr,
      numero,
      erro: texto(estado, 'error', 'lastError', 'message'),
    };
  }

  async desconectar(ctx: ContextoSessao): Promise<void> {
    await this.http.chamar(ctx.config.evolutionUrl, '/instance/disconnect', {
      metodo: 'POST',
      credencial: this.chaveInstancia(ctx),
      aceitarAusente: true,
    });
  }

  /**
   * Sai do WhatsApp: o aparelho some de "Aparelhos conectados" e a credencial
   * pareada morre. A instância continua existindo no gateway, pronta para um
   * novo QR.
   */
  async sairDoWhatsapp(ctx: ContextoSessao): Promise<void> {
    await this.http.chamar(ctx.config.evolutionUrl, '/instance/logout', {
      metodo: 'DELETE',
      credencial: this.chaveInstancia(ctx),
      aceitarAusente: true,
    });
  }

  /**
   * Logout e exclusão da instância.
   *
   * O logout é melhor-esforço: uma instância já deslogada faz a rota devolver
   * erro, e isso não pode impedir a exclusão. O que não pode falhar em
   * silêncio é o `delete` — uma instância órfã no gateway continua guardando a
   * credencial do WhatsApp do vendedor.
   */
  async removerInstancia(ctx: ContextoSessao): Promise<void> {
    const id = this.idInstancia(ctx);

    await this.sairDoWhatsapp(ctx).catch((erro: unknown) => {
      this.logger.warn(
        `logout da instância ${id} falhou, seguindo para o delete: ` +
          `${erro instanceof Error ? erro.message : String(erro)}`,
      );
    });

    await this.http.chamar(
      ctx.config.evolutionUrl,
      `/instance/delete/${encodeURIComponent(id)}`,
      {
        metodo: 'DELETE',
        credencial: this.chaveAdmin(ctx),
        aceitarAusente: true,
      },
    );
  }

  // ----------------------------------------------------------------------
  // Mensagens
  // ----------------------------------------------------------------------

  async enviarTexto(
    ctx: ContextoSessao,
    dados: { jid: string; texto: string; respondeuA?: string | null },
  ): Promise<{ externoId: string }> {
    const resposta = await this.http.chamar<unknown>(
      ctx.config.evolutionUrl,
      '/send/text',
      {
        metodo: 'POST',
        credencial: this.chaveInstancia(ctx),
        corpo: {
          number: this.destinatario(dados.jid),
          text: dados.texto,
          // Resposta citada existe e tem forma própria (`quoted.messageId`),
          // conferida no Swagger da 0.7.2 — não é o `quotedMessageId` plano
          // que a documentação sugeria.
          ...(dados.respondeuA
            ? { quoted: { messageId: dados.respondeuA } }
            : {}),
        },
      },
    );

    return { externoId: this.externoId(resposta) };
  }

  /**
   * Envia anexo.
   *
   * O ponto que mais destoa do worker: a rota recebe **`url`**, não bytes. O
   * arquivo aqui é upload do vendedor, em memória, e a plataforma não tem
   * endereço público para ele — servir um só para o gateway buscar exporia
   * anexo de conversa na internet. Por isso vai como `data:` URI, que é a
   * forma de entregar os bytes dentro do campo que a API oferece.
   *
   * **Não verificado contra um gateway em execução** (a 0.7.2 exige licença
   * ativada para responder qualquer rota). Se a versão homologada recusar o
   * `data:` URI, este é o ponto a mudar, e a alternativa é uma rota interna de
   * arquivo temporário alcançável só pela rede do Docker.
   */
  async enviarArquivo(
    ctx: ContextoSessao,
    dados: { jid: string; arquivo: ArquivoParaEnviar },
  ): Promise<{ externoId: string }> {
    const { arquivo } = dados;
    const resposta = await this.http.chamar<unknown>(
      ctx.config.evolutionUrl,
      '/send/media',
      {
        metodo: 'POST',
        credencial: this.chaveInstancia(ctx),
        corpo: {
          number: this.destinatario(dados.jid),
          // `image`/`video`/`audio`/`document` é a nomenclatura do gateway; o
          // tipo interno da plataforma é português e não pode vazar para cá.
          //
          // Áudio gravado na hora vira `ptt`, que é o que faz o WhatsApp
          // mostrar mensagem de voz em vez de anexo.
          type:
            arquivo.tipo === 'audio' && arquivo.ptt
              ? 'ptt'
              : this.tipoExterno(arquivo.tipo),
          url: `data:${arquivo.mime};base64,${arquivo.conteudoBase64}`,
          filename: arquivo.nome,
          caption: arquivo.legenda ?? undefined,
        },
      },
    );

    return { externoId: this.externoId(resposta) };
  }

  async marcarLida(
    ctx: ContextoSessao,
    dados: { jid: string; externoId: string },
  ): Promise<void> {
    await this.http.chamar(ctx.config.evolutionUrl, '/message/markread', {
      metodo: 'POST',
      credencial: this.chaveInstancia(ctx),
      // `id` é lista: o WhatsApp marca em lote, e é assim que a rota aceita.
      corpo: {
        number: this.destinatario(dados.jid),
        id: [dados.externoId],
      },
    });
  }

  async reagir(
    ctx: ContextoSessao,
    dados: {
      jid: string;
      alvoExternoId: string;
      alvoNosso: boolean;
      emoji: string;
    },
  ): Promise<void> {
    await this.http.chamar(ctx.config.evolutionUrl, '/message/react', {
      metodo: 'POST',
      credencial: this.chaveInstancia(ctx),
      corpo: {
        number: this.destinatario(dados.jid),
        id: dados.alvoExternoId,
        // `fromMe` é o que permite ao gateway localizar a mensagem reagida: a
        // chave dela inclui de que lado ela saiu.
        fromMe: dados.alvoNosso,
        // Emoji vazio remove a reação — mesma convenção do WhatsApp e do zapo.
        reaction: dados.emoji,
      },
    });
  }

  // ----------------------------------------------------------------------
  // Agenda
  // ----------------------------------------------------------------------

  async listarContatos(
    ctx: ContextoSessao,
    busca?: string,
  ): Promise<ContatoAparelho[]> {
    // A instância é identificada pela credencial no cabeçalho, não por
    // parâmetro: nenhuma rota de operação da 0.7.2 recebe `instanceId` no
    // corpo ou na query (só `/instance/delete/:instanceId`, que é
    // administrativa).
    const resposta = await this.http.chamar<unknown>(
      ctx.config.evolutionUrl,
      '/user/contacts',
      { credencial: this.chaveInstancia(ctx), aceitarAusente: true },
    );

    const termo = busca?.trim().toLowerCase();
    return (
      lista(resposta, 'contacts', 'data', 'result')
        .map((bruto) => this.paraContato(bruto))
        .filter((contato): contato is ContatoAparelho => contato !== null)
        // O filtro é aplicado aqui, e não delegado ao gateway, porque a rota não
        // documenta parâmetro de busca — e uma busca ignorada pelo servidor
        // devolveria a agenda inteira como se fosse o resultado.
        .filter(
          (contato) =>
            !termo ||
            (contato.nome ?? '').toLowerCase().includes(termo) ||
            (contato.telefone ?? '').includes(termo.replace(/\D/g, '')),
        )
    );
  }

  /**
   * Conversas que já existem no aparelho.
   *
   * **A Evolution GO 0.7.2 não tem essa rota.** Verifiquei a tabela de rotas do
   * serviço em execução (99 rotas): há `/group/list`, `/newsletter/list` e
   * `/instance/all`, mas nada que liste as conversas individuais do aparelho.
   * `/chat/history-sync` traz histórico, que é outra coisa.
   *
   * Devolve vazio, e não a agenda de contatos disfarçada de conversas — que
   * encheria a tela de gente com quem o vendedor nunca falou. Quem precisa
   * escolher alguém para iniciar conversa usa a agenda, que existe.
   *
   * A lista principal de atendimento não depende disto: ela é montada de
   * `whatsapp_conversas`, como sempre foi.
   */
  listarConversas(ctx: ContextoSessao): Promise<ContatoAparelho[]> {
    this.logger.debug(
      `Evolution GO não lista conversas do aparelho (sessão ${ctx.sessaoId}).`,
    );
    return Promise.resolve([]);
  }

  async obterFotoContato(
    ctx: ContextoSessao,
    jid: string,
  ): Promise<FotoContato | null> {
    // POST, não GET, e o corpo é `{number, preview}` — conferido no Swagger da
    // 0.7.2. `preview: false` pede a foto em tamanho cheio.
    const resposta = await this.http
      .chamar<unknown>(ctx.config.evolutionUrl, '/user/avatar', {
        metodo: 'POST',
        credencial: this.chaveInstancia(ctx),
        corpo: { number: this.destinatario(jid), preview: false },
        aceitarAusente: true,
      })
      .catch(() => null);
    if (!resposta) return null;

    // Algumas versões devolvem a imagem embutida; outras, só a URL dela no CDN
    // do WhatsApp. Só a primeira é aproveitada: buscar uma URL arbitrária
    // devolvida por um serviço é exatamente o desenho que vira SSRF, e foto de
    // contato não vale esse risco — a conversa fica com a inicial do nome.
    const base64 = texto(resposta, 'base64', 'picture', 'image', 'data');
    if (!base64) return null;

    return {
      conteudoBase64: base64.replace(/^data:[^;]+;base64,/, ''),
      mime: texto(resposta, 'mimetype', 'mime') ?? 'image/jpeg',
    };
  }

  /**
   * Refaz a agenda.
   *
   * O gateway mantém os contatos por conta própria e não expõe um "sincronizar
   * agenda": `/chat/history-sync` é sobre mensagens, e disparar isso ao clicar
   * em "Sincronizar agenda" traria conversa antiga sem que ninguém pedisse.
   * Então aqui o botão apenas não faz mal — a agenda é relida na próxima
   * consulta, que é o efeito que o vendedor espera ver.
   */
  sincronizarAgenda(ctx: ContextoSessao): Promise<void> {
    this.logger.debug(
      `Evolution GO mantém a agenda por conta própria (sessão ${ctx.sessaoId}).`,
    );
    return Promise.resolve();
  }

  /**
   * Pede ao gateway o histórico que o aparelho tem.
   *
   * O corpo real é `{count, messageInfo}` — **não** há parâmetro de dias, ao
   * contrário do worker, onde o recorte é por data. `count` é o número de
   * mensagens; a conversão usa uma estimativa grosseira por dia, e o recorte
   * fino continua sendo da API, que descarta o que não deve gravar.
   *
   * Devolve zero em `encontradas` porque aqui não há como saber o tamanho do
   * trabalho: o material chega depois, por eventos, e cada um passa pela mesma
   * regra de gravação das mensagens ao vivo. Informar um número inventado
   * seria pior que informar nenhum.
   */
  async importarHistorico(
    ctx: ContextoSessao,
    dias: number,
  ): Promise<{ encontradas: number; conversas: number }> {
    await this.http.chamar(ctx.config.evolutionUrl, '/chat/history-sync', {
      metodo: 'POST',
      credencial: this.chaveInstancia(ctx),
      corpo: { count: Math.min(Math.max(dias, 1) * 50, 5000) },
    });
    return { encontradas: 0, conversas: 0 };
  }

  // ----------------------------------------------------------------------
  // Mídia recebida (usada pelo webhook)
  // ----------------------------------------------------------------------

  /**
   * Baixa a mídia de uma mensagem recebida — **segundo passo**, e nunca o
   * primeiro.
   *
   * A ordem é a mesma do worker e é a regra de privacidade do módulo em
   * código: o webhook entrega só os metadados, a API decide se grava, e apenas
   * quando ela confirma é que os bytes são buscados. Mídia de contato sem
   * cliente vinculado nunca chega ao disco.
   *
   * O envelope original da mensagem é exigido pelo gateway para localizar as
   * chaves de decifragem — por isso ele vem do próprio webhook, e não de um
   * cache: guardá-lo criaria justamente o armazenamento paralelo que a regra
   * evita.
   */
  async baixarMidia(
    ctx: ContextoSessao,
    envelope: unknown,
  ): Promise<{ conteudoBase64: string; mime: string | null } | null> {
    // Rota **única** (`/message/downloadmedia`), conferida na tabela de rotas
    // da 0.7.2 — não existe uma por tipo de mídia, como a documentação sugeria.
    // O corpo é `{message: <envelope da mensagem>}`.
    const resposta = await this.http
      .chamar<unknown>(ctx.config.evolutionUrl, '/message/downloadmedia', {
        metodo: 'POST',
        credencial: this.chaveInstancia(ctx),
        corpo: { message: envelope },
        aceitarAusente: true,
      })
      .catch((erro: unknown) => {
        // Mídia que não baixa não pode derrubar o recebimento: a mensagem já
        // está gravada e a conversa precisa aparecer para o vendedor, mesmo
        // que o anexo fique faltando.
        this.logger.warn(
          `Falha ao baixar mídia da sessão ${ctx.sessaoId}: ` +
            `${erro instanceof Error ? erro.message : String(erro)}`,
        );
        return null;
      });
    if (!resposta) return null;

    const base64 = texto(resposta, 'base64', 'data', 'media', 'file');
    if (!base64) return null;

    return {
      conteudoBase64: base64.replace(/^data:[^;]+;base64,/, ''),
      mime: texto(resposta, 'mimetype', 'mime'),
    };
  }

  // ----------------------------------------------------------------------
  // Normalização
  // ----------------------------------------------------------------------

  /**
   * Id da mensagem enviada.
   *
   * Sem ele o envio **não pode ser dado como feito**: é o `externoId` que liga
   * a linha do histórico ao recibo de entrega e à reação que vier depois.
   * Gravar a mensagem com um id inventado a deixaria para sempre com um risco
   * só, sem jamais atualizar.
   */
  private externoId(resposta: unknown): string {
    const id = texto(
      resposta,
      'messageId',
      'key.id',
      'id',
      'message.key.id',
      'data.key.id',
      'data.messageId',
    );
    if (!id) {
      throw new BadGatewayException(
        'A Evolution GO não devolveu o identificador da mensagem enviada. ' +
          'Confira a versão homologada do gateway.',
      );
    }
    return id;
  }

  private traduzirStatus(bruto: string | null): EstadoPareamento['status'] {
    switch ((bruto ?? '').toLowerCase()) {
      case 'open':
      case 'connected':
      case 'online':
        return 'conectada';
      case 'connecting':
      case 'qrcode':
      case 'pairing':
      case 'scanning':
        return 'pareando';
      case 'banned':
      case 'blocked':
        return 'banida';
      default:
        return 'desconectada';
    }
  }

  private tipoExterno(tipo: ArquivoParaEnviar['tipo']): string {
    return tipo === 'imagem'
      ? 'image'
      : tipo === 'video'
        ? 'video'
        : tipo === 'audio'
          ? 'audio'
          : 'document';
  }

  /**
   * O campo `number` das rotas de mensagem.
   *
   * Manda o telefone quando dá para extraí-lo e o jid inteiro quando não dá —
   * que é o caso do `@lid`, onde os dígitos não são telefone de ninguém.
   * Reduzir tudo a dígitos ali faria a mensagem sair para outro contato.
   */
  private destinatario(jid: string): string {
    return this.somenteDigitos(jid) ?? jid;
  }

  private somenteDigitos(valor: string | null): string | null {
    if (!valor) return null;
    // JID `@lid` é opaco: os dígitos dele não são telefone de ninguém, e
    // tratá-los como número faria o casamento com o cadastro apontar para o
    // cliente errado.
    if (valor.includes('@lid')) return null;
    const digitos = valor.split('@')[0].split(':')[0].replace(/\D/g, '');
    return digitos || null;
  }

  private paraContato(bruto: unknown): ContatoAparelho | null {
    const jid =
      texto(bruto, 'jid', 'id', 'remoteJid', 'chatId', 'key.remoteJid') ?? null;
    if (!jid) return null;
    // Grupo não participa da agenda usada para vínculo de cliente — a mesma
    // regra do zapo.
    if (jid.endsWith('@g.us') || jid.includes('broadcast')) return null;

    const naoLidas = Number(
      texto(bruto, 'unreadCount', 'unread', 'naoLidas') ?? 0,
    );

    return {
      jid,
      nome:
        texto(bruto, 'name', 'pushName', 'notify', 'verifiedName', 'nome') ??
        null,
      telefone:
        this.somenteDigitos(texto(bruto, 'phone', 'number', 'telefone')) ??
        this.somenteDigitos(jid),
      naoLidas: Number.isFinite(naoLidas) ? naoLidas : 0,
    };
  }

  /** Exposto para o webhook normalizar o jid dos eventos do mesmo jeito. */
  telefoneDoJid(jid: string | null): string | null {
    return this.somenteDigitos(jid);
  }

  /** Exposto para o webhook — mesma tradução de estado dos eventos de conexão. */
  estadoDeEvento(bruto: string | null): EstadoPareamento['status'] {
    return this.traduzirStatus(bruto);
  }
}
