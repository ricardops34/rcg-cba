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
    @Query('chave') chaveQuery?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const ctx = await this.autenticar(
      empresaId,
      sessaoId,
      chaveQuery,
      authorization,
    );

    const evento = this.nomeDoEvento(corpo);
    switch (evento) {
      case 'conexao':
        return this.tratarConexao(ctx, corpo);
      case 'recibo':
        return this.tratarRecibo(ctx, corpo);
      case 'mensagem':
        return this.tratarMensagens(ctx, corpo);
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
    chaveQuery?: string,
    authorization?: string,
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
    const recebido =
      chaveQuery ?? authorization?.replace(/^Bearer\s+/i, '') ?? '';
    if (!esperado || !this.conferirSegredo(esperado, recebido)) {
      throw new UnauthorizedException();
    }

    return ctx;
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
  ): 'mensagem' | 'recibo' | 'conexao' | null {
    const bruto = (this.rotuloBruto(corpo) ?? '').toLowerCase();

    if (
      bruto.includes('receipt') ||
      bruto.includes('ack') ||
      bruto.includes('messages.update')
    ) {
      return 'recibo';
    }
    if (
      bruto.includes('connection') ||
      bruto.includes('qrcode') ||
      bruto.includes('qr_code') ||
      bruto.includes('pair') ||
      bruto.includes('logout') ||
      bruto.includes('disconnect')
    ) {
      return 'conexao';
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

    return { ok: true, tratado: true, status };
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

  private async tratarUmaMensagem(
    ctx: ContextoSessao,
    bruta: unknown,
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

    // Grupo e lista de transmissão não fazem parte do atendimento — a mesma
    // regra do zapo, e a razão é a mesma: não há um cliente do outro lado.
    if (jid.endsWith('@g.us') || jid.includes('broadcast')) return false;

    const minha = booleano(bruta, 'key.fromMe', 'Info.IsFromMe', 'fromMe');
    const conteudo = objeto(bruta, 'message', 'Message') ?? {};

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
    const resposta = await this.conversas.receber({
      sessaoId: ctx.sessaoId,
      empresaId: ctx.empresaId,
      externoId,
      jid,
      // O jid `@lid` é opaco e não carrega o número; o telefone precisa vir do
      // evento, senão o casamento automático com o cadastro nunca acontece
      // para esses contatos.
      telefone:
        this.evolution.telefoneDoJid(
          texto(bruta, 'Info.Sender', 'key.participant', 'sender', 'phone'),
        ) ?? this.evolution.telefoneDoJid(jid),
      minha,
      nomeExibicao: texto(bruta, 'pushName', 'Info.PushName', 'notifyName'),
      texto: this.textoDaMensagem(conteudo),
      tipo: midia?.tipo ?? this.tipoDaMensagem(conteudo),
      arquivoNome: midia?.nome ?? null,
      arquivoMime: midia?.mime ?? null,
      respondeuA: texto(
        conteudo,
        'extendedTextMessage.contextInfo.stanzaId',
        'contextInfo.stanzaId',
        'ExtendedTextMessage.ContextInfo.StanzaID',
      ),
    });

    // `arquivoNecessario` só existe na resposta de quem foi gravada — a
    // variante "sem vínculo" não o traz, e é justamente a que não pode baixar
    // mídia nenhuma.
    const precisaArquivo =
      'arquivoNecessario' in resposta && resposta.arquivoNecessario;
    if (!precisaArquivo || !midia) return true;

    // Segundo passo, e só agora: a API confirmou que gravou a mensagem. Mídia
    // de conversa não vinculada a cliente nunca chega até aqui.
    const arquivo = await this.evolution.baixarMidia(ctx, bruta);
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

  /** Texto da mensagem, onde quer que a versão o tenha colocado. */
  private textoDaMensagem(conteudo: Record<string, unknown>): string | null {
    return texto(
      conteudo,
      'conversation',
      'Conversation',
      'extendedTextMessage.text',
      'ExtendedTextMessage.Text',
      'imageMessage.caption',
      'videoMessage.caption',
      'documentMessage.caption',
      'ImageMessage.Caption',
      'VideoMessage.Caption',
      'text',
    );
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
      { tipo: 'imagem', caminhos: ['imageMessage', 'ImageMessage'] },
      { tipo: 'video', caminhos: ['videoMessage', 'VideoMessage'] },
      { tipo: 'audio', caminhos: ['audioMessage', 'AudioMessage'] },
      {
        tipo: 'documento',
        caminhos: ['documentMessage', 'DocumentMessage', 'stickerMessage'],
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
