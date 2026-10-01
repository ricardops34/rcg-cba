"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Barcode, FileDown, FileText, Loader2, Mail, MessageSquareText } from "lucide-react";
import type {
  EnvioEmailResultado,
  EnvioSmsResultado,
  EmailDisponibilidade,
  SmsDisponibilidade,
} from "@plataforma/contracts";
import { apiDownload, ApiError, apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

/**
 * Envio por e-mail ao cliente — sempre para o e-mail do cadastro dele; a API
 * não aceita outro destinatário. Confirma antes (é um envio para fora) e
 * avisa para onde foi e o que não pôde ir.
 */
export function useEnvioPorEmail() {
  const queryClient = useQueryClient();
  const [enviando, setEnviando] = useState(false);

  const enviar = async (
    caminho: string,
    body: Record<string, unknown> | undefined,
    pergunta: string,
  ) => {
    if (!confirm(`${pergunta}

O e-mail vai para o endereço do cadastro do cliente.`)) return;
    setEnviando(true);
    try {
      const r = await apiFetch<EnvioEmailResultado>(caminho, { method: "POST", body });
      toast.success(`Enviado para ${r.enviadoPara.join(", ")}`, {
        description: r.avisos.length ? r.avisos.join(" · ") : undefined,
      });
      // O envio entra no histórico de atendimento do cliente.
      void queryClient.invalidateQueries({ queryKey: ["atividades"] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível enviar o e-mail");
    } finally {
      setEnviando(false);
    }
  };

  return { enviar, enviando };
}

/**
 * O que de SMS esta empresa usa. Cada botão de SMS só aparece com o SMS
 * habilitado (SMS_ATIVO e token) e a funcionalidade dele ligada — a tela não
 * oferece o que a empresa não contratou ou desligou.
 */
export function useEmailDisponivel(): EmailDisponibilidade | undefined {
  const { data } = useQuery({
    queryKey: ["email", "disponivel"],
    queryFn: () => apiFetch<EmailDisponibilidade>("/email/disponivel"),
    staleTime: 5 * 60_000,
  });
  return data;
}

export function useSmsDisponivel(): SmsDisponibilidade | undefined {
  const { data } = useQuery({
    queryKey: ["sms", "disponivel"],
    queryFn: () => apiFetch<SmsDisponibilidade>("/sms/disponivel"),
    staleTime: 5 * 60_000,
  });
  return data;
}

/**
 * Envio por SMS ao cliente — sempre para o celular do cadastro. Mesmo
 * comportamento do e-mail: confirma, avisa para onde foi, entra no histórico.
 */
export function useEnvioPorSms() {
  const queryClient = useQueryClient();
  const [enviando, setEnviando] = useState(false);

  const enviar = async (
    caminho: string,
    body: Record<string, unknown> | undefined,
    pergunta: string | null,
  ): Promise<boolean> => {
    if (pergunta && !confirm(`${pergunta}

O SMS vai para o celular do cadastro do cliente.`)) {
      return false;
    }
    setEnviando(true);
    try {
      const r = await apiFetch<EnvioSmsResultado>(caminho, { method: "POST", body });
      toast.success(`SMS enviado para ${r.celular}`, { description: r.mensagem });
      void queryClient.invalidateQueries({ queryKey: ["atividades"] });
      return true;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível enviar o SMS");
      return false;
    } finally {
      setEnviando(false);
    }
  };

  return { enviar, enviando };
}

function BotaoEmail({
  rotulo,
  motivoIndisponivel,
  onEnviar,
  enviando,
  icone,
}: {
  rotulo: string;
  motivoIndisponivel: string | null;
  onEnviar: () => void;
  enviando: boolean;
  /** Envelope por padrão; o SMS usa o balão. */
  icone?: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span onClick={semPropagar}>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={!!motivoIndisponivel || enviando}
            onClick={(ev) => {
              semPropagar(ev);
              onEnviar();
            }}
            aria-label={rotulo}
          >
            {enviando ? <Loader2 className="size-4 animate-spin" /> : (icone ?? <Mail className="size-4" />)}
          </Button>
        </span>
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
  const { enviar, enviando } = useEnvioPorEmail();
  const emailDocumentos = useEmailDisponivel()?.documentos ?? false;

  return (
    <div className="flex justify-end gap-0.5">
      {emailDocumentos && (
      <BotaoEmail
        rotulo="Enviar DANFE e XML por e-mail ao cliente"
        motivoIndisponivel={motivo}
        enviando={enviando}
        onEnviar={() =>
          void enviar(
            `/documentos-email/nota/${notaId}`,
            { incluirXml: true },
            `Enviar o DANFE e o XML da NF ${numero} por e-mail?`,
          )
        }
      />
      )}
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
  const [baixando, setBaixando] = useState(false);
  const queryClient = useQueryClient();

  // O motivo mais provável varia com o status, e dizer o certo evita o
  // chamado: título baixado não tem boleto; vencido sem botão quase sempre
  // passou dos 30 dias; o resto é falta de registro no ERP.
  const motivo = temBoleto
    ? null
    : status === "baixado"
      ? "Sem número do banco ou convênio de cobrança."
      : status === "vencido"
        ? "Vencido além do prazo permitido de reemissão, ou sem registro bancário no ERP."
        : "Título sem nosso número do banco, ou sem conta de cobrança padrão cadastrada.";

  const baixarBoleto = async (ev: React.MouseEvent, atualizado: boolean) => {
    semPropagar(ev);
    setBaixando(true);
    try {
      const sulfix = atualizado ? "?atualizado=true" : "?atualizado=false";
      const sufixoNome = atualizado ? "-atualizado" : "-original";
      await apiDownload(`/titulos-receber/${tituloId}/boleto${sulfix}`, `boleto-${numero}${sufixoNome}.pdf`);
      void queryClient.invalidateQueries({ queryKey: ["atividades"] });
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Não foi possível gerar o boleto",
      );
    } finally {
      setBaixando(false);
    }
  };

  const { enviar, enviando } = useEnvioPorEmail();
  const sms = useEnvioPorSms();
  const smsBoleto = useSmsDisponivel()?.boleto ?? false;
  const emailBoleto = useEmailDisponivel()?.boleto ?? false;
  const enviarBoletoSms = (atualizado: boolean) =>
    void sms.enviar(
      `/sms/titulo/${tituloId}`,
      { atualizado },
      `Enviar por SMS o valor${atualizado ? " atualizado" : ""} e a linha digitável do título ${numero}?`,
    );
  const enviarBoleto = (atualizado: boolean) =>
    void enviar(
      `/documentos-email/titulo/${tituloId}`,
      { atualizado },
      `Enviar o boleto ${atualizado ? "atualizado" : "original"} do título ${numero} por e-mail?`,
    );

  if (!temBoleto || status !== "vencido") {
    return (
      <div className="flex justify-end gap-0.5">
        {emailBoleto && (
          <BotaoEmail
            rotulo="Enviar boleto por e-mail ao cliente"
            motivoIndisponivel={motivo}
            enviando={enviando}
            onEnviar={() => enviarBoleto(true)}
          />
        )}
        {smsBoleto && (
          <BotaoEmail
            rotulo="Enviar boleto por SMS ao cliente"
            motivoIndisponivel={motivo}
            enviando={sms.enviando}
            icone={<MessageSquareText className="size-4" />}
            onEnviar={() => enviarBoletoSms(true)}
          />
        )}
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

  return (
    <div className="flex justify-end" onClick={semPropagar}>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" disabled={baixando}>
                {baixando ? <Loader2 className="size-4 animate-spin" /> : <Barcode className="size-4 text-amber-600 dark:text-amber-400" />}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Opções de emissão do boleto (vencido)</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" onClick={semPropagar}>
          <DropdownMenuItem onClick={(ev) => baixarBoleto(ev, true)}>
            Boleto Atualizado (com juros/multa)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(ev) => baixarBoleto(ev, false)}>
            Boleto Original (sem encargos)
          </DropdownMenuItem>
          {emailBoleto && (
            <>
              <DropdownMenuItem disabled={enviando} onClick={() => enviarBoleto(true)}>
                <Mail className="size-4" /> Enviar atualizado por e-mail
              </DropdownMenuItem>
              <DropdownMenuItem disabled={enviando} onClick={() => enviarBoleto(false)}>
                <Mail className="size-4" /> Enviar original por e-mail
              </DropdownMenuItem>
            </>
          )}
          {smsBoleto && (
            <>
              <DropdownMenuItem disabled={sms.enviando} onClick={() => enviarBoletoSms(true)}>
                <MessageSquareText className="size-4" /> Enviar atualizado por SMS
              </DropdownMenuItem>
              <DropdownMenuItem disabled={sms.enviando} onClick={() => enviarBoletoSms(false)}>
                <MessageSquareText className="size-4" /> Enviar original por SMS
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
