import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { ZapoTransport } from './transport/zapo.transport';
import type {
  EstadoSessao,
  MensagemRecebida,
  WhatsappTransport,
} from './transport/whatsapp-transport';

/**
 * Worker de sessões de WhatsApp.
 *
 * Existe separado da API por uma razão só, mas decisiva: **cada sessão é um
 * WebSocket vivo e com estado.** A API sobe e desce a cada deploy e roda em
 * réplicas; duas réplicas com a mesma sessão fazem o WhatsApp derrubar uma
 * delas. Aqui é uma réplica só, de propósito.
 *
 * HTTP cru em vez de framework: são quatro rotas internas, e uma dependência a
 * menos num processo que já carrega a biblioteca de WhatsApp.
 */

const PORTA = Number(process.env.PORT ?? 3100);
const TOKEN = process.env.WHATSAPP_WORKER_TOKEN ?? '';
const API_URL = process.env.API_URL ?? 'http://api:3001';
const DATABASE_URL = process.env.DATABASE_URL ?? '';

if (!DATABASE_URL) {
  console.error('DATABASE_URL não configurada — o worker não sobe sem persistir sessão.');
  process.exit(1);
}
if (!TOKEN) {
  // Sem token qualquer um na rede interna fala pelo WhatsApp dos vendedores.
  console.error('WHATSAPP_WORKER_TOKEN não configurado — recusando subir.');
  process.exit(1);
}

const transporte: WhatsappTransport = new ZapoTransport(DATABASE_URL);

/**
 * Chamada à API interna.
 *
 * O `/v1` é obrigatório: a API usa versionamento por URI
 * (`enableVersioning({ type: URI, defaultVersion: '1' })`). Sem ele a chamada
 * morre num 404 silencioso — foi assim que a primeira versão perdeu todas as
 * mensagens recebidas.
 */
