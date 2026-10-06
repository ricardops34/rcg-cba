import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type {
  WhatsappInterativo,
  WhatsappTransporte,
} from '@plataforma/contracts';
import {
  EvolutionGoClient,
  EvolutionGoErroHttp,
  lista,
  objeto,
  texto,
} from './evolution-go.client';
import type {
  AncoraHistorico,
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

    // Falha ao **consultar** não é desconexão. Devolver `desconectada` aqui
    // fazia o chamador gravar isso no banco — e em 2026-10-05, com o Postgres
    // do gateway sem conexões livres (500, e 401 porque a busca do token
    // falhava), a sessão ficou "desconectada" na tela enquanto as mensagens
    // continuavam chegando pelo webhook. Estourar mantém o status gravado e
    // mostra o motivo de verdade.
    let estado: unknown = null;
    try {
      estado = await this.http.chamar<unknown>(url, '/instance/status', {
        credencial: token,
        aceitarAusente: true,
      });
    } catch (erro) {
      if (erro instanceof EvolutionGoErroHttp && erro.httpStatus === 401) {
        throw new BadGatewayException(
          'A Evolution GO não autorizou o token desta instância (401: not authorized). ' +
            'Se o "Testar conexão com o Gateway" também falha, o problema é o gateway; ' +
            'senão, clique em "Recomeçar pareamento" para renovar a conexão.',
        );
      }
      throw erro;
    }

    const dadosEstado = objeto(estado, 'data') ?? estado;
    const status = this.statusDoEstado(dadosEstado);
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
    // Logo depois do `/instance/connect` o gateway ainda não gerou o QR e
    // responde 400 "no QR code available". Não é falha: a tela consulta de
    // novo e o QR chega em segundos — mostrar erro vermelho nesse intervalo
    // levava o vendedor a recomeçar o pareamento à toa.
    let qrAindaGerando = false;

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
          } else if (
            erro instanceof EvolutionGoErroHttp &&
            erro.httpStatus === 400 &&
            `${erro.corpo} ${erro.detalhe ?? ''}`
              .toLowerCase()
              .includes('no qr code')
          ) {
            qrAindaGerando = true;
            return null;
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

      if (!qr && !motivoQr && !qrAindaGerando) {
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
      // Sem o `qrAindaGerando` aqui, a primeira consulta depois do connect
      // gravava a sessão como desconectada, a tela parava de consultar (só
      // consulta em `pareando`) e o QR nunca chegava a aparecer.
      status:
        status === 'desconectada' && (qr || qrAindaGerando) ? 'pareando' : status,
      qr,
      numero,
      erro: texto(dadosEstado, 'error', 'lastError') ?? motivoQr,
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
   * Envia anexo por **multipart** (`file`), o caminho de bytes da 0.7.2
   * (`send_handler.go`, `SendMedia`). O JSON da mesma rota só aceita `url`,
   * que o gateway baixa por HTTP — o anexo do vendedor não tem endereço
   * público, e a versão anterior mandava `data:` URI, que essa busca não lê.
   *
   * `type` é `image`/`video`/`audio`/`document` e nada mais: qualquer outro
   * valor volta "invalid media type". Era o caso do `ptt` que mandávamos para
   * o áudio gravado — a 0.7.2 já converte **todo** `audio` em mensagem de voz
   * (Opus, `PTT: true`), então não há tipo próprio para isso.
   */
  async enviarArquivo(
    ctx: ContextoSessao,
    dados: { jid: string; arquivo: ArquivoParaEnviar },
  ): Promise<{ externoId: string }> {
    const { arquivo } = dados;
    const corpo = new FormData();
    corpo.set('number', this.destinatario(dados.jid));
    corpo.set('type', this.tipoExterno(arquivo.tipo));
    corpo.set('filename', arquivo.nome);
    // Legenda vazia não vai: o gateway a gravaria como `caption: ""`.
    if (arquivo.legenda) corpo.set('caption', arquivo.legenda);
    corpo.set(
      'file',
      new Blob([Buffer.from(arquivo.conteudoBase64, 'base64')], {
        type: arquivo.mime,
      }),
      arquivo.nome,
    );

    const resposta = await this.http.chamar<unknown>(
      ctx.config.evolutionUrl,
      '/send/media',
      {
        metodo: 'POST',
        credencial: this.chaveInstancia(ctx),
        corpo,
        // Áudio passa por conversão no gateway (ffmpeg) antes de subir.
        timeoutMs: 120_000,
      },
    );

    return { externoId: this.externoId(resposta) };
  }

  /**
   * Mensagens interativas — uma rota por tipo, com os nomes de campo da 0.7.2
   * (`send_service.go`: `ButtonStruct`, `ListStruct`, `PollStruct`,
   * `LocationStruct`, `ContactStruct`, `LinkStruct`). O contrato da
   * plataforma é português e não vaza para cá; as regras de combinação já
   * foram barradas no `whatsappInterativoSchema`.
   */
  async enviarInterativo(
    ctx: ContextoSessao,
    dados: {
      jid: string;
      mensagem: WhatsappInterativo;
      respondeuA?: string | null;
    },
  ): Promise<{ externoId: string }> {
    const { rota, corpo } = this.corpoInterativo(dados.mensagem);
    const resposta = await this.http.chamar<unknown>(
      ctx.config.evolutionUrl,
      rota,
      {
        metodo: 'POST',
        credencial: this.chaveInstancia(ctx),
        corpo: {
          number: this.destinatario(dados.jid),
          ...corpo,
          // Botões e lista não têm `quoted` no Swagger da 0.7.2 (só no guia);
          // mandar não quebra, e a citação aparece onde o gateway a suporta.
          ...(dados.respondeuA
            ? { quoted: { messageId: dados.respondeuA } }
            : {}),
        },
      },
    );
    return { externoId: this.externoId(resposta) };
  }

  /**
   * `/message/edit` recebe o **jid** do chat (`chat`), não o `number` das
   * rotas de envio. A 0.7.2 corrigiu a edição que era ignorada (passou a
   * mandar `ExtendedTextMessage`, CHANGELOG #16) — antes dela o WhatsApp
   * descartava a edição sem erro nenhum.
   */
  async editarMensagem(
    ctx: ContextoSessao,
    dados: { jid: string; externoId: string; texto: string },
  ): Promise<void> {
    await this.http.chamar(ctx.config.evolutionUrl, '/message/edit', {
      metodo: 'POST',
      credencial: this.chaveInstancia(ctx),
      corpo: {
        chat: dados.jid,
        messageId: dados.externoId,
        message: dados.texto,
      },
    });
  }

  async apagarMensagem(
    ctx: ContextoSessao,
    dados: { jid: string; externoId: string },
  ): Promise<void> {
    await this.http.chamar(ctx.config.evolutionUrl, '/message/delete', {
      metodo: 'POST',
      credencial: this.chaveInstancia(ctx),
      corpo: { chat: dados.jid, messageId: dados.externoId },
    });
  }

  /**
   * Gravando áudio é `composing` com `isAudio: true` (o guia da 0.7.2 lista
   * `recording`, mas é o par composing+isAudio que o handler converte).
   */
  async presenca(
    ctx: ContextoSessao,
    dados: { jid: string; estado: 'digitando' | 'gravando' | 'parou' },
  ): Promise<void> {
    await this.http.chamar(ctx.config.evolutionUrl, '/message/presence', {
      metodo: 'POST',
      credencial: this.chaveInstancia(ctx),
      corpo: {
        number: this.destinatario(dados.jid),
        state: dados.estado === 'parou' ? 'paused' : 'composing',
        isAudio: dados.estado === 'gravando',
      },
      timeoutMs: 5000,
    });
  }

  /**
   * `GET /polls/{id}/results` da 0.7.2 (`poll_handler.go`). O voto chega
   * **cifrado** no webhook; quem o decifra e grava é o gateway, de forma
   * assíncrona — por isso a leitura é feita aqui, depois, e não do evento.
   * Enquete sem voto ainda volta 404: lista vazia.
   */
  async resultadosEnquete(
    ctx: ContextoSessao,
    enqueteExternoId: string,
  ): Promise<
    {
      nome: string | null;
      telefone: string | null;
      opcoesHash: string[];
      votadoEm: string | null;
    }[]
  > {
    const resposta = await this.http.chamar<unknown>(
      ctx.config.evolutionUrl,
      `/polls/${encodeURIComponent(enqueteExternoId)}/results`,
      { credencial: this.chaveInstancia(ctx), aceitarAusente: true },
    );
    const dados = objeto(resposta, 'data') ?? resposta;
    return lista(dados, 'voters', 'Voters').map((v) => ({
      nome: texto(v, 'name', 'voterName'),
      telefone: texto(v, 'phone', 'voterPhone'),
      opcoesHash: lista(v, 'selectedOptions')
        .map((o) => (typeof o === 'string' ? o : null))
        .filter((o): o is string => Boolean(o)),
      votadoEm: texto(v, 'votedAt'),
    }));
  }

  /** Traduz o contrato da plataforma para a rota e o corpo da Evolution GO. */
  private corpoInterativo(m: WhatsappInterativo): {
    rota: string;
    corpo: Record<string, unknown>;
  } {
    switch (m.tipo) {
      case 'botoes':
        return {
          rota: '/send/button',
          corpo: {
            ...(m.titulo ? { title: m.titulo } : {}),
            description: m.texto,
            // Rodapé vazio quebra a renderização: ou tem texto, ou não vai.
            ...(m.rodape ? { footer: m.rodape } : {}),
            buttons: m.botoes.map((b) => {
              switch (b.tipo) {
                case 'resposta':
                  return { type: 'reply', displayText: b.texto, id: b.id };
                case 'url':
                  return { type: 'url', displayText: b.texto, url: b.url };
                case 'ligar':
                  return {
                    type: 'call',
                    displayText: b.texto,
                    phoneNumber: b.telefone,
                  };
                case 'copiar':
                  return {
                    type: 'copy',
                    displayText: b.texto,
                    copyCode: b.codigo,
                  };
                case 'pix':
                  return {
                    type: 'pix',
                    currency: 'BRL',
                    name: b.nome,
                    keyType: b.tipoChave,
                    key: b.chave,
                  };
              }
            }),
          },
        };
      case 'lista':
        return {
          rota: '/send/list',
          corpo: {
            ...(m.titulo ? { title: m.titulo } : {}),
            description: m.texto,
            buttonText: m.textoBotao,
            ...(m.rodape ? { footerText: m.rodape } : {}),
            sections: m.secoes.map((s) => ({
              title: s.titulo,
              rows: s.linhas.map((l) => ({
                title: l.titulo,
                ...(l.descricao ? { description: l.descricao } : {}),
                rowId: l.id,
              })),
            })),
          },
        };
      case 'enquete':
        return {
          rota: '/send/poll',
          corpo: {
            question: m.pergunta,
            options: m.opcoes,
            maxAnswer: m.maxRespostas,
          },
        };
      case 'localizacao':
        return {
          rota: '/send/location',
          corpo: {
            name: m.nome,
            address: m.endereco,
            latitude: m.latitude,
            longitude: m.longitude,
          },
        };
      case 'contato':
        return {
          rota: '/send/contact',
          corpo: {
            vcard: {
              fullName: m.nome,
              phone: m.telefone.replace(/\D/g, ''),
              ...(m.empresa ? { organization: m.empresa } : {}),
            },
          },
        };
      case 'link':
        // A prévia (título, descrição, imagem) o próprio gateway busca a
        // partir do primeiro endereço do texto.
        return { rota: '/send/link', corpo: { text: m.texto } };
    }
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
    telefone?: string | null,
  ): Promise<FotoContato | null> {
    // Identificadores candidatos para localizar o avatar na Evolution GO.
    //
    // Sempre JID completo, nunca o número puro: o `CreateJID` da 0.7.2
    // prefixa "+" em número solto (`+5567…@s.whatsapp.net`), a consulta de
    // foto vai ao WhatsApp sem normalização e morre em "info query timed out"
    // — 15 s no gateway, e a chamada inteira presa por mais de um minuto
    // (visto em 2026-10-06). Com o JID, a mesma consulta volta em 0,3 s.
    const candidatos: string[] = [];
    if (jid) candidatos.push(jid);
    const telDigitos = telefone ? telefone.replace(/\D/g, '') : null;
    const jidTelefone = telDigitos ? `${telDigitos}@s.whatsapp.net` : null;
    if (jidTelefone && !candidatos.includes(jidTelefone)) {
      candidatos.push(jidTelefone);
    }

    for (const num of candidatos) {
      // POST, não GET, e o corpo é `{number, preview}` — conferido no Swagger da 0.7.2
      const resposta = await this.http
        .chamar<unknown>(ctx.config.evolutionUrl, '/user/avatar', {
          metodo: 'POST',
          credencial: this.chaveInstancia(ctx),
          corpo: { number: num, preview: false },
          aceitarAusente: true,
          timeoutMs: 4000,
        })
        .catch(() => null);

      if (resposta) {
        // A 0.7.2 embrulha em `data` o `ProfilePictureInfo` do whatsmeow:
        // `{ data: { URL, ID, Type, DirectPath } }` — a foto vem como URL
        // pública do WhatsApp, não em base64. Ler só o topo descartava a foto.
        const dados = objeto(resposta, 'data') ?? resposta;
        let base64 = texto(dados, 'base64');
        if (!base64 && typeof dados === 'object' && dados !== null) {
          const possivel = texto(dados, 'picture', 'image');
          if (possivel && possivel.length > 200 && !possivel.startsWith('http')) {
            base64 = possivel;
          }
        }

        if (base64) {
          return {
            conteudoBase64: base64.replace(/^data:[^;]+;base64,/, ''),
            mime: texto(dados, 'mimetype', 'mime') ?? 'image/jpeg',
          };
        }

        const url = texto(dados, 'URL', 'profilePictureUrl', 'picture', 'image');
        if (url && url.startsWith('http')) {
          try {
            const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
            if (res.ok) {
              const buffer = await res.arrayBuffer();
              const mime = res.headers.get('content-type') ?? 'image/jpeg';
              return {
                conteudoBase64: Buffer.from(buffer).toString('base64'),
                mime,
              };
            }
          } catch {
            // Falha no download da URL da foto ignorada com segurança
          }
        }
      }
    }

    return null;
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
   * Pede ao aparelho o histórico de cada conversa.
   *
   * Na 0.7.2 `/chat/history-sync` é o pedido **sob demanda** do whatsmeow
   * (`BuildHistorySyncRequest`, `chat_service.go`): "N mensagens anteriores a
   * esta", **por conversa**, ancorado numa mensagem que já temos —
   * `{ messageInfo: { Chat, ID, IsFromMe, Timestamp }, count }`. A versão
   * anterior mandava só `{ count }`, sem conversa nem âncora, e nada voltava.
   *
   * O material chega depois, como evento `HistorySync` no webhook, e o recorte
   * pelos dias de histórico é feito lá. `count` fica em 50, o lote que o
   * aparelho atende por pedido; conversa mais longa pede de novo a partir da
   * nova mensagem mais antiga.
   *
   * Conversa sem nenhuma mensagem gravada não tem âncora: o histórico dela só
   * vem na sincronização automática do pareamento.
   */
  async importarHistorico(
    ctx: ContextoSessao,
    _dias: number,
    ancoras: AncoraHistorico[],
  ): Promise<{ encontradas: number; conversas: number }> {
    let pedidas = 0;
    for (const ancora of ancoras) {
      try {
        await this.http.chamar(ctx.config.evolutionUrl, '/chat/history-sync', {
          metodo: 'POST',
          credencial: this.chaveInstancia(ctx),
          corpo: {
            count: 50,
            messageInfo: {
              Chat: ancora.jid,
              ID: ancora.externoId,
              IsFromMe: ancora.minha,
              IsGroup: false,
              Timestamp: ancora.criadaEm.toISOString(),
            },
          },
        });
        pedidas += 1;
      } catch (erro) {
        this.logger.warn(
          `Histórico sob demanda recusado para ${ancora.jid}: ` +
            `${erro instanceof Error ? erro.message : String(erro)}`,
        );
      }
    }
    return { encontradas: 0, conversas: pedidas };
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
    // O corpo é `{message: <waE2E.Message>}` — o conteúdo com `imageMessage`,
    // `audioMessage` etc. no primeiro nível (`DownloadMediaStruct`,
    // `message_service.go`). O evento inteiro (`Info`+`Message`) volta
    // "invalid media type".
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

    // A 0.7.2 responde `{ data: { base64: "data:<mime>;base64,…" } }`.
    const dados = objeto(resposta, 'data') ?? resposta;
    const base64 = texto(dados, 'base64', 'media', 'file');
    if (!base64) return null;

    const prefixo = /^data:([^;,]+)[^,]*,/.exec(base64);
    return {
      conteudoBase64: base64.replace(/^data:[^,]*,/, ''),
      mime: prefixo?.[1] ?? texto(dados, 'mimetype', 'mime'),
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
      // 0.7.2: `{ message: 'success', data: MessageSendStruct }`, e o
      // `types.MessageInfo` do whatsmeow serializa sem tag JSON — daí `Info.ID`
      // em maiúscula (conferido em pkg/sendMessage no fonte da tag 0.7.2).
      'data.Info.ID',
      'Info.ID',
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
      case 'temporaryban':
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
    if (
      jid.endsWith('@g.us') ||
      jid.includes('broadcast') ||
      jid.endsWith('@newsletter')
    ) {
      return null;
    }

    const naoLidas = Number(
      texto(bruto, 'unreadCount', 'unread', 'naoLidas') ?? 0,
    );

    return {
      jid,
      // A 0.7.2 manda `FullName`/`FirstName` (nome salvo na agenda do
      // celular), `PushName` (apelido) e `BusinessName`. Procurar só `name`
      // perdia o nome da agenda — o que o vendedor reconhece.
      nome:
        texto(
          bruto,
          'FullName',
          'FirstName',
          'BusinessName',
          'name',
          'PushName',
          'notify',
          'verifiedName',
          'nome',
        ) ?? null,
      // `@lid` é identificador opaco: os dígitos dele não são telefone.
      telefone:
        this.somenteDigitos(texto(bruto, 'phone', 'number', 'telefone')) ??
        (jid.endsWith('@lid') ? null : this.somenteDigitos(jid)),
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
