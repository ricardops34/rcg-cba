import {
  Body,
  Controller,
  Headers,
  Logger,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { timingSafeEqual } from 'node:crypto';
import { WhatsappConversasService } from './whatsapp-conversas.service';
import { WhatsappSessaoService } from './whatsapp-sessao.service';
import { WhatsappProviderService } from './providers/whatsapp-provider.service';
import { EvolutionGoProvider } from './providers/evolution-go.provider';
import {
  booleano,
  lista,
  objeto,
  texto,
} from './providers/evolution-go.client';
import type { ContextoSessao } from './providers/whatsapp-provider';

/**
 * Callback da Evolution GO.
 *
 * É o caminho contrário do resto do módulo — aqui quem começa a conversa é o
 * gateway, sem ninguém ter pedido. Três consequências de desenho:
 *
 * **1. Empresa e sessão vêm na URL.** As tabelas têm RLS: sem o tenant no
 * contexto, a API não conseguiria nem localizar a própria sessão para descobrir
 * de quem é o evento. Ids não são segredo, e é por isso que existe o item 2.
 *
 * **2. O segredo é por instância**, não um token único do serviço. Cada sessão
 * tem o seu, gravado cifrado no pareamento: vazar o de um vendedor não entrega
 * o dos outros, e trocá-lo não exige repareamento de ninguém mais. A
 * comparação é em tempo constante — um segredo conferido caractere a caractere
 * é descobrível por medida de tempo.
 *
 * **3. A regra de privacidade é a mesma do worker.** O evento entra só com
 * metadados, a API decide se grava (conversa de contato sem cliente vinculado
 * não é gravada) e **só então** a mídia é baixada. Inverter essa ordem
 * guardaria no servidor justamente o que a regra manda não guardar.
 *
 * Fora do Swagger e sem `JwtAuthGuard`: quem chama é um serviço, não um
 * usuário logado.
 */
@ApiExcludeController()
@Controller('whatsapp/evolution')
export class WhatsappEvolutionController {
  private readonly logger = new Logger(WhatsappEvolutionController.name);

  /**
   * Verificações agendadas depois de uma queda, por sessão — ver
   * `agendarRetomada`. Ficam em memória: se a API reiniciar no meio, a
   * próxima queda agenda de novo.
   */
  private readonly retomadas = new Map<string, NodeJS.Timeout[]>();

  constructor(
    private readonly conversas: WhatsappConversasService,
    private readonly sessoes: WhatsappSessaoService,
    private readonly provedores: WhatsappProviderService,
    private readonly evolution: EvolutionGoProvider,
  ) {}

  @Post('webhook/:empresaId/:sessaoId')
  async webhook(
    @Param('empresaId') empresaId: string,
    @Param('sessaoId') sessaoId: string,
    @Body() corpo: unknown,
    @Headers('authorization') authorization?: string,
    @Headers('apikey') apikey?: string,
    @Query('secret') querySecret?: string,
  ) {
    const ctx = await this.autenticar(
      empresaId,
      sessaoId,
      authorization,
      apikey,
      querySecret,
    );

    const evento = this.nomeDoEvento(corpo);
    switch (evento) {
      case 'conexao':
        return this.tratarConexao(ctx, corpo);
      case 'recibo':
        return this.tratarRecibo(ctx, corpo);
      case 'mensagem':
        return this.tratarMensagens(ctx, corpo);
      case 'historico':
        return this.tratarHistorico(ctx, corpo);
      case 'apelido':
        return this.tratarApelido(ctx, corpo);
      default:
        // Evento assinado que ainda não tem tratamento (ou tipo novo de uma
        // versão mais recente): 200 de propósito. Devolver erro faria o
        // gateway reentregar para sempre algo que nunca vai ser processado.
        this.logger.debug(
          `Evento sem tratamento na sessão ${sessaoId}: ${this.rotuloBruto(corpo)}`,
        );
        return { ok: true, tratado: false };
    }
  }

  // ----------------------------------------------------------------------
  // Autenticação
  // ----------------------------------------------------------------------

  private async autenticar(
    empresaId: string,
    sessaoId: string,
    authorization?: string,
    apikey?: string,
    querySecret?: string,
  ): Promise<ContextoSessao> {
    const ctx = await this.provedores
      .contexto(empresaId, sessaoId)
      // Sessão apagada enquanto o gateway ainda a chamava: 401, não 404. O
      // callback não é lugar de dizer a um chamador não autenticado o que
      // existe e o que não existe deste lado.
      .catch(() => {
        throw new UnauthorizedException();
      });

    if (ctx.transporte !== 'evolution_go') {
      throw new UnauthorizedException();
    }

    const esperado = ctx.instancia.webhookSegredo;
    const recebido = this.segredoDaAutorizacao(authorization, apikey, querySecret);
    if (!esperado || !this.conferirSegredo(esperado, recebido)) {
      throw new UnauthorizedException();
    }

    return ctx;
  }

  private segredoDaAutorizacao(
    authorization?: string,
    apikey?: string,
    querySecret?: string,
  ): string {
    if (querySecret) return querySecret;
    if (apikey) return apikey;
    if (!authorization) return '';
    const bearer = authorization.match(/^Bearer\s+(.+)$/i);
    if (bearer) return bearer[1];
    const basic = authorization.match(/^Basic\s+(.+)$/i);
    if (!basic) return '';
    try {
      const credencial = Buffer.from(basic[1], 'base64').toString('utf8');
      const separador = credencial.indexOf(':');
      return separador >= 0 ? credencial.slice(separador + 1) : '';
    } catch {
      return '';
    }
  }

  /** Comparação em tempo constante, tolerante a tamanhos diferentes. */
  private conferirSegredo(esperado: string, recebido: string): boolean {
    const a = Buffer.from(esperado, 'utf8');
    const b = Buffer.from(recebido, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  // ----------------------------------------------------------------------
  // Roteamento de evento
  // ----------------------------------------------------------------------

  /**
   * Descobre de que tipo é o evento.
   *
   * A Evolution GO nomeia o campo de formas diferentes entre versões
   * (`event`, `type`, `Event`), e os valores misturam o estilo Baileys
   * (`messages.upsert`) com o próprio (`MESSAGE`). Comparar em minúsculas e
   * por prefixo é o que sobrevive às duas convenções.
   */
  private nomeDoEvento(
    corpo: unknown,
  ): 'mensagem' | 'recibo' | 'conexao' | 'historico' | 'apelido' | null {
    const bruto = (this.rotuloBruto(corpo) ?? '').toLowerCase();

    if (
      bruto.includes('receipt') ||
      bruto.includes('ack') ||
      bruto.includes('messages.update')
    ) {
      return 'recibo';
    }
    // Apelido do contato (e o par @lid ↔ telefone): não é mensagem.
    if (bruto.includes('pushname')) return 'apelido';
    if (
      // `Connected` precisa de nome próprio: a palavra não contém
      // "connection", e o evento da reconexão automática do gateway era
      // descartado — a sessão ficava "desconectada" com o aparelho no ar
      // (visto em 2026-10-06, depois de uma queda de 3 s do WhatsApp).
      bruto === 'connected' ||
      bruto.includes('connection') ||
      bruto.includes('qrcode') ||
      bruto.includes('qr_code') ||
      bruto.includes('pair') ||
      bruto.includes('logout') ||
      // `LoggedOut` (aparelho removido pelo celular) não contém "logout" e
      // também era descartado: a sessão seguia "conectada" para sempre.
      bruto.includes('loggedout') ||
      bruto.includes('temporaryban') ||
      bruto.includes('connectfailure') ||
      bruto.includes('disconnect')
    ) {
      return 'conexao';
    }
    // `ButtonClick` cai em `null` de propósito: é um resumo que a 0.7.2 manda
    // além da própria mensagem, e a escolha já é gravada a partir dela
    // (`respostaInterativa`). Tratar os dois gravaria o clique duas vezes.
    // O histórico vem aninhado em conversas (`HistorySync`), não como
    // mensagem solta — tratá-lo como `mensagem` o descartava inteiro.
    if (bruto.includes('historysync') || bruto.includes('history_sync')) {
      return 'historico';
    }
    if (bruto.includes('message') || bruto.includes('history')) {
      return 'mensagem';
    }
    return null;
  }

  private rotuloBruto(corpo: unknown): string | null {
    return texto(corpo, 'event', 'type', 'Event', 'eventType', 'evento');
  }

  // ----------------------------------------------------------------------
  // Conexão
  // ----------------------------------------------------------------------

  /**
   * Mudança de estado da conexão.
   *
   * É o evento que ninguém pediu: o socket caiu, o vendedor removeu o aparelho
   * pelo celular, o número foi bloqueado. Sem ele o banco guarda a última
   * intenção da tela, não a realidade, e o vendedor vê "conectado" enquanto
   * nada chega.
   */
  private async tratarConexao(ctx: ContextoSessao, corpo: unknown) {
    const dados = objeto(corpo, 'data', 'payload', 'Data') ?? corpo;

    const status = this.evolution.estadoDeEvento(
      texto(dados, 'state', 'status', 'connection', 'Event') ??
        this.rotuloBruto(corpo),
    );

    await this.sessoes.registrarEstado(ctx.empresaId, ctx.sessaoId, {
      status,
      numero: this.evolution.telefoneDoJid(
        texto(dados, 'number', 'phone', 'owner', 'jid', 'Sender'),
      ),
      erro: texto(dados, 'error', 'reason', 'message'),
    });

    // Queda comum (`Disconnected`): o gateway tenta reabrir uma vez só e, se
    // falhar, desiste. A plataforma confere depois e pede de novo. Remoção do
    // aparelho (`LoggedOut`) não é retomada — o vendedor tirou de propósito.
    const evento = (this.rotuloBruto(corpo) ?? '').toLowerCase();
    if (status === 'conectada' || evento.includes('loggedout')) {
      this.cancelarRetomada(ctx.sessaoId);
    } else if (evento === 'disconnected') {
      this.agendarRetomada(ctx);
    }

    // Conectou (ou reconectou): completa o nome dos contatos que ainda não
    // têm, pela agenda do aparelho. Em segundo plano — é uma consulta à
    // agenda inteira, e o webhook não precisa esperar.
    if (status === 'conectada') {
      void this.conversas
        .completarNomesPelaAgenda(ctx.empresaId, ctx.sessaoId)
        .catch(() => undefined);
    }

    return { ok: true, tratado: true, status };
  }

  /** Confere em 1 e em 5 minutos; cada verificação não faz nada se já voltou. */
  private agendarRetomada(ctx: ContextoSessao) {
    this.cancelarRetomada(ctx.sessaoId);
    const timers = [60_000, 300_000].map((espera) =>
      setTimeout(() => {
        void this.sessoes
          .retomarConexao(ctx.empresaId, ctx.sessaoId)
          .catch((erro) =>
            this.logger.warn(
              `Retomada da sessão ${ctx.sessaoId} falhou: ` +
                `${erro instanceof Error ? erro.message : String(erro)}`,
            ),
          );
      }, espera),
    );
    this.retomadas.set(ctx.sessaoId, timers);
  }

  private cancelarRetomada(sessaoId: string) {
    for (const t of this.retomadas.get(sessaoId) ?? []) clearTimeout(t);
    this.retomadas.delete(sessaoId);
  }

  // ----------------------------------------------------------------------
  // Recibos
  // ----------------------------------------------------------------------

  /**
   * Recibo de entrega/leitura das mensagens que saíram daqui.
   *
   * O WhatsApp confirma em lote — abrir a conversa gera um recibo para tudo
   * que estava por ler —, então a lista de ids vem inteira e o service resolve
   * num `updateMany`. Recibo de tipo desconhecido é descartado: promover a
   * `lida` uma mensagem por causa de um evento não identificado pintaria o
   * visto azul sem que ninguém tenha lido nada.
   */
  private async tratarRecibo(ctx: ContextoSessao, corpo: unknown) {
    const dados = objeto(corpo, 'data', 'payload', 'Data') ?? corpo;

    const tipo = (
      texto(dados, 'type', 'receiptType', 'Type', 'status') ?? ''
    ).toLowerCase();
    const status: 'entregue' | 'lida' | null = tipo.includes('read')
      ? 'lida'
      : tipo.includes('deliver') || tipo.includes('delivery')
        ? 'entregue'
        : null;
    if (!status) return { ok: true, tratado: false };

    const ids = [
      ...lista(dados, 'ids', 'messageIds', 'MessageIDs', 'keys')
        .map((item) =>
          typeof item === 'string' ? item : texto(item, 'id', 'key.id'),
        )
        .filter((id): id is string => Boolean(id)),
      ...[texto(dados, 'messageId', 'id', 'key.id')].filter(
        (id): id is string => Boolean(id),
      ),
    ];
    if (ids.length === 0) return { ok: true, tratado: false };

    const resultado = await this.conversas.receberRecibo({
      sessaoId: ctx.sessaoId,
      empresaId: ctx.empresaId,
      externoIds: ids,
      status,
    });

    return { ok: true, tratado: true, ...resultado };
  }

  // ----------------------------------------------------------------------
  // Mensagens
  // ----------------------------------------------------------------------

  /**
   * Uma entrega pode trazer uma mensagem ou um lote — a sincronização de
   * histórico chega em blocos. Cada uma é processada por si: uma que falha não
   * pode levar as outras junto.
   */
  private async tratarMensagens(ctx: ContextoSessao, corpo: unknown) {
    const dados = objeto(corpo, 'data', 'payload', 'Data') ?? corpo;
    const pacote = lista(dados, 'messages', 'Messages', 'items');
    const mensagens = pacote.length > 0 ? pacote : [dados];

    let gravadas = 0;
    for (const bruta of mensagens) {
      try {
        if (await this.tratarUmaMensagem(ctx, bruta)) gravadas += 1;
      } catch (erro) {
        // Uma mensagem problemática não pode derrubar o lote inteiro nem fazer
        // o gateway reentregar tudo. O log é o que permite investigar depois.
        this.logger.error(
          `Falha ao processar mensagem da sessão ${ctx.sessaoId}: ` +
            `${erro instanceof Error ? erro.message : String(erro)}`,
        );
      }
    }

    return { ok: true, tratado: true, gravadas };
  }

  /**
   * Telefone de quem está do outro lado da conversa.
   *
   * Na recebida, o remetente é o contato: `Sender`, e o `SenderAlt` quando o
   * gateway não fez o swap e o `Sender` é `@lid`. Na que saiu do celular, o
   * `Sender` é o **próprio vendedor** — usá-lo prenderia a conversa ao número
   * dele; o do contato vem no `RecipientAlt`. `telefoneDoJid` devolve nulo
   * para `@lid`, então cada candidato opaco simplesmente cede ao próximo.
   */
  private telefoneDoContato(
    bruta: unknown,
    jid: string,
    minha: boolean,
  ): string | null {
    const candidatos = minha
      ? [texto(bruta, 'Info.RecipientAlt', 'recipientAlt')]
      : [
          texto(bruta, 'Info.Sender', 'key.participant', 'sender', 'phone'),
          texto(bruta, 'Info.SenderAlt', 'senderAlt'),
        ];
    for (const candidato of [...candidatos, jid]) {
      const telefone = this.evolution.telefoneDoJid(candidato);
      if (telefone) return telefone;
    }
    return null;
  }

  private async tratarUmaMensagem(
    ctx: ContextoSessao,
    bruta: unknown,
    opcoes: {
      historico?: boolean;
      criadaEm?: Date;
      /** Nome da conversa vindo do histórico (agenda do celular ou apelido). */
      nomeContato?: string | null;
    } = {},
  ): Promise<boolean> {
    const externoId = texto(bruta, 'key.id', 'Info.ID', 'id', 'messageId');
    const jid = texto(
      bruta,
      'key.remoteJid',
      'Info.Chat',
      'remoteJid',
      'chatId',
      'from',
    );
    if (!externoId || !jid) return false;

    // Grupo, lista de transmissão e canal não fazem parte do atendimento: não
    // há um cliente do outro lado. Canal (`@newsletter`) tem id `120363…`,
    // igual ao de grupo — sem ele aqui, cada postagem virava aviso no sino.
    if (
      jid.endsWith('@g.us') ||
      jid.includes('broadcast') ||
      jid.endsWith('@newsletter')
    ) {
      return false;
    }

    const minha = booleano(bruta, 'key.fromMe', 'Info.IsFromMe', 'fromMe');
    const envelope = objeto(bruta, 'message', 'Message') ?? {};
    // Edição, mensagem temporária, visualização única… chegam embrulhadas; o
    // que interessa é o conteúdo de dentro (ver `desembrulhar`).
    const conteudo = this.desembrulhar(envelope);

    // Edição, exclusão para todos e mensagens de controle do WhatsApp
    // (mensagem temporária, sincronização…) vêm como `protocolMessage`. Nenhuma
    // é mensagem nova: sem este desvio viravam bolha vazia no rolo.
    const protocolo = objeto(conteudo, 'protocolMessage');
    if (protocolo) return this.tratarProtocolo(ctx, protocolo);

    // Voto de enquete: chega cifrado. Quem decifra e grava é o gateway, de
    // forma assíncrona — a leitura do resultado vem depois (ver o método).
    const voto = objeto(conteudo, 'pollUpdateMessage');
    if (voto) {
      const enquete = texto(voto, 'pollCreationMessageKey.ID');
      if (enquete) this.atualizarVotosEnquete(ctx, enquete);
      return true;
    }

    // Reação vem no mesmo evento da mensagem, mas não é mensagem: ela não
    // entra no rolo da conversa, gruda na mensagem que aponta. Sem este desvio
    // ela viraria uma bolha vazia no histórico do vendedor.
    const reacao = objeto(conteudo, 'reactionMessage', 'ReactionMessage');
    if (reacao) {
      const alvo = texto(reacao, 'key.id', 'Key.ID');
      if (!alvo) return false;
      await this.conversas.receberReacao({
        sessaoId: ctx.sessaoId,
        empresaId: ctx.empresaId,
        jid,
        alvoExternoId: alvo,
        // Emoji vazio é remoção — mesma convenção do WhatsApp.
        emoji: texto(reacao, 'text', 'Text', 'emoji') ?? '',
      });
      return true;
    }

    const midia = this.midiaDaMensagem(conteudo);
    // Clique em botão/lista, ou enquete criada no próprio celular: entram
    // como mensagem, mas com o conteúdo estruturado para a bolha desenhar.
    const estruturado =
      this.respostaInterativa(conteudo) ??
      this.enqueteDoCelular(conteudo) ??
      this.mensagemDeEmpresa(conteudo);
    if (!midia && !estruturado && this.tipoDaMensagem(conteudo) === 'outro') {
      // Só os nomes dos campos, nunca o conteúdo: é o que permite reconhecer
      // o próximo formato sem adivinhação (foi o caso da Panan).
      this.logger.log(
        `Mensagem de tipo desconhecido na sessão ${ctx.sessaoId}: campos=${
          Object.entries(conteudo)
            .map(([k, v]) =>
              v && typeof v === 'object'
                ? `${k}{${Object.keys(v as object).join(',')}}`
                : k,
            )
            .join(',') || '(nenhum)'
        }`,
      );
    }
    const resposta = await this.conversas.receber({
      sessaoId: ctx.sessaoId,
      empresaId: ctx.empresaId,
      externoId,
      jid,
      // O jid `@lid` é opaco e não carrega o número; o telefone precisa vir do
      // evento, senão o casamento automático com o cadastro nunca acontece
      // para esses contatos — e a mesma pessoa vira duas conversas, uma com o
      // que ela mandou (jid telefônico) e outra com o que o vendedor mandou
      // pelo celular (`@lid`).
      telefone: this.telefoneDoContato(bruta, jid, minha),
      minha,
      // Na que saiu do celular, o `pushName` é o do próprio vendedor: usá-lo
      // renomearia o contato com o nome de quem está atendendo.
      nomeExibicao:
        opcoes.nomeContato ??
        (minha
          ? null
          : // Conta comercial: o nome verificado é o que o celular mostra
            // ("Panan Refrigeração"), e vence o apelido.
            texto(
              bruta,
              'Info.VerifiedName.Details.verifiedName',
              'Info.VerifiedName',
              'verifiedBizName',
              'pushName',
              'Info.PushName',
              'notifyName',
            )),
      texto: estruturado?.texto ?? this.textoDaMensagem(conteudo),
      tipo: estruturado?.tipo ?? midia?.tipo ?? this.tipoDaMensagem(conteudo),
      arquivoNome: midia?.nome ?? null,
      arquivoMime: midia?.mime ?? null,
      interativo: estruturado?.interativo ?? null,
      historico: opcoes.historico,
      nomeDaAgenda: Boolean(opcoes.nomeContato),
      criadaEm: opcoes.criadaEm ?? null,
      // O id citado (`stanzaID`) mora no `contextInfo` do tipo da mensagem —
      // texto, mídia ou a resposta a botão/lista, que cita a mensagem de
      // origem. A leitura de caminho já ignora maiúsculas.
      respondeuA:
        estruturado?.origem ??
        texto(
          conteudo,
          'extendedTextMessage.contextInfo.stanzaID',
          'imageMessage.contextInfo.stanzaID',
          'videoMessage.contextInfo.stanzaID',
          'audioMessage.contextInfo.stanzaID',
          'documentMessage.contextInfo.stanzaID',
          'stickerMessage.contextInfo.stanzaID',
          'contextInfo.stanzaID',
        ),
    });

    // `arquivoNecessario` só existe na resposta de quem foi gravada — a
    // variante "sem vínculo" não o traz, e é justamente a que não pode baixar
    // mídia nenhuma.
    const precisaArquivo =
      'arquivoNecessario' in resposta && resposta.arquivoNecessario;
    if (!precisaArquivo || !midia) return true;

    // Segundo passo, e só agora: a API confirmou que gravou a mensagem —
    // baixar antes seria buscar mídia de algo que nem ficou (grupo, canal).
    // Vai o **conteúdo** já desembrulhado (`imageMessage`, `audioMessage`…),
    // não o evento inteiro: a 0.7.2 procura a mídia direto em `message` e,
    // com `Info`+`Message`, respondia "invalid media type" para tudo.
    const arquivo = await this.evolution.baixarMidia(ctx, conteudo);
    if (!arquivo) return true;

    await this.conversas.gravarArquivoRecebido({
      empresaId: ctx.empresaId,
      sessaoId: ctx.sessaoId,
      externoId,
      nome: midia.nome,
      mime: arquivo.mime ?? midia.mime,
      conteudoBase64: arquivo.conteudoBase64,
    });
    return true;
  }

  /**
   * `PushName`: o contato trocou (ou mostrou pela primeira vez) o apelido.
   * Traz `JID` e `JIDAlt` — um é `@lid`, o outro o telefone —, então serve
   * também para dar telefone ao contato que só existia como `@lid`. O apelido
   * só preenche nome vazio: nome vindo da agenda ou digitado não é trocado.
   */
  private async tratarApelido(ctx: ContextoSessao, corpo: unknown) {
    const dados = objeto(corpo, 'data', 'Data') ?? corpo;
    const jids = [texto(dados, 'JID'), texto(dados, 'JIDAlt')].filter(
      (j): j is string => Boolean(j),
    );
    const nome = texto(dados, 'NewPushName', 'newPushName');
    if (jids.length === 0) return { ok: true, tratado: false };
    const telefone =
      jids
        .map((j) => (j.endsWith('@lid') ? null : this.evolution.telefoneDoJid(j)))
        .find(Boolean) ?? null;
    const resultado = await this.conversas.atualizarContatoPorJid({
      empresaId: ctx.empresaId,
      jids,
      apelido: nome,
      telefone,
    });
    return { ok: true, tratado: true, ...resultado };
  }

  /**
   * Histórico do aparelho (`HistorySync` da 0.7.2).
   *
   * Chega sozinho no pareamento (`INITIAL_BOOTSTRAP`, `RECENT`, `FULL`) e a
   * cada pedido sob demanda, aninhado em conversas:
   * `Data.conversations[].messages[].message` — cada item é um
   * `WebMessageInfo` (`key`, `message`, `messageTimestamp`, `pushName`).
   *
   * Só entra o que cabe nos **dias de histórico** da empresa (Administração >
   * WhatsApp); com zero, nada entra — é a decisão de privacidade de cada
   * empresa. Cada mensagem passa pelo mesmo caminho da recebida ao vivo
   * (vínculo, idempotência por `externoId`, mídia), marcada como histórico:
   * data original, sem não-lida, sem sino.
   *
   * Responde na hora e processa em segundo plano: um lote de 30 dias passa
   * fácil do tempo que o gateway espera pelo webhook, e ele reentregaria.
   */
  private tratarHistorico(ctx: ContextoSessao, corpo: unknown) {
    const dias = ctx.config.historicoDias;
    if (!dias || dias <= 0) {
      return { ok: true, tratado: false, motivo: 'historico-desligado' };
    }

    const envelope = objeto(corpo, 'data', 'Data') ?? corpo;
    const historico = objeto(envelope, 'Data', 'data') ?? envelope;
    const conversas = lista(historico, 'conversations');
    const limite = Date.now() - dias * 24 * 60 * 60 * 1000;

    // O pacote traz, além das mensagens, o que identifica cada pessoa — e é
    // daqui que sai nome e telefone, porque o chat costuma vir só como `@lid`
    // (identificador opaco, sem número) e o gateway não converte depois.
    //   - `phoneNumberToLidMappings`: `@lid` ↔ telefone;
    //   - `pushnames`: o apelido que cada um usa no WhatsApp;
    //   - em cada conversa, `name`/`displayName`: o nome salvo na agenda.
    const telefonePorLid = new Map<string, string>();
    for (const m of lista(historico, 'phoneNumberToLidMappings')) {
      const lid = texto(m, 'lidJID', 'lidJid');
      const pn = texto(m, 'pnJID', 'pnJid');
      if (lid && pn) telefonePorLid.set(lid, pn);
    }
    const apelidoPorJid = new Map<string, string>();
    for (const p of lista(historico, 'pushnames')) {
      const id = texto(p, 'ID', 'id');
      const nome = texto(p, 'pushname', 'pushName');
      if (id && nome) apelidoPorJid.set(id, nome);
    }

    void (async () => {
      let gravadas = 0;
      for (const conversa of conversas) {
        const jidConversa = texto(conversa, 'ID', 'id', 'newJID');
        // Telefone de quem está do outro lado quando o chat é `@lid`.
        const telefoneConversa =
          texto(conversa, 'pnJID', 'pnJid') ??
          (jidConversa ? telefonePorLid.get(jidConversa) : undefined) ??
          null;
        const nomeConversa =
          texto(conversa, 'name', 'displayName', 'username') ??
          (jidConversa ? apelidoPorJid.get(jidConversa) : undefined) ??
          (telefoneConversa ? apelidoPorJid.get(telefoneConversa) : undefined) ??
          null;
        for (const item of lista(conversa, 'messages')) {
          const info = objeto(item, 'message') ?? item;
          const segundos = Number(texto(info, 'messageTimestamp') ?? 0);
          if (!segundos || segundos * 1000 < limite) continue;

          const conteudo = objeto(info, 'message');
          const id = texto(info, 'key.ID');
          const chat = texto(info, 'key.remoteJID') ?? jidConversa;
          if (!conteudo || !id || !chat) continue;

          const minha = booleano(info, 'key.fromMe');
          try {
            const gravou = await this.tratarUmaMensagem(
              ctx,
              {
                Info: {
                  ID: id,
                  Chat: chat,
                  Sender: minha
                    ? ''
                    : (texto(info, 'key.participant', 'participant') ?? chat),
                  SenderAlt: telefoneConversa ?? undefined,
                  RecipientAlt: minha ? (telefoneConversa ?? undefined) : undefined,
                  IsFromMe: minha,
                  PushName: minha ? undefined : texto(info, 'pushName'),
                  // Conta comercial: o nome do perfil verificado.
                  VerifiedName: minha ? undefined : texto(info, 'verifiedBizName'),
                },
                Message: conteudo,
              },
              {
                historico: true,
                criadaEm: new Date(segundos * 1000),
                nomeContato: nomeConversa,
              },
            );
            if (gravou) gravadas += 1;
          } catch (erro) {
            this.logger.warn(
              `Histórico: mensagem ${id} da sessão ${ctx.sessaoId} não gravada: ` +
                `${erro instanceof Error ? erro.message : String(erro)}`,
            );
          }
        }
      }
      this.logger.log(
        `Histórico da sessão ${ctx.sessaoId}: ${conversas.length} conversas ` +
          `recebidas (${telefonePorLid.size} @lid com telefone, ${apelidoPorJid.size} apelidos), ` +
          `${gravadas} mensagens gravadas (últimos ${dias} dias).`,
      );
      // O pacote de apelidos chega separado das conversas: aplica direto
      // aos contatos sem nome que já existem.
      if (apelidoPorJid.size > 0) {
        const { atualizados } = await this.conversas
          .aplicarApelidos(ctx.empresaId, [...apelidoPorJid.entries()])
          .catch(() => ({ atualizados: 0 }));
        if (atualizados) {
          this.logger.log(
            `Histórico da sessão ${ctx.sessaoId}: ${atualizados} contatos nomeados pelo apelido.`,
          );
        }
      }
      // Contato do histórico costuma chegar só como `@lid`, sem nome: a
      // agenda do aparelho completa (o telefone já veio do mapeamento).
      if (gravadas > 0) {
        const { atualizados } = await this.conversas
          .completarNomesPelaAgenda(ctx.empresaId, ctx.sessaoId)
          .catch(() => ({ atualizados: 0 }));
        if (atualizados) {
          this.logger.log(
            `Histórico da sessão ${ctx.sessaoId}: ${atualizados} contatos nomeados pela agenda.`,
          );
        }
      }
    })();

    return { ok: true, tratado: true, conversas: conversas.length };
  }

  /**
   * `protocolMessage`: edição, exclusão para todos ou controle.
   *
   * O tipo é o enum do proto (`ProtocolMessage_Type`): `0` REVOKE e `14`
   * MESSAGE_EDIT. Sai como número no JSON do Go, e o REVOKE — por ser zero —
   * pode vir **sem** o campo (`omitempty`); daí "sem tipo e sem edição" contar
   * como exclusão. O nome por extenso também é aceito, caso a serialização
   * mude. Qualquer outro tipo é controle do WhatsApp e é ignorado.
   */
  private async tratarProtocolo(
    ctx: ContextoSessao,
    protocolo: Record<string, unknown>,
  ): Promise<boolean> {
    const alvo = texto(protocolo, 'key.ID');
    if (!alvo) return false;

    const tipo = (texto(protocolo, 'type') ?? '').toUpperCase();
    const editada = objeto(protocolo, 'editedMessage');

    if (tipo === '14' || tipo === 'MESSAGE_EDIT') {
      const novoTexto = editada ? this.textoDaMensagem(editada) : null;
      if (!novoTexto) return false;
      await this.conversas.receberEdicao({
        sessaoId: ctx.sessaoId,
        empresaId: ctx.empresaId,
        alvoExternoId: alvo,
        novoTexto,
      });
      return true;
    }

    if (tipo === '0' || tipo === 'REVOKE' || (tipo === '' && !editada)) {
      await this.conversas.receberExclusao({
        sessaoId: ctx.sessaoId,
        empresaId: ctx.empresaId,
        alvoExternoId: alvo,
      });
      return true;
    }

    return false;
  }

  /**
   * Busca os votos de uma enquete no gateway e grava na mensagem.
   *
   * Em segundo plano e com nova tentativa: a 0.7.2 decifra e salva o voto
   * numa goroutine própria, então no instante do webhook ele pode ainda não
   * estar lá. Falha aqui não volta ao gateway — o voto seguinte refaz a
   * leitura inteira.
   */
  private atualizarVotosEnquete(ctx: ContextoSessao, enqueteExternoId: string) {
    const tentar = async (restantes: number[]) => {
      const [espera, ...depois] = restantes;
      await new Promise((r) => setTimeout(r, espera));
      try {
        const votantes = await this.provedores.resultadosEnquete(
          ctx.empresaId,
          ctx.sessaoId,
          enqueteExternoId,
        );
        if (votantes.length === 0 && depois.length) return tentar(depois);
        await this.conversas.registrarVotosEnquete({
          sessaoId: ctx.sessaoId,
          empresaId: ctx.empresaId,
          enqueteExternoId,
          votantes,
        });
      } catch (erro) {
        if (depois.length) return tentar(depois);
        this.logger.warn(
          `Votos da enquete ${enqueteExternoId} não lidos: ` +
            `${erro instanceof Error ? erro.message : String(erro)}`,
        );
      }
    };
    void tentar([1500, 5000]);
  }

  /**
   * A escolha do cliente num botão ou lista enviados daqui.
   *
   * São quatro formatos no proto, e o `ButtonClick` que a 0.7.2 também
   * dispara é só um resumo destes — por isso aquele evento é ignorado (ver
   * `nomeDoEvento`) e a escolha é lida da própria mensagem, que traz o id para
   * a idempotência e o `stanzaID` da mensagem de origem.
   */
  private respostaInterativa(conteudo: Record<string, unknown>): {
    tipo: 'resposta';
    texto: string;
    interativo: Record<string, unknown>;
    origem: string | null;
  } | null {
    const montar = (
      corpo: Record<string, unknown>,
      escolhaId: string | null,
      escolhaTexto: string | null,
    ) => {
      const textoFinal = escolhaTexto ?? escolhaId;
      if (!textoFinal) return null;
      const origem = texto(corpo, 'contextInfo.stanzaID');
      return {
        tipo: 'resposta' as const,
        texto: textoFinal,
        origem,
        interativo: {
          tipo: 'resposta',
          escolhaId: escolhaId ?? '',
          escolhaTexto: textoFinal,
          origemExternoId: origem,
        },
      };
    };

    const selecao = objeto(conteudo, 'listResponseMessage');
    if (selecao) {
      return montar(
        selecao,
        texto(selecao, 'singleSelectReply.selectedRowID'),
        texto(selecao, 'title'),
      );
    }

    const botoes = objeto(conteudo, 'buttonsResponseMessage');
    if (botoes) {
      return montar(
        botoes,
        texto(botoes, 'selectedButtonID'),
        texto(
          botoes,
          'selectedDisplayText',
          'Response.SelectedDisplayText',
          'response.selectedDisplayText',
        ),
      );
    }

    const modelo = objeto(conteudo, 'templateButtonReplyMessage');
    if (modelo) {
      return montar(
        modelo,
        texto(modelo, 'selectedID'),
        texto(modelo, 'selectedDisplayText'),
      );
    }

    // Botões nativos (`/send/button`): a escolha vem num JSON em texto,
    // `paramsJSON` = { id, display_text }.
    const interativa = objeto(conteudo, 'interactiveResponseMessage');
    if (interativa) {
      const params = texto(
        interativa,
        'nativeFlowResponseMessage.paramsJSON',
        'interactiveResponseMessage.nativeFlowResponseMessage.paramsJSON',
        'InteractiveResponseMessage.NativeFlowResponseMessage.ParamsJSON',
      );
      let id: string | null = null;
      let rotulo: string | null = null;
      try {
        const lido = params ? (JSON.parse(params) as Record<string, unknown>) : {};
        id = typeof lido.id === 'string' ? lido.id : null;
        rotulo = typeof lido.display_text === 'string' ? lido.display_text : null;
      } catch {
        // paramsJSON malformado: cai no texto do corpo.
      }
      return montar(interativa, id, rotulo ?? texto(interativa, 'body.text'));
    }

    return null;
  }

  /**
   * Mensagem de empresa com modelo e botões (`templateMessage`), como a da
   * Panan no teste real: texto, rodapé e botões de resposta/link/ligação.
   * Vira `botoes`, para a bolha desenhar como o celular mostra. Os botões
   * são só ilustração — quem toca é o cliente, no celular dele.
   *
   * O modelo pode vir em `hydratedTemplate` ou no oneof `format`; cada botão
   * também é um oneof (`quickReplyButton`, `urlButton`, `callButton`).
   */
  private mensagemDeEmpresa(conteudo: Record<string, unknown>): {
    tipo: 'botoes';
    texto: string;
    interativo: Record<string, unknown>;
    origem: null;
  } | null {
    const modelo = objeto(
      conteudo,
      'templateMessage.hydratedTemplate',
      'templateMessage.format.hydratedFourRowTemplate',
      'templateMessage.hydratedFourRowTemplate',
    );
    if (!modelo) return null;
    const corpo = texto(modelo, 'hydratedContentText');
    if (!corpo) return null;

    const botoes = lista(modelo, 'hydratedButtons')
      .map((b) => {
        const resposta = texto(
          b,
          'quickReplyButton.displayText',
          'hydratedButton.quickReplyButton.displayText',
        );
        if (resposta) return { tipo: 'resposta', texto: resposta.slice(0, 25) };
        const link = objeto(b, 'urlButton', 'hydratedButton.urlButton');
        if (link) {
          return {
            tipo: 'url',
            texto: (texto(link, 'displayText') ?? 'Abrir').slice(0, 25),
            url: texto(link, 'url') ?? '',
          };
        }
        const ligar = objeto(b, 'callButton', 'hydratedButton.callButton');
        if (ligar) {
          return {
            tipo: 'ligar',
            texto: (texto(ligar, 'displayText') ?? 'Ligar').slice(0, 25),
            telefone: (texto(ligar, 'phoneNumber') ?? '').replace(/[^\d+]/g, ''),
          };
        }
        return null;
      })
      .filter((b): b is NonNullable<typeof b> => b !== null);

    const titulo = texto(modelo, 'hydratedTitleText', 'title');
    const rodape = texto(modelo, 'hydratedFooterText');
    return {
      tipo: 'botoes',
      texto: [titulo, corpo, ...botoes.map((b) => `[${b.texto}]`)]
        .filter(Boolean)
        .join('\n'),
      origem: null,
      interativo: {
        tipo: 'botoes',
        ...(titulo ? { titulo } : {}),
        texto: corpo,
        ...(rodape ? { rodape } : {}),
        botoes,
      },
    };
  }

  /** Enquete criada pelo vendedor no próprio celular. */
  private enqueteDoCelular(conteudo: Record<string, unknown>): {
    tipo: 'enquete';
    texto: string;
    interativo: Record<string, unknown>;
    origem: null;
  } | null {
    const enquete = objeto(
      conteudo,
      'pollCreationMessage',
      'pollCreationMessageV2',
      'pollCreationMessageV3',
      'pollCreationMessageV4',
      'pollCreationMessageV5',
      'pollCreationMessageV6',
    );
    if (!enquete) return null;
    const pergunta = texto(enquete, 'name');
    const opcoes = lista(enquete, 'options')
      .map((o) => texto(o, 'optionName'))
      .filter((o): o is string => Boolean(o));
    if (!pergunta || opcoes.length === 0) return null;
    const maximo = Number(texto(enquete, 'selectableOptionsCount') ?? 0);
    return {
      tipo: 'enquete',
      texto: `📊 ${pergunta}\n${opcoes.map((o) => `○ ${o}`).join('\n')}`,
      origem: null,
      interativo: {
        tipo: 'enquete',
        pergunta,
        opcoes,
        maxRespostas: Number.isFinite(maximo) ? maximo : 0,
      },
    };
  }

  /** Texto da mensagem, onde quer que a versão o tenha colocado. */
  private textoDaMensagem(conteudo: Record<string, unknown>): string | null {
    return texto(
      conteudo,
      'conversation',
      'extendedTextMessage.text',
      'imageMessage.caption',
      'videoMessage.caption',
      'documentMessage.caption',
      // Mensagens de empresa (modelo com botões, interativa, lista, produto):
      // chegavam como "[outro]" — visto na conversa real com a Panan.
      'templateMessage.hydratedTemplate.hydratedContentText',
      // `format` é um campo de escolha (oneof) no proto: o Go o serializa
      // com o nome da opção dentro.
      'templateMessage.format.hydratedFourRowTemplate.hydratedContentText',
      'templateMessage.format.interactiveMessageTemplate.body.text',
      'templateMessage.hydratedFourRowTemplate.hydratedContentText',
      'templateMessage.interactiveMessageTemplate.body.text',
      'templateMessage.hydratedTemplate.title',
      'interactiveMessage.body.text',
      'buttonsMessage.contentText',
      'listMessage.description',
      'productMessage.body',
      'orderMessage.message',
      'groupInviteMessage.caption',
      'eventMessage.name',
      'text',
    );
  }

  /**
   * Tira os envelopes que o WhatsApp põe em volta do conteúdo: mensagem
   * temporária, visualização única, documento com legenda, edição e a
   * mensagem que o próprio vendedor mandou de outro aparelho
   * (`deviceSentMessage`). Sem isto, tudo que chega numa conversa com
   * mensagens temporárias ligadas virava "[outro]".
   */
  private desembrulhar(
    conteudo: Record<string, unknown>,
  ): Record<string, unknown> {
    let atual = conteudo;
    for (let i = 0; i < 4; i++) {
      const dentro = objeto(
        atual,
        'ephemeralMessage.message',
        'viewOnceMessage.message',
        'viewOnceMessageV2.message',
        'viewOnceMessageV2Extension.message',
        'documentWithCaptionMessage.message',
        'deviceSentMessage.message',
        'editedMessage.message',
        'botInvokeMessage.message',
        'groupMentionedMessage.message',
      );
      if (!dentro) break;
      atual = dentro;
    }
    return atual;
  }

  /**
   * Mídia da mensagem, quando há.
   *
   * O nome e o mime vêm do envelope porque são o que a plataforma grava na
   * coluna — o arquivo em si só é buscado depois, e pode nem ser buscado.
   */
  private midiaDaMensagem(conteudo: Record<string, unknown>): {
    tipo: 'imagem' | 'video' | 'audio' | 'documento';
    nome: string | null;
    mime: string | null;
  } | null {
    const candidatos: {
      tipo: 'imagem' | 'video' | 'audio' | 'documento';
      caminhos: string[];
    }[] = [
      // Figurinha é imagem webp: aparece como imagem no rolo, não como anexo.
      {
        tipo: 'imagem',
        caminhos: ['imageMessage', 'ImageMessage', 'stickerMessage'],
      },
      { tipo: 'video', caminhos: ['videoMessage', 'VideoMessage'] },
      { tipo: 'audio', caminhos: ['audioMessage', 'AudioMessage'] },
      {
        tipo: 'documento',
        caminhos: ['documentMessage', 'DocumentMessage'],
      },
    ];

    for (const { tipo, caminhos } of candidatos) {
      const envelope = objeto(conteudo, ...caminhos);
      if (!envelope) continue;
      return {
        tipo,
        nome: texto(envelope, 'fileName', 'FileName', 'title'),
        mime: texto(envelope, 'mimetype', 'Mimetype', 'mimeType'),
      };
    }
    return null;
  }

  /** Tipo das mensagens sem arquivo. */
  private tipoDaMensagem(
    conteudo: Record<string, unknown>,
  ): 'texto' | 'localizacao' | 'contato' | 'outro' {
    if (objeto(conteudo, 'locationMessage', 'LocationMessage')) {
      return 'localizacao';
    }
    if (
      objeto(conteudo, 'contactMessage', 'ContactMessage') ??
      objeto(conteudo, 'contactsArrayMessage')
    ) {
      return 'contato';
    }
    if (this.textoDaMensagem(conteudo)) return 'texto';
    return 'outro';
  }
}