async function chamarApi<T>(
  caminho: string,
  opcoes: { metodo?: 'GET' | 'POST'; corpo?: unknown } = {},
): Promise<T> {
  const { metodo = 'GET', corpo } = opcoes;
  const resposta = await fetch(`${API_URL}/api/v1/whatsapp/interno${caminho}`, {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${TOKEN}`,
    },
    ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
  });
  if (!resposta.ok) {
    throw new Error(`API respondeu ${resposta.status} em ${caminho}`);
  }
  return (await resposta.json()) as T;
}

/**
 * Entrega a mensagem recebida para a API, que decide se grava — a regra de
 * "só conversa de contato vinculado a cliente" vive lá, junto do cadastro.
 */
transporte.aoReceber(async (msg: MensagemRecebida) => {
  try {
    await chamarApi('/mensagem', { metodo: 'POST', corpo: msg });
  } catch (erro) {
    console.error('Falha ao entregar mensagem para a API', erro);
  }
});

/**
 * Repassa mudança de estado da conexão.
 *
 * O que muda por aqui é o que **ninguém pediu**: o socket caiu, o vendedor
 * removeu o aparelho pelo celular, o número foi bloqueado. Sem este aviso o
 * banco continua dizendo "conectada" e a tela mente para o vendedor enquanto
 * nenhuma mensagem chega.
 */
transporte.aoMudarEstado(async (estado: EstadoSessao) => {
  // Sessão sem tenant conhecido não tem como ser gravada — as tabelas têm RLS.
  if (!estado.empresaId) return;
  try {
    await chamarApi('/sessao-estado', {
      metodo: 'POST',
      corpo: {
        sessaoId: estado.sessaoId,
        empresaId: estado.empresaId,
        status: estado.status,
        numero: estado.numero,
        erro: estado.erro,
      },
    });
  } catch (erro) {
    console.error(`Falha ao avisar estado da sessão ${estado.sessaoId}`, erro);
  }
});

/**
 * Reabre no boot as sessões que a API diz estarem ativas.
 *
 * Sem isto **todo deploy derruba o atendimento de todos os vendedores** até
 * cada um reconectar na mão. As credenciais já estão persistidas, então
 * reabrir não pede QR — só faltava alguém mandar reabrir.
 *
 * O retry existe porque o worker e a API sobem juntos: na primeira tentativa
 * a API costuma ainda estar aplicando migration.
 */
async function restaurarSessoes(tentativa = 1): Promise<void> {
  const MAX_TENTATIVAS = 10;
  try {
    const sessoes = await chamarApi<{ sessaoId: string; empresaId: string }[]>(
      '/sessoes-ativas',
    );
    console.log(`Restaurando ${sessoes.length} sessão(ões) de WhatsApp`);
    for (const sessao of sessoes) {
      // Em paralelo e sem `await`: uma sessão cuja credencial não vale mais
      // fica presa pedindo QR, e não pode segurar as outras.
      void transporte
        .iniciar(sessao.sessaoId, sessao.empresaId)
        .catch((erro: unknown) =>
          console.error(`Falha ao restaurar a sessão ${sessao.sessaoId}`, erro),
        );
    }
  } catch (erro) {
    if (tentativa >= MAX_TENTATIVAS) {
      console.error(
        'Desisti de restaurar as sessões — os vendedores terão de reconectar na mão.',
        erro,
      );
      return;
    }
    const espera = Math.min(2000 * 2 ** (tentativa - 1), 60_000);
    console.warn(
      `API indisponível para restaurar sessões (tentativa ${tentativa}); nova tentativa em ${Math.round(espera / 1000)}s`,
    );
    setTimeout(() => void restaurarSessoes(tentativa + 1), espera).unref?.();
  }
}

function json(res: ServerResponse, status: number, corpo: unknown) {
  const texto = JSON.stringify(corpo);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(texto),
  });
  res.end(texto);
}

async function lerCorpo(req: IncomingMessage): Promise<any> {
  const partes: Buffer[] = [];
  for await (const parte of req) partes.push(parte as Buffer);
  if (partes.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(partes).toString('utf8'));
  } catch {
    return {};
  }
}

const servidor = createServer(async (req, res) => {
  if (req.headers.authorization !== `Bearer ${TOKEN}`) {
    return json(res, 401, { erro: 'não autorizado' });
  }

  const url = new URL(req.url ?? '/', 'http://worker');
  const partes = url.pathname.split('/').filter(Boolean);

  try {
    // POST /sessoes  { sessaoId }
    if (req.method === 'POST' && partes.length === 1 && partes[0] === 'sessoes') {
      const corpo = await lerCorpo(req);
      if (!corpo.sessaoId || !corpo.empresaId) {
        return json(res, 400, { erro: 'sessaoId e empresaId obrigatórios' });
      }
      await transporte.iniciar(String(corpo.sessaoId), String(corpo.empresaId));
      return json(res, 200, transporte.estado(String(corpo.sessaoId)));
    }

    // GET /sessoes/:id/pareamento
    if (
      req.method === 'GET' &&
      partes.length === 3 &&
      partes[0] === 'sessoes' &&
      partes[2] === 'pareamento'
    ) {
      return json(res, 200, transporte.estado(partes[1]));
    }

    // DELETE /sessoes/:id
    if (req.method === 'DELETE' && partes.length === 2 && partes[0] === 'sessoes') {
      await transporte.desconectar(partes[1]);
      return json(res, 200, { ok: true });
    }

    // POST /sessoes/:id/mensagens  { jid, texto }
    if (
      req.method === 'POST' &&
      partes.length === 3 &&
      partes[0] === 'sessoes' &&
      partes[2] === 'mensagens'
    ) {
      const corpo = await lerCorpo(req);
      if (!corpo.jid || !corpo.texto) {
        return json(res, 400, { erro: 'jid e texto obrigatórios' });
      }
      const enviado = await transporte.enviarTexto(
        partes[1],
        String(corpo.jid),
        String(corpo.texto),
      );
      return json(res, 200, enviado);
    }

    if (req.method === 'GET' && url.pathname === '/saude') {
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { erro: 'rota desconhecida' });
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    console.error(`${req.method} ${url.pathname}: ${motivo}`);
    return json(res, 500, { erro: motivo });
  }
});

servidor.listen(PORTA, () => {
  console.log(`whatsapp-worker ouvindo na porta ${PORTA}`);
  void restaurarSessoes();
});
