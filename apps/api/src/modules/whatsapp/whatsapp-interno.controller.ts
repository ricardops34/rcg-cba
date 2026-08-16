import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { WhatsappConversasService } from './whatsapp-conversas.service';
import { WhatsappSessaoService } from './whatsapp-sessao.service';

/**
 * Rota interna, falada **só pelo worker** — não por navegador.
 *
 * Fora do `JwtAuthGuard` de propósito: quem chama é um serviço, não um usuário
 * logado. A autenticação é o segredo compartilhado `WHATSAPP_WORKER_TOKEN`, o
 * mesmo que a API usa para falar com o worker. Sem ele configurado, a rota
 * recusa tudo — nunca fica aberta "porque não tem token".
 *
 * Some do Swagger público: não é contrato para ninguém de fora.
 */
@ApiExcludeController()
@Controller('whatsapp/interno')
export class WhatsappInternoController {
  constructor(
    private readonly conversas: WhatsappConversasService,
    private readonly sessoes: WhatsappSessaoService,
  ) {}

  private conferirToken(authorization?: string) {
    const esperado = process.env.WHATSAPP_WORKER_TOKEN;
    if (!esperado || authorization !== `Bearer ${esperado}`) {
      throw new UnauthorizedException();
    }
  }

  /**
   * Sessões que o worker deve reabrir ao subir.
   *
   * Sem isto, todo reinício do worker (um deploy, por exemplo) derruba o
   * atendimento de **todos** os vendedores até cada um clicar em conectar de
   * novo. As credenciais já estão persistidas, então reabrir não pede QR — só
   * ninguém mandava reabrir.
   */
  @Get('sessoes-ativas')
  async sessoesAtivas(@Headers('authorization') authorization?: string) {
    this.conferirToken(authorization);
    return this.conversas.sessoesParaRestaurar();
  }

  /**
   * Estado da conexão vindo do worker.
   *
   * Vale para o que **ninguém pediu**: o socket caiu, o vendedor removeu o
   * aparelho pelo celular, o número foi bloqueado. Sem isso o banco guarda a
   * última intenção da tela, não a realidade, e o vendedor vê "conectado"
   * enquanto nada chega.
   */
  @Post('sessao-estado')
  estado(
    @Body()
    corpo: {
      sessaoId: string;
      empresaId: string;
      status: string;
      numero: string | null;
      erro: string | null;
    },
    @Headers('authorization') authorization?: string,
  ) {
    this.conferirToken(authorization);
    return this.sessoes.registrarEstado(corpo.empresaId, corpo.sessaoId, {
      status: corpo.status,
      numero: corpo.numero,
      erro: corpo.erro,
    });
  }

  @Post('mensagem')
  receber(
    @Body()
    corpo: {
      sessaoId: string;
      empresaId: string;
      externoId: string;
      jid: string;
      nomeExibicao: string | null;
      texto: string | null;
      tipo: string;
      arquivoNome?: string | null;
      arquivoMime?: string | null;
      respondeuA?: string | null;
    },
    @Headers('authorization') authorization?: string,
  ) {
    this.conferirToken(authorization);
    return this.conversas.receber(corpo);
  }

  /**
   * Segundo passo do recebimento de mídia.
   *
   * O worker só chega aqui quando `mensagem` respondeu `arquivoNecessario` —
   * é isso que impede o download de mídia de conversa que a plataforma
   * decidiu não gravar.
   */
  @Post('mensagem-arquivo')
  arquivo(
    @Body()
    corpo: {
      sessaoId: string;
      empresaId: string;
      externoId: string;
      nome: string | null;
      mime: string | null;
      conteudoBase64: string;
    },
    @Headers('authorization') authorization?: string,
  ) {
    this.conferirToken(authorization);
    return this.conversas.gravarArquivoRecebido(corpo);
  }
}
