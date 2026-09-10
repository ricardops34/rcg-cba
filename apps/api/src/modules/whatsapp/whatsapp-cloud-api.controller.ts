import {
  Controller,
  Get,
  Headers,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { WhatsappConfigService } from './whatsapp-config.service';
import { WhatsappConversasService } from './whatsapp-conversas.service';
import { WhatsappSessaoService } from './whatsapp-sessao.service';
import { WhatsappProviderService } from './providers/whatsapp-provider.service';
import type { ContextoSessao } from './providers/whatsapp-provider';

/**
 * Webhook da WhatsApp Cloud API (Meta).
 *
 * Duas partes bem diferentes, como a documentação da Meta descreve:
 *
 * **1. Handshake de verificação** (`GET`) — a Meta chama uma vez, ao
 * cadastrar a URL no painel, com `hub.verify_token` e `hub.challenge`; a
 * rota confere o token e ecoa o challenge em texto puro. Sem equivalente na
 * Evolution GO.
 *
 * **2. Eventos** (`POST`) — assinados em `X-Hub-Signature-256:
 * sha256=<hmac>`, HMAC-SHA256 do **corpo bruto** com o App Secret da
 * empresa. Por isso `main.ts` liga `rawBody: true`: sem o buffer original,
 * não dá para recalcular o hash — o JSON reserializado nem sempre bate
 * byte a byte com o que a Meta assinou.
 *
 * Institucional apenas: a Cloud API só entra na sessão `tipo: 'empresa'`
 * (ver `docs/planos/whatsapp-api-oficial.md`), então o roteamento aqui não
 * precisa de `sessaoId` na URL como o da Evolution GO — há no máximo uma
 * sessão Cloud API por empresa.
 *
 * Fora do Swagger e sem `JwtAuthGuard`: quem chama é a Meta, não um usuário
 * logado.
 */
@ApiExcludeController()
@Controller('whatsapp/cloud-api')
export class WhatsappCloudApiController {
  private readonly logger = new Logger(WhatsappCloudApiController.name);

  constructor(
    private readonly config: WhatsappConfigService,
    private readonly sessoes: WhatsappSessaoService,
    private readonly provedores: WhatsappProviderService,
    private readonly conversas: WhatsappConversasService,
  ) {}

  // ----------------------------------------------------------------------
  // Handshake
  // ----------------------------------------------------------------------

  @Get('webhook/:empresaId')
  async handshake(
    @Param('empresaId') empresaId: string,
    @Query('hub.mode') modo: string | undefined,
    @Query('hub.verify_token') tokenRecebido: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() res: Response,
  ) {
    // Leitura direta, sem upsert: uma requisição não autenticada não pode
    // criar linha de configuração para qualquer `empresaId` que alguém tente.
    const tokenEsperado = await this.config
      .webhookVerifyToken(empresaId)
      .catch(() => null);

    if (
      modo === 'subscribe' &&
      challenge &&
      tokenEsperado &&
      tokenRecebido === tokenEsperado
    ) {
      // Texto puro, não JSON — a Meta recusa o handshake se o corpo vier
      // envolto em aspas ou objeto.
      res.status(200).type('text/plain').send(challenge);
      return;
    }
    res.status(403).send();
  }

  // ----------------------------------------------------------------------
  // Eventos
  // ----------------------------------------------------------------------

  @Post('webhook/:empresaId')
  async webhook(
    @Param('empresaId') empresaId: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') assinatura: string | undefined,
    @Res() res: Response,
  ) {
    const ctx = await this.autenticar(empresaId, req.rawBody, assinatura);
    if (!ctx) {
      res.status(401).send();
      return;
    }

    const corpo = req.body as unknown;
    let gravadas = 0;
    let recibos = 0;

    for (const entry of this.lista(corpo, 'entry')) {
      for (const change of this.lista(entry, 'changes')) {
        const valor = this.objeto(change, 'value');
        if (!valor) continue;

        for (const mensagem of this.lista(valor, 'messages')) {
          try {
            if (await this.tratarMensagem(ctx, mensagem)) gravadas += 1;
          } catch (erro) {
            // Uma mensagem problemática não pode derrubar o lote nem fazer a
            // Meta reentregar o webhook inteiro.
            this.logger.error(
              `Falha ao processar mensagem da empresa ${empresaId}: ` +
                `${erro instanceof Error ? erro.message : String(erro)}`,
            );
          }
        }

        for (const status of this.lista(valor, 'statuses')) {
          try {
            if (await this.tratarStatus(ctx, status)) recibos += 1;
          } catch (erro) {
            this.logger.error(
              `Falha ao processar status da empresa ${empresaId}: ` +
                `${erro instanceof Error ? erro.message : String(erro)}`,
            );
          }
        }
      }
    }

    // Sempre 200, inclusive quando não havia nada a tratar (ex.: só
    // `contacts`, sem `messages`/`statuses`) — a Meta reentrega em erro, e um
    // tipo de evento sem tratamento não é uma falha.
    res.status(200).json({ ok: true, gravadas, recibos });
  }

  // ----------------------------------------------------------------------
  // Autenticação
  // ----------------------------------------------------------------------

  /**
   * Resolve o contexto da sessão institucional e confere a assinatura.
   *
   * A empresa vem da URL (não é segredo — mesma razão do controller da
   * Evolution GO), e quem autentica de verdade é o HMAC do corpo bruto com o
   * App Secret, que só a Meta e esta empresa conhecem.
   */
  private async autenticar(
    empresaId: string,
    rawBody: Buffer | undefined,
    assinatura: string | undefined,
  ): Promise<ContextoSessao | null> {
    const sessao = await this.sessoes.daEmpresa(empresaId).catch(() => null);
    if (!sessao || sessao.transporte !== 'cloud_api') return null;

    const ctx = await this.provedores
      .contexto(empresaId, sessao.id)
      .catch(() => null);
    if (!ctx) return null;

    if (
      !this.assinaturaValida(ctx.config.cloudApiAppSecret, rawBody, assinatura)
    ) {
      return null;
    }
    return ctx;
  }

  /** Comparação em tempo constante — mesmo cuidado do controller da Evolution GO. */
  private assinaturaValida(
    appSecret: string | null,
    rawBody: Buffer | undefined,
    assinatura: string | undefined,
  ): boolean {
    if (!appSecret || !rawBody || !assinatura) return false;
    const recebido = assinatura.replace(/^sha256=/, '');
    const esperado = createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex');

    const a = Buffer.from(esperado, 'utf8');
    const b = Buffer.from(recebido, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  // ----------------------------------------------------------------------
  // Mensagens
  // ----------------------------------------------------------------------

  private async tratarMensagem(
    ctx: ContextoSessao,
    bruta: unknown,
  ): Promise<boolean> {
    const externoId = this.texto(bruta, 'id');
    const telefone = this.texto(bruta, 'from');
    if (!externoId || !telefone) return false;

    const tipo = this.texto(bruta, 'type') ?? 'text';
    const conteudo = this.objeto(bruta, tipo);

    // A mídia em si não é baixada: a Cloud API entrega só o `id` do arquivo,
    // e buscá-lo exigiria uma segunda chamada (`GET /{media-id}` → URL
    // temporária → download) — deixado fora desta primeira versão. A
    // mensagem grava tipo e nome/mime quando presentes; o anexo em si fica
    // pendente, mesmo raciocínio de "não implementado", não "quebrado".
    const resposta = await this.conversas.receber({
      sessaoId: ctx.sessaoId,
      empresaId: ctx.empresaId,
      externoId,
      // A Cloud API não tem "jid" — o telefone já é o identificador. Mantém
      // o formato que o resto do módulo espera (dígitos, sem sufixo).
      jid: telefone,
      telefone,
      minha: false,
      nomeExibicao: null,
      texto: this.textoDaMensagem(tipo, conteudo),
      tipo: this.tipoDaMensagem(tipo),
      arquivoNome: this.texto(conteudo, 'filename'),
      arquivoMime: this.texto(conteudo, 'mime_type'),
      respondeuA: this.texto(bruta, 'context.id'),
    });

    return resposta.gravada === true;
  }

  private textoDaMensagem(
    tipo: string,
    conteudo: Record<string, unknown> | null,
  ): string | null {
    if (tipo === 'text') return this.texto(conteudo, 'body');
    // Legenda de mídia — mesmo campo nos quatro tipos de anexo da Cloud API.
    return this.texto(conteudo, 'caption');
  }

  private tipoDaMensagem(
    tipo: string,
  ):
    | 'texto'
    | 'imagem'
    | 'video'
    | 'audio'
    | 'documento'
    | 'localizacao'
    | 'contato'
    | 'outro' {
    switch (tipo) {
      case 'text':
        return 'texto';
      case 'image':
        return 'imagem';
      case 'video':
        return 'video';
      case 'audio':
        return 'audio';
      case 'document':
      case 'sticker':
        return 'documento';
      case 'location':
        return 'localizacao';
      case 'contacts':
        return 'contato';
      default:
        return 'outro';
    }
  }

  // ----------------------------------------------------------------------
  // Recibos
  // ----------------------------------------------------------------------

  private async tratarStatus(
    ctx: ContextoSessao,
    bruto: unknown,
  ): Promise<boolean> {
    const externoId = this.texto(bruto, 'id');
    const statusBruto = this.texto(bruto, 'status');
    const status: 'entregue' | 'lida' | null =
      statusBruto === 'read'
        ? 'lida'
        : statusBruto === 'delivered'
          ? 'entregue'
          : null;
    if (!externoId || !status) return false;

    const resultado = await this.conversas.receberRecibo({
      sessaoId: ctx.sessaoId,
      empresaId: ctx.empresaId,
      externoIds: [externoId],
      status,
    });
    return resultado.atualizadas > 0;
  }

  // ----------------------------------------------------------------------
  // Leitura tolerante do payload
  //
  // Diferente da Evolution GO, o formato da Cloud API é documentado e
  // estável — os caminhos abaixo são fixos, não uma lista de alternativas.
  // ----------------------------------------------------------------------

  private texto(fonte: unknown, caminho: string): string | null {
    let atual: unknown = fonte;
    for (const parte of caminho.split('.')) {
      if (atual === null || typeof atual !== 'object') return null;
      atual = (atual as Record<string, unknown>)[parte];
    }
    if (typeof atual === 'string' && atual.trim()) return atual;
    if (typeof atual === 'number') return String(atual);
    return null;
  }

  private objeto(
    fonte: unknown,
    chave: string,
  ): Record<string, unknown> | null {
    if (!fonte || typeof fonte !== 'object') return null;
    const valor = (fonte as Record<string, unknown>)[chave];
    return valor && typeof valor === 'object' && !Array.isArray(valor)
      ? (valor as Record<string, unknown>)
      : null;
  }

  private lista(fonte: unknown, chave: string): unknown[] {
    if (!fonte || typeof fonte !== 'object') return [];
    const valor = (fonte as Record<string, unknown>)[chave];
    return Array.isArray(valor) ? valor : [];
  }
}
