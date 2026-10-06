import { randomUUID } from 'node:crypto';
import type { WhatsappInterativo } from '@plataforma/contracts';
import { mensagemComAutor } from './mensagem-com-autor';

/**
 * Funções puras das mensagens interativas (botões, lista, enquete…) — o que
 * acontece entre o contrato validado e o envio à Evolution GO.
 */

/**
 * Preenche o `id` de botão de resposta e de linha de lista que vierem sem.
 *
 * É o id que o evento `ButtonClick` devolve quando o cliente toca: sem ele não
 * há como saber qual opção foi escolhida. Prefixo curto e aleatório, para não
 * colidir entre mensagens da mesma conversa.
 */
export function prepararInterativo(m: WhatsappInterativo): WhatsappInterativo {
  const novoId = () => `op-${randomUUID().slice(0, 8)}`;
  if (m.tipo === 'botoes') {
    return {
      ...m,
      botoes: m.botoes.map((b) =>
        b.tipo === 'resposta' ? { ...b, id: b.id || novoId() } : b,
      ),
    };
  }
  if (m.tipo === 'lista') {
    return {
      ...m,
      secoes: m.secoes.map((s) => ({
        ...s,
        linhas: s.linhas.map((l) => ({ ...l, id: l.id || novoId() })),
      })),
    };
  }
  return m;
}

/**
 * A versão que vai ao aparelho do cliente, assinada com o nome de quem enviou
 * — o mesmo `*Nome:*` do texto comum. Só onde há um corpo de texto livre:
 * botões, lista e link. Enquete, localização e contato não têm onde assinar.
 */
export function assinarInterativo(
  nome: string,
  m: WhatsappInterativo,
): WhatsappInterativo {
  if (m.tipo === 'botoes' || m.tipo === 'lista' || m.tipo === 'link') {
    return { ...m, texto: mensagemComAutor(nome, m.texto) };
  }
  return m;
}

/**
 * Texto legível gravado em `conteudo`: é o que a prévia da lista, a busca e o
 * agente de IA leem, sem precisar entender o JSON de `interativo`.
 */
export function resumoInterativo(m: WhatsappInterativo): string {
  switch (m.tipo) {
    case 'botoes':
      return [
        m.titulo,
        m.texto,
        m.botoes
          .map((b) => (b.tipo === 'pix' ? `[PIX ${b.nome}]` : `[${b.texto}]`))
          .join(' '),
      ]
        .filter(Boolean)
        .join('\n');
    case 'lista':
      return [
        m.titulo,
        m.texto,
        m.secoes
          .flatMap((s) => s.linhas.map((l) => `• ${l.titulo}`))
          .join('\n'),
      ]
        .filter(Boolean)
        .join('\n');
    case 'enquete':
      return `📊 ${m.pergunta}\n${m.opcoes.map((o) => `○ ${o}`).join('\n')}`;
    case 'localizacao':
      return `📍 ${m.nome} — ${m.endereco}`;
    case 'contato':
      return `👤 ${m.nome} (${m.telefone})${m.empresa ? ` — ${m.empresa}` : ''}`;
    case 'link':
      return m.texto;
  }
}

/**
 * Tipo gravado em `whatsapp_mensagens.tipo`. Localização e contato já
 * existiam como tipos de mensagem recebida; o resto é novo.
 */
export function tipoDoInterativo(
  m: WhatsappInterativo,
): 'botoes' | 'lista' | 'enquete' | 'localizacao' | 'contato' | 'link' {
  return m.tipo;
}
