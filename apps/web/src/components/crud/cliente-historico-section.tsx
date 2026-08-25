"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CAMPO_CLIENTE_LABEL,
  ORIGEM_ALTERACAO_CLIENTE_LABEL,
  STATUS_HISTORICO_CLIENTE_LABEL,
  type ClienteHistorico,
} from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { FieldDescription } from "@/components/ui/field";

const dataHora = (v: string) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR");
};

/**
 * O que já mudou no cadastro, campo a campo — inclusive o que veio da
 * integração do ERP. É o outro lado da fila de aprovação: a fila mostra o que
 * ainda vai mudar, isto mostra o que mudou e por quem foi liberado.
 */
export function ClienteHistoricoSection({ clienteId }: { clienteId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["clientes", clienteId, "historico-alteracoes"],
    queryFn: () =>
      apiFetch<ClienteHistorico[]>(`/clientes/${clienteId}/historico-alteracoes`),
  });
  const linhas = data ?? [];

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>;
  }

  if (linhas.length === 0) {
    return (
      <FieldDescription>
        Nenhuma alteração registrada. A partir de agora, toda mudança neste
        cadastro passa por aprovação e fica registrada aqui.
      </FieldDescription>
    );
  }

  return (
    <div className="space-y-2">
      <FieldDescription>
        Alterações analisadas, da mais recente para a mais antiga. &quot;Por&quot; é
        quem aprovou — ou reprovou — a mudança. A linha reprovada mostra o que foi
        proposto e negado: o cadastro não mudou.
      </FieldDescription>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-1.5 pr-3 font-medium">Quando</th>
              <th className="py-1.5 pr-3 font-medium">Campo</th>
              <th className="py-1.5 pr-3 font-medium">De</th>
              <th className="py-1.5 pr-3 font-medium">Para</th>
              <th className="py-1.5 pr-3 font-medium">Resultado</th>
              <th className="py-1.5 pr-3 font-medium">Origem</th>
              <th className="py-1.5 font-medium">Por</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} className="border-b last:border-0">
                <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground">
                  {dataHora(l.criadoEm)}
                </td>
                <td className="py-1.5 pr-3">
                  {CAMPO_CLIENTE_LABEL[l.campo] ?? l.campo}
                </td>
                <td className="py-1.5 pr-3 text-muted-foreground">
                  {l.valorAnterior ?? "—"}
                </td>
                <td
                  className={`py-1.5 pr-3 ${
                    l.status === "reprovado"
                      ? "text-muted-foreground line-through"
                      : ""
                  }`}
                >
                  {l.valorNovo ?? "—"}
                </td>
                <td className="py-1.5 pr-3">
                  <Badge
                    variant={l.status === "reprovado" ? "outline" : "secondary"}
                    className={
                      l.status === "reprovado"
                        ? "border-destructive/40 text-destructive"
                        : ""
                    }
                  >
                    {STATUS_HISTORICO_CLIENTE_LABEL[l.status]}
                  </Badge>
                </td>
                <td className="py-1.5 pr-3">
                  <Badge variant="outline">
                    {ORIGEM_ALTERACAO_CLIENTE_LABEL[l.origem]}
                  </Badge>
                </td>
                <td className="py-1.5">{l.autorNome ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
