"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Radar } from "lucide-react";
import { toast } from "sonner";
import {
  LEAD_COLETA_SITUACAO_LABEL,
  PROSPECCAO_MAX_COMBINACOES,
  PROSPECCAO_MAX_EMPRESAS,
  type ProspeccaoCnae,
  type ProspeccaoColeta,
  type ProspeccaoMunicipio,
} from "@plataforma/contracts";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FilterMultiSelect } from "@/components/crud/filter-multi-select";
import { BarraAnimada } from "@/components/graficos/barra-animada";

/**
 * CRM > Prospecção de Leads (docs/planos/2026-11-20-prospeccao-leads-receita.md).
 *
 * Supervisor e gerente coletam empresas na base da Receita por UF, municípios e
 * CNAEs. A coleta roda em segundo plano e importa como lead (origem Receita,
 * sem vendedor) só as **ativas que não são clientes nem leads**; o resto entra
 * nas contagens. Os leads aparecem na tela de Leads para a distribuição.
 *
 * A base pública só aceita um município e um CNAE por busca, por isso a coleta
 * percorre cada combinação — e o número delas tem teto.
 */

const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
  "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
];

const numero = (v: number) => v.toLocaleString("pt-BR");

function dataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "Campo Grande, Terenos e mais 3" — a célula não pode virar parágrafo. */
function resumo(nomes: string[], max = 2) {
  if (nomes.length <= max) return nomes.join(", ");
  return `${nomes.slice(0, max).join(", ")} e mais ${nomes.length - max}`;
}

const COR_SITUACAO: Record<ProspeccaoColeta["situacao"], string> = {
  rodando: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  concluida: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  erro: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
};

