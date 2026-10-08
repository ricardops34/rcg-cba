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
 * O assistente (e o atendimento de WhatsApp) na barra de ferramentas, ao lado
 * do sino.
 *
 * É a única porta de entrada da janela: para quem usa o sistema o dia
 * inteiro, procurar o assistente onde já estão o sino e a busca é mais natural
 * do que num botão solto no canto da tela — que ainda pousava sobre a coluna
 * de ações das listagens. A janela é a mesma (`AgenteFab`); daqui só se manda
 * abrir, numa aba ou na outra.
 *
 * **Um ícone por aba quando as duas existem** (decisão de 2026-10-08): um
 * ícone só, trocando de desenho conforme a aba ativa, escondia o que tinha
 * novidade em qual — clicava no Bot e caía na lista de conversas do WhatsApp,
 * sem aviso. Com uma só aba disponível, o botão continua sozinho e já abre
 * nela.
 */
export function AgenteBotaoTopbar() {
  const { disponivel, nomeAgente } = useAgente();
  const aberto = useAgenteUiStore((s) => s.aberto);
  const aba = useAgenteUiStore((s) => s.aba);
  const novidade = useAgenteUiStore((s) => s.novidade);
  const pendente = useAgenteUiStore((s) => s.pendente);
  const abrir = useAgenteUiStore((s) => s.abrir);
  const minimizar = useAgenteUiStore((s) => s.minimizar);
  const setAba = useAgenteUiStore((s) => s.setAba);

  const whatsappDisponivel = useAtendimentoDisponivel();
  // As conversas não lidas contam aqui, e não no sino (decisão de 2026-10-08).
  const naoLidas = useNaoLidasWhatsapp(whatsappDisponivel);
  const voltarParaLista = useAtendimentoJanelaStore((s) => s.limpar);

  if (!disponivel && !whatsappDisponivel) return null;

  const abrirEm = (destino: "bia" | "whatsapp") => {
    // Já aberto nesta aba: o clique recolhe — é o botão que abriu.
    if (aberto && aba === destino) {
      minimizar();
      return;
    }
    // Conversa esperando: o clique leva direto à lista, não à última aberta.
    if (destino === "whatsapp" && naoLidas > 0) voltarParaLista();
    setAba(destino);
    abrir();
  };

  const ambas = disponivel && whatsappDisponivel;

  if (!ambas) {
    // Só uma aba existe: um ícone, que já é a porta de entrada dela.
    const destino = disponivel ? "bia" : "whatsapp";
    const rotulo = disponivel ? nomeAgente : "Atendimento WhatsApp";
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            onClick={() => abrirEm(destino)}
            aria-label={
              aberto && aba === destino
                ? `Minimizar ${rotulo.toLowerCase()}`
                : destino === "bia"
                  ? rotuloAgente(pendente, novidade)
                  : rotulo
            }
          >
            {destino === "bia" ? (
              <Bot className="size-4.5" />
            ) : (
              <IconeWhatsapp className="size-4.5 text-[#00A884]" />
            )}
            {destino === "bia" && !aberto && (pendente || novidade) && (
              <AgenteIndicador pendente={pendente} />
            )}
            {destino === "whatsapp" && naoLidas > 0 ? (
              <SeloNaoLidas naoLidas={naoLidas} />
            ) : null}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{rotulo}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="flex items-center gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={`relative ${aberto && aba === "bia" ? "bg-muted" : ""}`}
            onClick={() => abrirEm("bia")}
            aria-pressed={aberto && aba === "bia"}
            aria-label={
              aberto && aba === "bia"
                ? `Minimizar ${nomeAgente.toLowerCase()}`
                : rotuloAgente(pendente, novidade)
            }
          >
            <Bot className="size-4.5" />
            {!(aberto && aba === "bia") && (pendente || novidade) && (
              <AgenteIndicador pendente={pendente} />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{nomeAgente}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={`relative ${aberto && aba === "whatsapp" ? "bg-muted" : ""}`}
            onClick={() => abrirEm("whatsapp")}
            aria-pressed={aberto && aba === "whatsapp"}
            aria-label={
              aberto && aba === "whatsapp"
                ? "Minimizar atendimento WhatsApp"
                : "Atendimento WhatsApp"
            }
          >
            <IconeWhatsapp className="size-4.5 text-[#00A884]" />
            {naoLidas > 0 ? <SeloNaoLidas naoLidas={naoLidas} /> : null}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Atendimento WhatsApp</TooltipContent>
      </Tooltip>
    </div>
  );
}

function SeloNaoLidas({ naoLidas }: { naoLidas: number }) {
  return (
    <span
      className="absolute -right-1 -bottom-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#00A884] px-1 text-[10px] font-semibold leading-none text-white"
      aria-label={`${naoLidas} conversa(s) de WhatsApp não lida(s)`}
    >
      {naoLidas > 99 ? "99+" : naoLidas}
    </span>
  );
}
