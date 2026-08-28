import { Injectable } from '@nestjs/common';
import type { WhatsappTransporte } from '@plataforma/contracts';
import { WhatsappWorkerClient } from '../whatsapp-worker.client';
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
 * O transporte que já estava em produção, agora atrás do contrato de provedor.
 *
 * É deliberadamente uma casca fina: o protocolo do worker não mudou uma linha
 * nesta migração. Quem mantém as sessões, normaliza os eventos e conhece a
 * `zapo-js` continua sendo o `apps/whatsapp-worker` — trocar isso junto com a
 * entrada da Evolution GO significaria mexer no que funciona para acomodar o
 * que ainda não foi validado.
 *
 * Consequência prática: nada aqui grava instância. O worker identifica a
 * sessão pelo próprio `sessaoId`, então `iniciar` devolve `null` e a linha da
 * sessão fica sem os campos de instância — que são da Evolution.
 */
@Injectable()
export class ZapoProvider implements WhatsappProvider {
  readonly transporte: WhatsappTransporte = 'zapo';

  constructor(private readonly worker: WhatsappWorkerClient) {}

  private url(ctx: ContextoSessao): string | null {
    return ctx.config.workerUrl;
  }

  async iniciar(
    ctx: ContextoSessao,
    opcoes: { arquivarMensagens: boolean },
  ): Promise<DadosInstancia | null> {
    await this.worker.chamar(this.url(ctx), '/sessoes', {
      metodo: 'POST',
      // `empresaId` vai junto porque o worker precisa devolvê-lo nos eventos:
      // as tabelas têm RLS, e sem tenant no contexto a API não conseguiria
      // nem localizar a própria sessão.
      corpo: {
        sessaoId: ctx.sessaoId,
        empresaId: ctx.empresaId,
        transporte: 'zapo',
        arquivarMensagens: opcoes.arquivarMensagens,
      },
    });
    return null;
  }

  async pareamento(ctx: ContextoSessao): Promise<EstadoPareamento> {
    const estado = await this.worker.chamar<{
      status: string;
      qr: string | null;
      numero: string | null;
      erro: string | null;
    }>(this.url(ctx), `/sessoes/${ctx.sessaoId}/pareamento`);

    return {
      status: estado.status as EstadoPareamento['status'],
      qr: estado.qr,
      numero: estado.numero,
      erro: estado.erro,
    };
  }

  async desconectar(ctx: ContextoSessao): Promise<void> {
    await this.worker.chamar(this.url(ctx), `/sessoes/${ctx.sessaoId}`, {
      metodo: 'DELETE',
    });
  }

  /**
   * O worker encerra o cliente em memória, e é só isso que ele expõe.
   *
   * Aqui as três operações administrativas colapsam numa só, e é uma limitação
   * do transporte, não uma escolha: a `zapo-js` não separa "pausar a conexão"
   * de "sair do WhatsApp". Quem precisa da distinção usa a Evolution GO.
   */
  async sairDoWhatsapp(ctx: ContextoSessao): Promise<void> {
    await this.desconectar(ctx);
  }

  /**
   * Encerra o cliente. O material Signal persistido pelo
   * `@zapo-js/store-postgres` **não** é expurgado: a biblioteca não oferece a
   * operação, e afirmar exclusão definitiva sem tê-la feito seria pior do que
   * declarar o limite. Está registrado em `docs/whatsapp/`.
   */
  async removerInstancia(ctx: ContextoSessao): Promise<void> {
    await this.desconectar(ctx);
  }

  async enviarTexto(
    ctx: ContextoSessao,
    dados: { jid: string; texto: string; respondeuA?: string | null },
  ): Promise<{ externoId: string }> {
    return this.worker.chamar<{ externoId: string }>(
      this.url(ctx),
      `/sessoes/${ctx.sessaoId}/mensagens`,
      {
        metodo: 'POST',
        corpo: {
          jid: dados.jid,
          texto: dados.texto,
          respondeuA: dados.respondeuA ?? null,
        },
      },
    );
  }

  async enviarArquivo(
    ctx: ContextoSessao,
    dados: { jid: string; arquivo: ArquivoParaEnviar },
  ): Promise<{ externoId: string }> {
    const { arquivo } = dados;
    return this.worker.chamar<{ externoId: string }>(
      this.url(ctx),
      `/sessoes/${ctx.sessaoId}/arquivos`,
      {
        metodo: 'POST',
        corpo: {
          jid: dados.jid,
          tipo: arquivo.tipo,
          nome: arquivo.nome,
          mime: arquivo.mime,
          legenda: arquivo.legenda ?? null,
          ptt: arquivo.ptt ?? false,
          conteudoBase64: arquivo.conteudoBase64,
        },
      },
    );
  }

  async marcarLida(
    ctx: ContextoSessao,
    dados: { jid: string; externoId: string },
  ): Promise<void> {
    await this.worker.chamar(this.url(ctx), `/sessoes/${ctx.sessaoId}/lida`, {
      metodo: 'POST',
      corpo: { jid: dados.jid, externoId: dados.externoId },
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
    await this.worker.chamar(
      this.url(ctx),
      `/sessoes/${ctx.sessaoId}/reacoes`,
      {
        metodo: 'POST',
        corpo: {
          jid: dados.jid,
          alvoExternoId: dados.alvoExternoId,
          // O provedor precisa saber se a mensagem reagida saiu daqui para
          // localizá-la — é o `fromMe` da chave dela.
          alvoNosso: dados.alvoNosso,
          emoji: dados.emoji,
        },
      },
    );
  }

  async listarContatos(
    ctx: ContextoSessao,
    busca?: string,
  ): Promise<ContatoAparelho[]> {
    return this.worker.chamar<ContatoAparelho[]>(
      this.url(ctx),
      `/sessoes/${ctx.sessaoId}/contatos${busca ? `?busca=${encodeURIComponent(busca)}` : ''}`,
    );
  }

  async listarConversas(ctx: ContextoSessao): Promise<ContatoAparelho[]> {
    return this.worker.chamar<ContatoAparelho[]>(
      this.url(ctx),
      `/sessoes/${ctx.sessaoId}/conversas`,
    );
  }

  async obterFotoContato(
    ctx: ContextoSessao,
    jid: string,
  ): Promise<FotoContato | null> {
    return this.worker.chamar<FotoContato | null>(
      this.url(ctx),
      `/sessoes/${ctx.sessaoId}/contatos/foto?jid=${encodeURIComponent(jid)}`,
    );
  }

  async sincronizarAgenda(ctx: ContextoSessao): Promise<void> {
    await this.worker.chamar(
      this.url(ctx),
      `/sessoes/${ctx.sessaoId}/agenda/sincronizar`,
      { metodo: 'POST' },
    );
  }

  async importarHistorico(
    ctx: ContextoSessao,
    dias: number,
  ): Promise<{ encontradas: number; conversas: number }> {
    return this.worker.chamar<{ encontradas: number; conversas: number }>(
      this.url(ctx),
      `/sessoes/${ctx.sessaoId}/historico/importar`,
      { metodo: 'POST', corpo: { dias } },
    );
  }
}
