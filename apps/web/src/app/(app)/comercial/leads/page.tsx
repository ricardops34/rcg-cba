"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Flame, MessageCircle, Snowflake, Thermometer } from "lucide-react";
import type { Lead, LeadSituacao, LeadTemperatura } from "@plataforma/contracts";
import {
  LEAD_SITUACAO_LABEL,
  LEAD_TEMPERATURA_LABEL,
} from "@plataforma/contracts";
import { useResourceList, useResourceMutations } from "@/hooks/use-resource";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch } from "@/lib/api-client";
import { CrudHeader } from "@/components/crud/crud-header";
import {
  QuickFilterButton,
  QuickFilterGroup,
} from "@/components/crud/quick-filter-group";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Leads: quem procurou a empresa pelo número institucional e ainda não é
 * cliente.
 *
 * **Fila, não cadastro.** Não há botão de novo: quem cria é a IA da triagem, a
 * partir da conversa. O trabalho desta tela é uma decisão por lead — entregar a
 * um vendedor, ou descartar.
 *
 * O que aparece aqui é **o que a pessoa disse**, nada conferido contra cadastro
 * nenhum; por isso o nome e a empresa são texto simples, sem link para cliente.
 * O telefone é o único dado que não depende do que ela conta.
 *
 * Quem vê o quê é decidido pela API (`LeadsService.listar`): quem tem equipe
 * abaixo vê a fila inteira, quem não tem vê só o que lhe foi entregue.
 */

interface VendedorEscopo {
  id: string;
  nome: string;
  nomeReduzido: string | null;
}

const ICONE_TEMPERATURA: Record<LeadTemperatura, typeof Flame> = {
  quente: Flame,
  morno: Thermometer,
  frio: Snowflake,
};

const COR_TEMPERATURA: Record<LeadTemperatura, string> = {
  quente: "bg-red-500/10 text-red-700 dark:text-red-400",
  morno: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  frio: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
};

const SITUACOES: { valor: LeadSituacao | null; rotulo: string }[] = [
  // "Novos" é o padrão da tela: a fila do que ainda não foi decidido é o
  // trabalho; o resto é consulta.
  { valor: "novo", rotulo: "Novos" },
  { valor: "em_atendimento", rotulo: "Em atendimento" },
  { valor: "convertido", rotulo: "Convertidos" },
  { valor: "descartado", rotulo: "Descartados" },
  { valor: null, rotulo: "Todos" },
];

/** "(67) 99988-7766" a partir do que veio do WhatsApp (com ou sem DDI). */
function telefoneBr(valor: string) {
  const so = valor.replace(/\D/g, "");
  const sem = so.startsWith("55") && so.length > 11 ? so.slice(2) : so;
  if (sem.length === 11)
    return `(${sem.slice(0, 2)}) ${sem.slice(2, 7)}-${sem.slice(7)}`;
  if (sem.length === 10)
    return `(${sem.slice(0, 2)}) ${sem.slice(2, 6)}-${sem.slice(6)}`;
  return valor;
}

function quando(iso: string) {
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias < 30) return `há ${dias} d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function LeadsPage() {
  const [search, setSearch] = useState("");
  const [situacao, setSituacao] = useState<LeadSituacao | null>("novo");
  const [page, setPage] = useState(1);

  const podeDistribuir = useAuthStore((s) => s.hasPermission("leads", "editar"));

  const { data, isLoading, isFetching, refetch } = useResourceList<Lead>(
    "leads",
    {
      page,
      pageSize: 20,
      ...(search ? { search } : {}),
      ...(situacao ? { situacao } : {}),
    },
  );

  // A mesma lista de vendedores que o usuário já enxerga no resto do sistema —
  // não há como direcionar um lead para fora da própria equipe.
  const escopoQuery = useQuery({
    queryKey: ["escopo", "vendedores"],
    queryFn: () =>
      apiFetch<{ data: VendedorEscopo[]; restrito: boolean }>(
        "/escopo/vendedores",
      ),
    enabled: podeDistribuir,
  });
  const vendedores = escopoQuery.data?.data ?? [];

  const { update } = useResourceMutations<never, Record<string, unknown>>(
    "leads",
  );

  const leads = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <div data-tour="rotina" className="space-y-4">
      <CrudHeader
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
      />

      <QuickFilterGroup>
        {SITUACOES.map((s) => (
          <QuickFilterButton
            key={s.rotulo}
            active={situacao === s.valor}
            onClick={() => {
              setSituacao(s.valor);
              setPage(1);
            }}
          >
            {s.rotulo}
          </QuickFilterButton>
        ))}
      </QuickFilterGroup>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : leads.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum lead nesta situação.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {leads.map((lead) => {
            const Icone = ICONE_TEMPERATURA[lead.temperatura];
            const salvando =
              update.isPending && update.variables?.id === lead.id;
            return (
              <Card key={lead.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
                            COR_TEMPERATURA[lead.temperatura],
                          )}
                        >
                          <Icone className="size-3.5" />
                          {LEAD_TEMPERATURA_LABEL[lead.temperatura]}
                        </span>
                        <span className="font-medium">
                          {lead.empresaInformada || lead.nome || "Sem nome"}
                        </span>
                        {lead.empresaInformada && lead.nome && (
                          <span className="text-sm text-muted-foreground">
                            {lead.nome}
                          </span>
                        )}
                        <Badge variant="outline">
                          {LEAD_SITUACAO_LABEL[lead.situacao]}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="font-mono">
                          {telefoneBr(lead.telefone)}
                        </span>
                        <span>{quando(lead.createdAt)}</span>
                        {lead.vendedorNome && <span>com {lead.vendedorNome}</span>}
                      </div>
                    </div>
                    {lead.conversaId && (
                      <Button variant="outline" size="sm" asChild>
                        <a
                          href={`/comercial/atendimento?conversa=${lead.conversaId}`}
                        >
                          <MessageCircle className="size-4" />
                          Conversa
                        </a>
                      </Button>
                    )}
                  </div>

                  <p className="text-sm">{lead.interesse}</p>
                  {/* Por que a IA classificou assim — para quem recebe poder
                      discordar, em vez de acreditar. */}
                  {lead.motivoClassificacao && (
                    <p className="text-xs text-muted-foreground italic">
                      {lead.motivoClassificacao}
                    </p>
                  )}

                  {podeDistribuir && (
                    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                      <Select
                        value={lead.vendedorId ?? "fila"}
                        disabled={salvando}
                        onValueChange={(v) =>
                          update.mutate({
                            id: lead.id,
                            input: { vendedorId: v === "fila" ? null : v },
                          })
                        }
                      >
                        <SelectTrigger className="w-56">
                          <SelectValue placeholder="Entregar a…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fila">
                            Sem vendedor (na fila)
                          </SelectItem>
                          {vendedores.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.nomeReduzido || v.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {lead.situacao !== "convertido" && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={salvando}
                          onClick={() =>
                            update.mutate({
                              id: lead.id,
                              input: { situacao: "convertido" },
                            })
                          }
                        >
                          Virou cliente
                        </Button>
                      )}
                      {lead.situacao !== "descartado" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={salvando}
                          onClick={() =>
                            update.mutate({
                              id: lead.id,
                              input: { situacao: "descartado" },
                            })
                          }
                        >
                          Descartar
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </Button>
        </div>
      )}
    </div>
  );
}
