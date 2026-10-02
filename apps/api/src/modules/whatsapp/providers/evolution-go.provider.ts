import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { WhatsappTransporte } from '@plataforma/contracts';
import {
  EvolutionGoClient,
  EvolutionGoErroHttp,
  lista,
  objeto,
  texto,
} from './evolution-go.client';
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
   * Nome técnico da instância: `<empresa>-<código do vendedor>-<nome>-<id>`,
   * por exemplo `rcg-distribuidora-000123-marcos-276fc417`. Na sessão da
   * empresa, `<empresa>-institucional-<id>`.
   *
   * Legível de propósito: o gateway tem painel próprio, e ali só o id não diz
   * de quem é o aparelho — quem administra teria de abrir a plataforma e
   * cruzar à mão para saber qual está derrubado. O `id` no fim são os 8
   * primeiros caracteres do `sessaoId`: com a empresa na frente, bastam para
   * não colidir no mesmo gateway, e o nome continua recalculável a partir da
   * sessão. Peça que faltar (vendedor sem código, empresa ilegível) é omitida.
   *
   * **Uma vez criada, o nome não é recalculado**: ele fica gravado em
   * `instanciaExterna` e é o que esta função devolve. Renomear a pessoa depois
   * não renomeia a instância — o nome é um rótulo do momento da criação, não
   * uma referência viva ao cadastro. Pelo mesmo motivo, instâncias criadas no
   * formato antigo (`rcg-<vendedor>-<sessaoId>`) mantêm o nome antigo.
   *
   * O risco que isso abre, e que foi aceito em 2026-09-21: se a linha local
   * perder o nome gravado **e** o vendedor tiver sido renomeado no intervalo,
   * o nome recalculado não bate com o que está no gateway e uma instância nova
   * é criada em vez de reaproveitar a antiga. É recuperável (apagar a órfã
   * pelo painel), ao contrário de perder mensagem.
   */
  private nomeInstancia(ctx: ContextoSessao): string {
    if (ctx.instancia.nome) return ctx.instancia.nome;
    const pecas = ctx.vendedorNome?.trim()
      ? [
          this.slug(ctx.empresaNome, 20),
          this.slug(ctx.vendedorCodigo, 12),
          this.slug(ctx.vendedorNome.trim().split(/\s+/)[0], 12),
        ]
      : [this.slug(ctx.empresaNome, 20), 'institucional'];
    pecas.push(ctx.sessaoId.replace(/-/g, '').slice(0, 8));
    return pecas.filter(Boolean).join('-');
  }

  /**
   * Pedaço de nome seguro para o gateway: minúsculo, sem acento, sem espaço e
   * curto — é identificador de instância num sistema de terceiro, e não há
   * garantia de que ele aceite o resto.
   */
  private slug(texto: string | null | undefined, limite: number): string {
    const bruto = texto ?? '';
    return (
      bruto
        .normalize('NFD')
        // `\p{Diacritic}` em vez da faixa `̀-ͯ`: o formatador
        // transforma aquela nos próprios caracteres combinantes, que são
        // invisíveis no fonte e ninguém consegue revisar depois.
        .replace(/\p{Diacritic}/gu, '')
        // Minúsculo antes de filtrar: os cadastros vêm do ERP em CAIXA ALTA, e
        // sem isto o nome inteiro virava traço (era o `rcg-vendedor-…`).
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, limite)
        .replace(/-+$/g, '')
    );
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
    return ctx.config.evolutionApiKey?.trim() || null;
  }

  /**
   * Credencial de operação. O token da instância retornado pelo gateway.
   * Não usar a chave administrativa como retaguarda: as rotas de operação
   * da Evolution GO buscam a instância pelo token no cabeçalho `apikey`;
   * a chave global não é token de instância e causa 401 not authorized.
   */
  private chaveInstancia(ctx: ContextoSessao): string | null {
    return ctx.instancia.token?.trim() || null;
  }

  /** Identificador aceito pelas rotas de operação. */
  private idInstancia(ctx: ContextoSessao): string {
    return ctx.instancia.id ?? this.nomeInstancia(ctx);
  }

  /**
   * Testa conectividade com o gateway e valida a chave administrativa (GLOBAL_API_KEY).
   */
  async testarGateway(
    url: string,
    chaveAdmin: string,
  ): Promise<{ ok: boolean; mensagem: string; totalInstancias: number }> {
    const adminKey = chaveAdmin.trim();
    if (!url) {
      throw new BadGatewayException('Endereço da Evolution GO não informado.');
    }
    if (!adminKey) {
      throw new BadGatewayException(
        'Chave de API (GLOBAL_API_KEY) não informada.',
      );
    }

    // 1. Testa conectividade básica
    try {
      await this.http.chamar<unknown>(url, '/server/ok', {
        aceitarAusente: false,
      });
    } catch (erro) {
      throw new BadGatewayException(
        `Não foi possível alcançar a Evolution GO em ${url}. Verifique se o endereço está correto e o serviço está no ar (${erro instanceof Error ? erro.message : String(erro)}).`,
      );
    }

    // 2. Testa autenticação da chave administrativa
    try {
      const resp = await this.http.chamar<any>(url, '/instance/all', {
        credencial: adminKey,
      });
      const lista = (Array.isArray(resp) ? resp : (resp?.data ?? [])) as any[];
      return {
        ok: true,
        mensagem:
          'Conexão e chave administrativa validadas com sucesso na Evolution GO.',
        totalInstancias: lista.length,
      };
    } catch (erro) {
      if (erro instanceof EvolutionGoErroHttp && erro.httpStatus === 401) {
        throw new BadGatewayException(
          'A Evolution GO recusou a autenticação (401: not authorized). ' +
            'A Chave de API informada não confere com a GLOBAL_API_KEY configurada no servidor da Evolution GO.',
        );
      }
      throw erro;
    }
  }

  /**
   * `advancedSettings` como o gateway os espera.
   *
   * Vêm da configuração da empresa e valem para **toda** instância dela —
   * vendedor, gerente, supervisor e o número institucional. A regra é de
   * atendimento, não do aparelho: não faria sentido um vendedor ignorar grupos
   * e o outro não.
   */
  private configuracoesAvancadas(ctx: ContextoSessao) {
    return {
      alwaysOnline: ctx.config.evolutionAlwaysOnline,
      ignoreGroups: ctx.config.evolutionIgnoreGroups,
      ignoreStatus: ctx.config.evolutionIgnoreStatus,
      readMessages: ctx.config.evolutionReadMessages,
      rejectCall: ctx.config.evolutionRejectCall,
      // O gateway espera string; nulo aqui é "recusar sem responder nada".
      msgRejectCall: ctx.config.evolutionMsgRejectCall ?? '',
    };
  }

  /**
   * Empurra as configurações para uma instância que **já existe**.
   *
   * Roda a cada `iniciar`, e não só na criação: é o que faz uma alteração na
   * tela alcançar as instâncias antigas. Sem isto, mudar a política valeria só
   * para quem parear depois — que é justamente o que motivou tirar esses
   * valores do código.
   *
   * Melhor-esforço de propósito: a configuração é preferência de atendimento,
   * e falhar aqui não pode impedir o vendedor de conectar. O motivo vai ao log
   * porque o sintoma, sem ele, seria uma opção da tela que simplesmente não
   * surte efeito.
   */
  private async aplicarConfiguracoes(ctx: ContextoSessao): Promise<void> {
    try {
      await this.http.chamar<unknown>(
        ctx.config.evolutionUrl,
        `/instance/${encodeURIComponent(this.idInstancia(ctx))}/advanced-settings`,
        {
          metodo: 'PUT',
          credencial: this.chaveInstancia(ctx),
          corpo: this.configuracoesAvancadas(ctx),
        },
      );
    } catch (erro) {
      this.logger.warn(
        `Não consegui aplicar as configurações avançadas em ${this.nomeInstancia(ctx)}: ` +
          `${erro instanceof Error ? erro.message : String(erro)}`,
      );
    }
  }

  async iniciar(
    ctx: ContextoSessao,
    opcoes: { arquivarMensagens: boolean },
  ): Promise<DadosInstancia | null> {
    const url = ctx.config.evolutionUrl;
    const adminKey = this.chaveAdmin(ctx);
    if (!adminKey) {
      throw new BadGatewayException(
        'A Chave de API administrativa (GLOBAL_API_KEY) da Evolution GO não está configurada em Administração > WhatsApp.',
      );
    }

    const nome = this.nomeInstancia(ctx);
    let token = ctx.instancia.token ?? randomBytes(32).toString('hex');
    const webhookSegredo =
      ctx.instancia.webhookSegredo ?? randomBytes(32).toString('hex');
    let instanciaId = ctx.instancia.id;

    // 1. Verifica no gateway se a instância já existe de fato
    let existenteNoGateway: { id?: string; name?: string; token?: string } | null = null;
    try {
      const resp = await this.http.chamar<any>(url, '/instance/all', {
        credencial: adminKey,
      });
      const lista = (Array.isArray(resp) ? resp : (resp?.data ?? [])) as any[];
      existenteNoGateway =
        lista.find((item: any) => item?.name === nome) ?? null;
    } catch (erro) {
      if (erro instanceof EvolutionGoErroHttp && erro.httpStatus === 401) {
        throw new BadGatewayException(
          'A Evolution GO recusou a chave administrativa (401: not authorized). ' +
            'Verifique se a Chave de API (GLOBAL_API_KEY) configurada em Administração > WhatsApp confere com o servidor.',
        );
      }
      this.logger.warn(
        `Não foi possível verificar instâncias existentes no gateway (${erro instanceof Error ? erro.message : String(erro)}). ` +
          'Prosseguindo com criação/reconexão.',
      );
    }

    if (existenteNoGateway) {
      instanciaId = existenteNoGateway.id ?? instanciaId;
      if (existenteNoGateway.token) {
        token = existenteNoGateway.token;
      }
      await this.aplicarConfiguracoes({
        ...ctx,
        instancia: { ...ctx.instancia, id: instanciaId, token },
      });
    } else {
      // Cria a instância no gateway
      try {
        const criada = await this.http.chamar<unknown>(url, '/instance/create', {
          metodo: 'POST',
          credencial: adminKey,
          corpo: {
            name: nome,
            token,
            advancedSettings: this.configuracoesAvancadas(ctx),
          },
        });
        const dadosCriada = objeto(criada, 'data') ?? criada;
        instanciaId =
          texto(dadosCriada, 'id', 'instanceId', 'instance_id', 'instance.id') ??
          instanciaId;
      } catch (erro) {
        const corpo =
          erro instanceof EvolutionGoErroHttp ? erro.corpo.toLowerCase() : '';
        const detalhe =
          erro instanceof EvolutionGoErroHttp
            ? (erro.detalhe ?? '').toLowerCase()
            : '';
        const ehDuplicada =
          corpo.includes('already exists') ||
          corpo.includes('duplicate') ||
          corpo.includes('já existe') ||
          detalhe.includes('already exists') ||
          (erro instanceof EvolutionGoErroHttp &&
            (erro.httpStatus === 400 ||
              erro.httpStatus === 409 ||
              erro.httpStatus === 500));

        if (ehDuplicada) {
          this.logger.warn(
            `Instância ${nome} já constava no gateway. Buscando UUID real para limpeza...`,
          );
          const all = await this.http
            .chamar<any>(url, '/instance/all', { credencial: adminKey })
            .catch(() => null);
          const lista = (Array.isArray(all) ? all : (all?.data ?? [])) as any[];
          const achada = lista.find((item: any) => item?.name === nome);
          if (achada?.id) {
            await this.http
              .chamar(url, `/instance/delete/${encodeURIComponent(achada.id)}`, {
                metodo: 'DELETE',
                credencial: adminKey,
                aceitarAusente: true,
              })
              .catch(() => undefined);
          }
          const recriada = await this.http.chamar<unknown>(
            url,
            '/instance/create',
            {
              metodo: 'POST',
              credencial: adminKey,
              corpo: {
                name: nome,
                token,
                advancedSettings: this.configuracoesAvancadas(ctx),
              },
            },
          );
          const dadosRecriada = objeto(recriada, 'data') ?? recriada;
          instanciaId =
            texto(
              dadosRecriada,
              'id',
              'instanceId',
              'instance_id',
              'instance.id',
            ) ?? instanciaId;
        } else {
          throw erro;
        }
      }
    }

    if (opcoes.arquivarMensagens) {
      this.logger.debug(
        `Sessão ${ctx.sessaoId} conectada com histórico habilitado.`,
      );
    }

    try {
      await this.http.chamar(url, '/instance/connect', {
        metodo: 'POST',
        credencial: token,
        corpo: {
          webhookUrl: this.urlWebhook(ctx, webhookSegredo),
          subscribe: [...EVENTOS],
        },
      });
    } catch (erro) {
      const idParaRemover = existenteNoGateway?.id ?? ctx.instancia.id;
      const ehErro401 =
        (erro instanceof EvolutionGoErroHttp && erro.httpStatus === 401) ||
        (erro instanceof Error && erro.message.includes('401'));

      if (ehErro401 && idParaRemover) {
        this.logger.warn(
          `Connect falhou com 401 para ${nome}. Removendo instância antiga e recriando com token novo...`,
        );
        await this.http
          .chamar(
            url,
            `/instance/delete/${encodeURIComponent(idParaRemover)}`,
            {
              metodo: 'DELETE',
              credencial: adminKey,
              aceitarAusente: true,
            },
          )
          .catch(() => undefined);

        token = randomBytes(32).toString('hex');
        const nova = await this.http.chamar<unknown>(url, '/instance/create', {
          metodo: 'POST',
          credencial: adminKey,
          corpo: {
            name: nome,
            token,
            advancedSettings: this.configuracoesAvancadas(ctx),
          },
        });
        const dadosNova = objeto(nova, 'data') ?? nova;
        instanciaId =
          texto(dadosNova, 'id', 'instanceId', 'instance_id', 'instance.id') ??
          instanciaId;
        token = texto(dadosNova, 'token', 'instance.token') ?? token;

        await this.http.chamar(url, '/instance/connect', {
          metodo: 'POST',
          credencial: token,
          corpo: {
            webhookUrl: this.urlWebhook(ctx, webhookSegredo),
            subscribe: [...EVENTOS],
          },
        });
      } else {
        throw erro;
      }
    }

    return { nome, id: instanciaId, token, webhookSegredo };
  }

  async pareamento(ctx: ContextoSessao): Promise<EstadoPareamento> {
    const url = ctx.config.evolutionUrl;
    let token = this.chaveInstancia(ctx);

    // Se a instância não tem token gravado localmente, tenta resgatar de /instance/all
    if (!token) {
      const adminKey = this.chaveAdmin(ctx);
      if (adminKey) {
        try {
          const resp = await this.http.chamar<any>(url, '/instance/all', {
            credencial: adminKey,
            aceitarAusente: true,
          });
          const lista = (Array.isArray(resp) ? resp : (resp?.data ?? [])) as any[];
          const nome = this.nomeInstancia(ctx);
          const achada = lista.find((i: any) => i?.name === nome);
          if (achada?.token) {
            token = achada.token;
          }
        } catch {
          // ignora
        }
      }
    }

    if (!token) {
      return {
        status: 'desconectada',
        qr: null,
        numero: null,
        erro: 'A instância ainda não possui token registrado no gateway. Clique em "Recomeçar pareamento" para conectar.',
      };
    }

    let estado: unknown = null;
    let erroStatus: string | null = null;
    try {
      estado = await this.http.chamar<unknown>(url, '/instance/status', {
        credencial: token,
        aceitarAusente: true,
      });
    } catch (erro) {
      if (erro instanceof EvolutionGoErroHttp && erro.httpStatus === 401) {
        return {
          status: 'desconectada',
          qr: null,
          numero: null,
          erro: 'A Evolution GO não autorizou o token desta instância (401: not authorized). ' +
            'Clique em "Recomeçar pareamento" para renovar a conexão.',
        };
      }
      erroStatus = erro instanceof Error ? erro.message : String(erro);
    }

    const dadosEstado = objeto(estado, 'data') ?? estado;
    const status = erroStatus ? 'desconectada' : this.statusDoEstado(dadosEstado);
    const numero = this.somenteDigitos(
      texto(
        dadosEstado,
        'number',
        'phone',
        'owner',
        'instance.owner',
        'jid',
        'Jid',
        'myJid',
      ),
    );

    let qr: string | null = null;
    let motivoQr: string | null = null;

    if (status === 'pareando' || status === 'desconectada') {
      const resposta = await this.http
        .chamar<unknown>(url, '/instance/qr', {
          credencial: token,
          aceitarAusente: true,
        })
        .catch((erro: unknown) => {
          if (erro instanceof EvolutionGoErroHttp && erro.httpStatus === 401) {
            motivoQr =
              'A Evolution GO recusou a busca do QR Code (401: not authorized). ' +
              'Clique em "Recomeçar pareamento".';
          } else {
            motivoQr = erro instanceof Error ? erro.message : String(erro);
          }
          this.logger.error(
            `Falha ao buscar o QR da instância ${this.nomeInstancia(ctx)}: ${motivoQr}`,
          );
          return null;
        });

      const dadosQr = objeto(resposta, 'data') ?? resposta;
      qr =
        texto(
          dadosQr,
          'Code',
          'code',
          'qrcode.code',
          'Qrcode',
          'qrcode',
          'qr',
          'base64',
        ) ?? null;

      if (!qr && !motivoQr) {
        motivoQr =
          'O gateway respondeu sem QR Code em nenhum campo conhecido ' +
          '(qrcode, qr, code, base64). Confira a versão homologada em ' +
          'EVOLUTION_GO_IMAGE.';
        this.logger.warn(
          `QR ausente na resposta da instância ${this.nomeInstancia(ctx)}`,
        );
      }
    }

    return {
      status: status === 'desconectada' && qr ? 'pareando' : status,
      qr,
      numero,
      erro: texto(dadosEstado, 'error', 'lastError') ?? motivoQr ?? erroStatus,
    };
  }

  async desconectar(ctx: ContextoSessao): Promise<void> {
    const token = this.chaveInstancia(ctx);
    if (!token) return;
    await this.http.chamar(ctx.config.evolutionUrl, '/instance/disconnect', {
      metodo: 'POST',
      credencial: token,
      aceitarAusente: true,
    });
  }

  /**
   * Sai do WhatsApp: o aparelho some de "Aparelhos conectados" e a credencial
   * pareada morre. A instância continua existindo no gateway, pronta para um
   * novo QR.
   */
  async sairDoWhatsapp(ctx: ContextoSessao): Promise<void> {
    const token = this.chaveInstancia(ctx);
    if (!token) return;
    await this.http.chamar(ctx.config.evolutionUrl, '/instance/logout', {
      metodo: 'DELETE',
      credencial: token,
      aceitarAusente: true,
    });
  }

  /**
   * Logout e exclusão da instância.
   */
  async removerInstancia(ctx: ContextoSessao): Promise<void> {
    const adminKey = this.chaveAdmin(ctx);
    let id = ctx.instancia.id;

    if (!id || !id.includes('-')) {
      const nome = this.nomeInstancia(ctx);
      if (adminKey) {
        try {
          const resp = await this.http.chamar<any>(
            ctx.config.evolutionUrl,
            '/instance/all',
            {
              credencial: adminKey,
              aceitarAusente: true,
            },
          );
          const lista = (Array.isArray(resp) ? resp : (resp?.data ?? [])) as any[];
          const achada = lista.find((item: any) => item?.name === nome);
          if (achada?.id) {
            id = achada.id;
          }
        } catch {
          // ignora
        }
      }
    }

    const idParaDeletar = id ?? this.idInstancia(ctx);

    await this.sairDoWhatsapp(ctx).catch((erro: unknown) => {
      this.logger.warn(
        `logout da instância ${idParaDeletar} falhou, seguindo para o delete: ` +
          `${erro instanceof Error ? erro.message : String(erro)}`,
      );
    });

    if (adminKey) {
      await this.http
        .chamar(
          ctx.config.evolutionUrl,
          `/instance/delete/${encodeURIComponent(idParaDeletar)}`,
          {
            metodo: 'DELETE',
            credencial: adminKey,
            aceitarAusente: true,
          },
        )
        .catch((erro) => {
          this.logger.warn(
            `delete da instância ${idParaDeletar} falhou (${erro instanceof Error ? erro.message : String(erro)})`,
          );
        });
    }
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

  /**
   * Status a partir do corpo de `/instance/status`. A 0.7.x devolve booleanos
   * (`Connected`, `LoggedIn`), não um texto de estado: `Connected` sem
   * `LoggedIn` é o socket de pé esperando a leitura do QR.
   */
  private statusDoEstado(dados: unknown): EstadoPareamento['status'] {
    if (dados && typeof dados === 'object') {
      const d = dados as Record<string, unknown>;
      const logado = d.LoggedIn ?? d.loggedIn;
      const conectado = d.Connected ?? d.connected;
      if (typeof logado === 'boolean' || typeof conectado === 'boolean') {
        if (logado === true) return 'conectada';
        return conectado === true ? 'pareando' : 'desconectada';
      }
    }
    return this.traduzirStatus(
      texto(dados, 'state', 'status', 'connection', 'instance.state'),
    );
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