export default function ProspeccaoPage() {
  const queryClient = useQueryClient();
  const podeColetar = useAuthStore((s) => s.hasPermission("prospeccao-leads", "cadastrar"));

  const [uf, setUf] = useState("MS");
  const [municipios, setMunicipios] = useState<string[]>([]);
  const [cnaes, setCnaes] = useState<string[]>([]);

  const municipiosQuery = useQuery({
    queryKey: ["prospeccao", "municipios", uf],
    queryFn: () =>
      apiFetch<ProspeccaoMunicipio[]>("/leads/prospeccao/municipios", { query: { uf } }),
  });
  const cnaesQuery = useQuery({
    queryKey: ["prospeccao", "cnaes"],
    queryFn: () => apiFetch<ProspeccaoCnae[]>("/leads/prospeccao/cnaes"),
    staleTime: Infinity,
  });
  const coletasQuery = useQuery({
    queryKey: ["prospeccao", "coletas"],
    queryFn: () => apiFetch<ProspeccaoColeta[]>("/leads/prospeccao/coletas"),
    // Enquanto há coleta rodando, a tela acompanha o progresso.
    refetchInterval: (q) =>
      (q.state.data ?? []).some((c) => c.situacao === "rodando") ? 3000 : false,
  });

  const opcoesMunicipio = useMemo(
    () =>
      (municipiosQuery.data ?? []).map((m) => ({
        value: m.codigoIbge,
        label: m.nome,
      })),
    [municipiosQuery.data],
  );
  const opcoesCnae = useMemo(
    () =>
      (cnaesQuery.data ?? []).map((c) => ({
        value: c.codigo,
        label: `${c.codigo} · ${c.descricao}`,
        searchText: `${c.codigo} ${c.descricao}`,
      })),
    [cnaesQuery.data],
  );

  const coletas = coletasQuery.data ?? [];
  const rodando = coletas.some((c) => c.situacao === "rodando");
  const combinacoes = municipios.length * cnaes.length;
  const excede = combinacoes > PROSPECCAO_MAX_COMBINACOES;

  const coletar = useMutation({
    mutationFn: () =>
      apiFetch<{ id: string }>("/leads/prospeccao/coletas", {
        method: "POST",
        body: { uf, municipios, cnaes },
      }),
    onSuccess: () => {
      toast.success("Coleta iniciada — acompanhe o progresso abaixo.");
      void queryClient.invalidateQueries({ queryKey: ["prospeccao", "coletas"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Não foi possível iniciar a coleta."),
  });

  return (
    <div data-tour="rotina" className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Radar className="size-5" /> Prospecção de Leads
        </h1>
        <p className="text-sm text-muted-foreground">
          Colete empresas na base da Receita por município e atividade (CNAE). Só as{" "}
          <strong>ativas que ainda não são clientes nem leads</strong> viram lead — sem
          vendedor, para a distribuição na tela de{" "}
          <Link href="/comercial/leads" className="underline underline-offset-2">
            Leads
          </Link>
          .
        </p>
      </div>

      {podeColetar && (
        <Card>
          <CardContent className="space-y-4">
            <p className="text-sm font-medium">Nova coleta</p>
            <div className="grid gap-3 md:grid-cols-[8rem_1fr_1.5fr]">
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Estado</p>
                <Select
                  value={uf}
                  onValueChange={(v) => {
                    setUf(v);
                    setMunicipios([]);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UFS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Municípios</p>
                <FilterMultiSelect
                  value={municipios}
                  onChange={setMunicipios}
                  options={opcoesMunicipio}
                  placeholder={municipiosQuery.isLoading ? "Carregando…" : "Escolha os municípios"}
                  searchPlaceholder="Buscar município…"
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Atividades (CNAE)</p>
                <FilterMultiSelect
                  value={cnaes}
                  onChange={setCnaes}
                  options={opcoesCnae}
                  placeholder={cnaesQuery.isLoading ? "Carregando…" : "Escolha as atividades"}
                  searchPlaceholder="Buscar por código ou descrição…"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => coletar.mutate()}
                disabled={
                  coletar.isPending || rodando || municipios.length === 0 || cnaes.length === 0 || excede
                }
              >
                {coletar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Radar className="size-4" />}
                Coletar
              </Button>
              <p className={`text-xs ${excede ? "text-destructive" : "text-muted-foreground"}`}>
                {combinacoes > 0
                  ? `${combinacoes} ${combinacoes === 1 ? "busca" : "buscas"} (município × atividade)${
                      excede ? ` — o máximo é ${PROSPECCAO_MAX_COMBINACOES}; tire municípios ou atividades.` : "."
                    }`
                  : "Escolha ao menos um município e uma atividade."}{" "}
                {rodando && "Há uma coleta rodando; espere ela terminar. "}
                A base pública é lenta e limita as buscas: a coleta anda devagar e para em{" "}
                {numero(PROSPECCAO_MAX_EMPRESAS)} empresas lidas.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm font-medium">Coletas</p>
          {coletasQuery.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : coletas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma coleta ainda.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Filtros</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="text-right">Lidas</TableHead>
                    <TableHead className="text-right">Importadas</TableHead>
                    <TableHead className="text-right">Já clientes</TableHead>
                    <TableHead className="text-right">Já leads</TableHead>
                    <TableHead className="text-right">Inativas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coletas.map((c) => (
                    <TableRow key={c.id} className="align-top">
                      <TableCell className="whitespace-nowrap text-xs">
                        {dataHora(c.iniciadaEm)}
                        {c.usuarioNome && (
                          <span className="block text-muted-foreground">{c.usuarioNome}</span>
                        )}
                      </TableCell>
                      <TableCell className="min-w-56 whitespace-normal text-xs">
                        <span className="font-medium">{c.filtros.uf}</span> ·{" "}
                        {resumo(c.filtros.municipios.map((m) => m.nome))}
                        <span className="block text-muted-foreground">
                          {resumo(
                            c.filtros.cnaes.map((x) => x.descricao ?? x.codigo),
                            1,
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="min-w-40 whitespace-normal">
                        <span
                          className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${COR_SITUACAO[c.situacao]}`}
                        >
                          {LEAD_COLETA_SITUACAO_LABEL[c.situacao]}
                        </span>
                        {c.progresso && (
                          <div className="mt-1.5 space-y-1">
                            <BarraAnimada
                              perc={(c.progresso.feitas / Math.max(1, c.progresso.total)) * 100}
                              cor="bg-sky-500"
                            />
                            <p className="text-xs text-muted-foreground">
                              {c.progresso.feitas} de {c.progresso.total} buscas
                            </p>
                          </div>
                        )}
                        {c.erro && <p className="mt-1 text-xs text-muted-foreground">{c.erro}</p>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{numero(c.encontrados)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.importados > 0 ? (
                          <Badge variant="secondary">{numero(c.importados)}</Badge>
                        ) : (
                          numero(c.importados)
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {numero(c.jaClientes)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {numero(c.jaLeads)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {numero(c.inativos)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
