"use client";

import { useParams } from "next/navigation";
import { PosicaoClienteConteudo } from "@/components/comercial/posicao-cliente-conteudo";

/**
 * Posição de Cliente — tela cheia.
 *
 * O conteúdo vive em `PosicaoClienteConteudo` porque o **atendimento por
 * WhatsApp mostra exatamente esta tela** no painel lateral: a consulta que o
 * vendedor faz no meio da conversa tem de ser a mesma da rotina, com as
 * mesmas abas, filtros e totais. Duas versões divergiriam na primeira
 * mudança.
 */
export default function PosicaoClienteDetalhePage() {
  const { id } = useParams<{ id: string }>();
  return <PosicaoClienteConteudo clienteId={id} />;
}
