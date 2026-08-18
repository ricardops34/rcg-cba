"use client";

import { useQuery } from "@tanstack/react-query";
import type { PosicaoCliente } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";

/**
 * Posição do cliente na coluna da direita do atendimento.
 *
 * Encaixado, e não sobreposto: o vendedor consulta enquanto continua lendo a
 * conversa — é o mesmo comportamento do "Dados do contato" do WhatsApp, que
 * empurra o rolo em vez de cobri-lo. Por isso não é um `Sheet`.
 *
 * **Consulta, não mensagem:** nada daqui é enviado ao cliente. Os dados são
 * os mesmos da tela de Posição de Cliente, pela mesma rota.
 */
export function PainelPosicao({ clienteId }: { clienteId: string }) {
  const posicaoQuery = useQuery({
    queryKey: ["clientes", clienteId, "posicao"],
    queryFn: () => apiFetch<PosicaoCliente>(`/clientes/${clienteId}/posicao`),
  });
  const posicao = posicaoQuery.data;

  if (posicaoQuery.isPending) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }
  if (!posicao) {
    return (
      <p className="text-sm text-muted-foreground">
        Não foi possível carregar a posição deste cliente.
      </p>
    );
  }

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="font-medium">{posicao.cliente.razaoSocial}</p>
        <p className="text-xs text-muted-foreground">
          O cliente não recebe nada desta consulta.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Indicador titulo="Comprado" valor={moeda(posicao.resumo.totalComprado)} />
        <Indicador titulo="Notas" valor={String(posicao.resumo.totalNotas)} />
        <Indicador
          titulo="Em aberto"
          valor={moeda(posicao.resumo.totalTitulosAberto)}
        />
        <Indicador
          titulo="Vencido"
          valor={moeda(posicao.resumo.totalTitulosVencido)}
          // Vencido é o número que muda a conversa: destacado quando existe.
          alerta={posicao.resumo.totalTitulosVencido > 0}
        />
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          Títulos em aberto
        </p>
        {posicao.titulos.length === 0 ? (
          <p className="text-muted-foreground">Nenhum.</p>
        ) : (
          <ul className="space-y-1">
            {posicao.titulos.slice(0, 6).map((t) => (
              <li key={t.id} className="flex justify-between gap-2">
                <span className="truncate">
                  {t.numero ?? "s/n"} · {dataBr(t.vencimento)}
                </span>
                <span className="shrink-0 tabular-nums">{moeda(t.saldo)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          Últimas notas
        </p>
        {posicao.notas.length === 0 ? (
          <p className="text-muted-foreground">Nenhuma.</p>
        ) : (
          <ul className="space-y-1">
            {posicao.notas.slice(0, 6).map((n) => (
              <li key={n.id} className="flex justify-between gap-2">
                <span className="truncate">
                  NF {n.numero ?? "s/n"} · {dataBr(n.dtEmissao)}
                </span>
                <span className="shrink-0 tabular-nums">{moeda(n.vlrBruto)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          Mais comprados
        </p>
        {posicao.mix.length === 0 ? (
          <p className="text-muted-foreground">Nenhum.</p>
        ) : (
          <ul className="space-y-1">
            {posicao.mix.slice(0, 8).map((m) => (
              <li key={m.produtoId} className="flex justify-between gap-2">
                <span className="truncate">{m.descricao}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {dataBr(m.ultimaCompra)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const moeda = (v: number | null | undefined) =>
  v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const dataBr = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString("pt-BR") : "—";

function Indicador({
  titulo,
  valor,
  alerta,
}: {
  titulo: string;
  valor: string;
  alerta?: boolean;
}) {
  return (
    <div className="rounded-md border p-2">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className={`text-sm font-medium ${alerta ? "text-destructive" : ""}`}>
        {valor}
      </p>
    </div>
  );
}
