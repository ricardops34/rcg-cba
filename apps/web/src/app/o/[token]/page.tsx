"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { apiFetch, assetUrl } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

type Situacao = "aberto" | "aprovado" | "recusado" | "revogado" | "vencido" | "pendente";

interface Proposta {
  numero: number | null;
  codigoErp: string | null;
  titulo: string;
  dataValidade: string | null;
  observacao: string | null;
  vlrTotal: number;
  situacao: Situacao;
  clienteDecisao: string | null;
  clienteDecididoEm: string | null;
  clienteDecisaoObservacao: string | null;
  empresa: { nomeFantasia: string; razaoSocial: string; logoUrl: string | null };
  cliente: { razaoSocial: string; nomeFantasia: string | null };
  vendedor: { nome: string };
  condicaoPagamento: { descricao: string } | null;
  itens: {
    id: string;
    quantidade: number;
    vlrUnitario: number;
    percDesconto: number | null;
    vlrTotal: number;
    produto: { codigoErp: string | null; descricao: string };
  }[];
}

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dia = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

const AVISO: Record<"vencido" | "revogado" | "pendente", string> = {
  vencido: "O prazo deste orçamento terminou. Fale com o vendedor para receber uma nova proposta.",
  revogado: "Este link não está mais disponível. Peça um novo ao vendedor.",
  pendente: "Este orçamento está em análise. Fale com o vendedor.",
};

/**
 * Página pública do orçamento (`/o/<token>`): o cliente vê a proposta e aprova ou
 * recusa uma vez, sem login. A recusa pede justificativa. Depois de respondida
 * (ou fora da validade) a página só mostra o resultado.
 */
export default function PropostaPublicaPage() {
  const { token } = useParams<{ token: string }>();
  const consulta = useQuery({
    queryKey: ["proposta-publica", token],
    queryFn: () => apiFetch<Proposta>(`/publico/orcamentos/${token}`),
    retry: false,
  });
  const proposta = consulta.data ?? null;
  const erro = consulta.isError ? "Link inválido ou indisponível." : null;
  const [recusando, setRecusando] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);


  async function responder(acao: "aprovar" | "recusar") {
    setErroAcao(null);
    setEnviando(true);
    try {
      await apiFetch(`/publico/orcamentos/${token}/${acao}`, {
        method: "POST",
        body: acao === "recusar" ? { observacao: justificativa } : {},
      });
    } catch (e) {
      setErroAcao(e instanceof Error ? e.message : "Não foi possível registrar a resposta.");
    } finally {
      setEnviando(false);
      await consulta.refetch();
    }
  }

  if (erro) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="text-center text-muted-foreground">{erro}</p>
      </main>
    );
  }
  if (!proposta) return <main className="min-h-screen" />;

  const numero = proposta.numero ?? proposta.codigoErp ?? "";
  const logo = assetUrl(proposta.empresa.logoUrl);

  return (
    <main className="mx-auto w-full max-w-2xl space-y-5 px-4 py-6">
      <header className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logo && <img src={logo} alt="" className="h-12 w-auto object-contain" />}
        <div className="min-w-0">
          <p className="truncate font-semibold">{proposta.empresa.nomeFantasia}</p>
          <p className="text-sm text-muted-foreground">Proposta comercial nº {numero}</p>
        </div>
      </header>

      <section className="space-y-1 rounded-lg border p-4 text-sm">
        <p className="text-base font-medium">{proposta.titulo}</p>
        <p>
          <span className="text-muted-foreground">Cliente: </span>
          {proposta.cliente.nomeFantasia || proposta.cliente.razaoSocial}
        </p>
        <p>
          <span className="text-muted-foreground">Vendedor: </span>
          {proposta.vendedor.nome}
        </p>
        {proposta.condicaoPagamento && (
          <p>
            <span className="text-muted-foreground">Pagamento: </span>
            {proposta.condicaoPagamento.descricao}
          </p>
        )}
        {proposta.dataValidade && (
          <p>
            <span className="text-muted-foreground">Válido até: </span>
            {dia(proposta.dataValidade)}
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Itens</h2>
        <ul className="divide-y rounded-lg border">
          {proposta.itens.map((i) => (
            <li key={i.id} className="flex items-start justify-between gap-3 p-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{i.produto.descricao}</p>
                <p className="text-muted-foreground">
                  {i.quantidade} × {moeda(i.vlrUnitario)}
                  {i.percDesconto ? ` (desc. ${i.percDesconto}%)` : ""}
                </p>
              </div>
              <p className="shrink-0 font-medium">{moeda(i.vlrTotal)}</p>
            </li>
          ))}
        </ul>
        <p className="text-right text-lg font-semibold">Total {moeda(proposta.vlrTotal)}</p>
      </section>

      {proposta.observacao && (
        <p className="whitespace-pre-line rounded-lg border p-3 text-sm">{proposta.observacao}</p>
      )}

      {proposta.situacao === "aberto" && (
        <section className="space-y-3 border-t pt-4">
          {recusando ? (
            <>
              <Textarea
                placeholder="Conte o motivo da recusa (obrigatório)"
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                maxLength={1000}
                rows={4}
              />
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={enviando || !justificativa.trim()}
                  onClick={() => void responder("recusar")}
                >
                  Confirmar recusa
                </Button>
                <Button variant="outline" disabled={enviando} onClick={() => setRecusando(false)}>
                  Voltar
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                size="lg"
                className="flex-1"
                disabled={enviando}
                onClick={() => {
                  if (confirm("Aprovar este orçamento? A resposta não poderá ser alterada.")) {
                    void responder("aprovar");
                  }
                }}
              >
                <CheckCircle2 className="size-4" /> Aprovar
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="flex-1"
                disabled={enviando}
                onClick={() => setRecusando(true)}
              >
                <XCircle className="size-4" /> Reprovar
              </Button>
            </div>
          )}
          {erroAcao && <p className="text-sm text-destructive">{erroAcao}</p>}
        </section>
      )}

      {proposta.situacao === "aprovado" && (
        <Resultado icone={<CheckCircle2 className="size-5 text-green-600" />}>
          Orçamento aprovado
          {proposta.clienteDecididoEm ? ` em ${dataHora(proposta.clienteDecididoEm)}` : ""}.
          Obrigado!
        </Resultado>
      )}
      {proposta.situacao === "recusado" && (
        <Resultado icone={<XCircle className="size-5 text-destructive" />}>
          Orçamento recusado
          {proposta.clienteDecididoEm ? ` em ${dataHora(proposta.clienteDecididoEm)}` : ""}.
          {proposta.clienteDecisaoObservacao && (
            <span className="mt-1 block text-muted-foreground">
              Motivo: {proposta.clienteDecisaoObservacao}
            </span>
          )}
        </Resultado>
      )}
      {(proposta.situacao === "vencido" ||
        proposta.situacao === "revogado" ||
        proposta.situacao === "pendente") && (
        <Resultado icone={<Clock className="size-5 text-muted-foreground" />}>
          {AVISO[proposta.situacao]}
        </Resultado>
      )}
    </main>
  );
}

function Resultado({ icone, children }: { icone: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-4 text-sm">
      {icone}
      <div>{children}</div>
    </div>
  );
}
