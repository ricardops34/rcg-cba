"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Barcode, FileDown, FileText, Loader2 } from "lucide-react";
import { apiDownload, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Botões de 2ª via — DANFE, XML e boleto.
 *
 * Vivem num componente só porque aparecem em três telas (Posição de Cliente,
 * Notas de Saída e Títulos a Receber) e precisam se comportar igual nas três:
 * mesmo estado de carregando, mesma mensagem quando o documento não existe.
 *
 * **O botão desabilitado é proposital, no lugar de escondido.** A pergunta do
 * vendedor não é "existe 2ª via?", é "por que não consigo mandar?" — o tooltip
 * responde isso. Esconder faria ele procurar o botão que não está lá.
 *
 * Quem decide se pode é o backend (`temXml` / `temBoleto`): a mesma condição
 * que a rota aplica. Duplicar a regra aqui faria a tela prometer um download
 * que a API recusa.
 */

/** Impede que o clique no botão abra a linha da tabela por trás. */
const semPropagar = (ev: React.MouseEvent) => ev.stopPropagation();

function BotaoDocumento({
  rotulo,
  motivoIndisponivel,
  icone,
  caminho,
  nomePadrao,
}: {
  rotulo: string;
  motivoIndisponivel: string | null;
  icone: React.ReactNode;
  caminho: string;
  nomePadrao: string;
}) {
  const [baixando, setBaixando] = useState(false);
  const queryClient = useQueryClient();

  const baixar = async (ev: React.MouseEvent) => {
    semPropagar(ev);
    setBaixando(true);
    try {
      await apiDownload(caminho, nomePadrao);
      // A emissão vira atividade concluída no histórico do cliente (mesma
      // convenção do PDF de orçamento) — a agenda aberta em outra aba precisa
      // refletir isso.
      void queryClient.invalidateQueries({ queryKey: ["atividades"] });
    } catch (err) {
      // O 409 traz o motivo exato (sem XML, sem nosso número, fora do prazo) —
      // é a mensagem que o vendedor precisa ler, não um "erro ao baixar".
      toast.error(
        err instanceof ApiError ? err.message : "Não foi possível gerar o documento",
      );
    } finally {
      setBaixando(false);
    }
  };

  const botao = (
    <Button
      variant="ghost"
      size="icon"
      className="size-8"
      disabled={!!motivoIndisponivel || baixando}
      onClick={baixar}
      aria-label={rotulo}
    >
      {baixando ? <Loader2 className="size-4 animate-spin" /> : icone}
    </Button>
  );

  return (
    <Tooltip>
      {/* Botão desabilitado não dispara eventos de mouse; o span é o que
          permite o tooltip explicar por que ele está assim. */}
      <TooltipTrigger asChild>
        <span onClick={semPropagar}>{botao}</span>
      </TooltipTrigger>
      <TooltipContent>{motivoIndisponivel ?? rotulo}</TooltipContent>
    </Tooltip>
  );
}

/** DANFE (e XML) de uma nota fiscal. */
export function SegundaViaNota({
  notaId,
  numero,
  temXml,
}: {
  notaId: string;
  numero: string;
  temXml: boolean;
}) {
  const motivo = temXml
    ? null
    : "O XML desta nota ainda não foi enviado pelo ERP — sem ele não há DANFE.";

  return (
    <div className="flex justify-end gap-0.5">
      <BotaoDocumento
        rotulo="Baixar DANFE"
        motivoIndisponivel={motivo}
        icone={<FileText className="size-4" />}
        caminho={`/notas-saida/${notaId}/danfe`}
        nomePadrao={`danfe-${numero}.pdf`}
      />
      <BotaoDocumento
        rotulo="Baixar XML"
        motivoIndisponivel={motivo}
        icone={<FileDown className="size-4" />}
        caminho={`/notas-saida/${notaId}/xml`}
        nomePadrao={`nfe-${numero}.xml`}
      />
      {/* XML ao lado do DANFE nas duas abas: o contador do cliente pede o
          arquivo tanto de venda quanto de remessa de comodato. */}
    </div>
  );
}

/** Boleto de um título a receber. */
export function SegundaViaTitulo({
  tituloId,
  numero,
  temBoleto,
  status,
}: {
  tituloId: string;
  numero: string;
  temBoleto: boolean;
  status: "aberto" | "vencido" | "baixado";
}) {
  // O motivo mais provável varia com o status, e dizer o certo evita o
  // chamado: título baixado não tem boleto; vencido sem botão quase sempre
  // passou dos 30 dias; o resto é falta de registro no ERP.
  const motivo = temBoleto
    ? null
    : status === "baixado"
      ? "Título já baixado — não há 2ª via de boleto pago."
      : status === "vencido"
        ? "Vencido há mais de 30 dias, ou sem registro bancário no ERP. Fale com o financeiro."
        : "Título sem nosso número do banco, ou sem conta de cobrança padrão cadastrada.";

  return (
    <div className="flex justify-end">
      <BotaoDocumento
        rotulo="Baixar boleto"
        motivoIndisponivel={motivo}
        icone={<Barcode className="size-4" />}
        caminho={`/titulos-receber/${tituloId}/boleto`}
        nomePadrao={`boleto-${numero}.pdf`}
      />
    </div>
  );
}
