"use client";

import { Bot } from "lucide-react";
import { IconeWhatsapp } from "@/components/ui/icone-whatsapp";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAgenteUiStore } from "@/stores/agente-ui-store";
import { useAgente } from "@/components/agente/use-agente";
import {
  useAtendimentoDisponivel,
  useNaoLidasWhatsapp,
} from "@/components/whatsapp/atendimento-cliente-janela";
import { useAtendimentoJanelaStore } from "@/stores/atendimento-janela-store";
import {
  AgenteIndicador,
  rotuloAgente,
} from "@/components/agente/agente-indicador";

/**
 * O assistente na barra de ferramentas, ao lado do sino.
 *
 * É a única porta de entrada do assistente: para quem usa o sistema o dia
 * inteiro, procurar o assistente onde já estão o sino e a busca é mais natural
 * do que num botão solto no canto da tela — que ainda pousava sobre a coluna de
 * ações das listagens. A janela é a mesma (`AgenteFab`); daqui só se manda
 * abrir.
 *
 * Mostra o aviso do que chegou escondido: âmbar com "!" quando há ação parada
 * esperando o Confirmar, ponto verde quando é só resposta nova.
 */
export function AgenteBotaoTopbar() {
  const { disponivel, nomeAgente } = useAgente();
  const aberto = useAgenteUiStore((s) => s.aberto);
  const novidade = useAgenteUiStore((s) => s.novidade);
  const pendente = useAgenteUiStore((s) => s.pendente);
  const abrir = useAgenteUiStore((s) => s.abrir);
  const minimizar = useAgenteUiStore((s) => s.minimizar);

  // A janela também abriga o atendimento de WhatsApp: sem o agente, o ícone
  // continua sendo o caminho de volta para a conversa minimizada.
  const whatsappDisponivel = useAtendimentoDisponivel();
  // As conversas não lidas contam aqui, e não no sino (decisão de 2026-10-08).
  const naoLidas = useNaoLidasWhatsapp(whatsappDisponivel);
  const setAba = useAgenteUiStore((s) => s.setAba);
  const voltarParaLista = useAtendimentoJanelaStore((s) => s.limpar);
  if (!disponivel && !whatsappDisponivel) return null;
  const rotulo = disponivel ? nomeAgente : "Atendimento WhatsApp";
  // Com conversa esperando, o clique leva direto à lista de conversas.
  const abrirJanela = () => {
    if (naoLidas > 0) {
      voltarParaLista();
      setAba("whatsapp");
    }
    abrir();
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          // Com a janela aberta o mesmo ícone a recolhe: clicar de novo no
          // botão que abriu é o que a mão espera.
          onClick={aberto ? minimizar : abrirJanela}
          aria-label={
            aberto ? "Minimizar assistente" : rotuloAgente(pendente, novidade)
          }
        >
          {disponivel ? (
            <Bot className="size-4.5" />
          ) : (
            <IconeWhatsapp className="size-4.5 text-[#00A884]" />
          )}
          {!aberto && (pendente || novidade) && (
            <AgenteIndicador pendente={pendente} />
          )}
          {naoLidas > 0 ? (
            <span
              className="absolute -right-1 -bottom-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#00A884] px-1 text-[10px] font-semibold leading-none text-white"
              aria-label={`${naoLidas} conversa(s) de WhatsApp não lida(s)`}
            >
              {naoLidas > 99 ? "99+" : naoLidas}
            </span>
          ) : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{rotulo}</TooltipContent>
    </Tooltip>
  );
}
