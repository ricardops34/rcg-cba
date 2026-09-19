"use client";

import { useState } from "react";
import {
  PLATAFORMA_ACAO_LABEL,
  type PlataformaAuditoria,
} from "@plataforma/contracts";
import { useResourceList } from "@/hooks/use-resource";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import {
  QuickFilterButton,
  QuickFilterGroup,
} from "@/components/crud/quick-filter-group";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  History,
  FileText,
  Building,
  ShieldAlert,
  List,
  Plus,
  RefreshCw,
  Clock,
  Sliders,
  ShieldPlus,
  ShieldMinus,
  User,
} from "lucide-react";
import { PlataformaGuard } from "../plataforma-guard";

const ACOES = [
  ["", "Todas", List],
  ["empresa.criada", "Criação", Plus],
  ["empresa.situacao_alterada", "Situação", RefreshCw],
  ["empresa.teste_alterado", "Teste", Clock],
  ["empresa.limite_alterado", "Limite", Sliders],
  ["admin.promovido", "Admin promovido", ShieldPlus],
  ["admin.revogado", "Admin removido", ShieldMinus],
] as const;

const formatarDataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

function AcaoBadge({ acao }: { acao: string }) {
  const label = PLATAFORMA_ACAO_LABEL[acao as keyof typeof PLATAFORMA_ACAO_LABEL] ?? acao;
  
  if (acao.startsWith("empresa.criada")) {
    return <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-medium">{label}</Badge>;
  }
  if (acao.startsWith("empresa.situacao")) {
    return <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 font-medium">{label}</Badge>;
  }
  if (acao.startsWith("empresa.teste")) {
    return <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 font-medium">{label}</Badge>;
  }
  if (acao.startsWith("admin")) {
    return <Badge className="bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30 font-medium">{label}</Badge>;
  }
  return <Badge variant="outline">{label}</Badge>;
}

/**
 * Antes → depois. Só mostra a seta quando existe um "antes".
 */
function Mudanca({ linha }: { linha: PlataformaAuditoria }) {
  if (!linha.valorNovo) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="text-xs font-mono">
      {linha.valorAnterior && (
        <>
          <span className="text-muted-foreground line-through mr-1">
            {linha.valorAnterior}
          </span>
          <span className="mr-1 text-muted-foreground">→</span>
        </>
      )}
      <span className="font-medium text-foreground">{linha.valorNovo}</span>
    </span>
  );
}

export default function PlataformaAuditoriaPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [acao, setAcao] = useState("");

  const { data, isLoading, error } = useResourceList<PlataformaAuditoria>(
    "plataforma/auditoria",
    { page, pageSize, ...(acao ? { acao } : {}) },
  );

  const logs = data?.data ?? [];
  const totalRegistros = data?.total ?? logs.length;

  const columns: ColumnDef<PlataformaAuditoria>[] = [
    {
      header: "Quando",
      className: "w-40",
      cell: (l) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap font-mono">
          {formatarDataHora(l.createdAt)}
        </span>
      ),
    },
    {
      header: "Ação",
      cell: (l) => <AcaoBadge acao={l.acao} />,
    },
    {
      header: "Empresa Alvo",
      cell: (l) =>
        l.empresaRazaoSocial ? (
          <span className="font-medium text-foreground text-xs">{l.empresaRazaoSocial}</span>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        ),
    },
    { header: "Mudança Registrada", cell: (l) => <Mudanca linha={l} /> },
    {
      header: "Autor da Ação",
      cell: (l) => (
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <User className="size-3 opacity-70" />
          {l.usuarioEmail}
        </span>
      ),
    },
  ];

  return (
    <PlataformaGuard>
      <div className="space-y-6">
        {/* Superior Header */}
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-xs">
            <History className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">Registro de Auditoria</h1>
              <Badge variant="outline" className="text-xs">Audit Logs</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Histórico detalhado de alterações administrativas realizadas no módulo de plataforma do SaaS.
            </p>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="shadow-xs border-border/60">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Total de Eventos</p>
                <p className="text-2xl font-bold tracking-tight mt-1">{totalRegistros}</p>
              </div>
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileText className="size-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-xs border-border/60">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Filtro Ativo</p>
                <p className="text-sm font-semibold tracking-tight mt-1 text-primary capitalize">
                  {acao ? (PLATAFORMA_ACAO_LABEL[acao as keyof typeof PLATAFORMA_ACAO_LABEL] ?? acao) : "Todas as Ações"}
                </p>
              </div>
              <div className="flex size-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
                <Building className="size-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-xs border-border/60">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Segurança</p>
                <p className="text-sm font-semibold tracking-tight mt-1 text-emerald-600 dark:text-emerald-400">
                  Logs Imutáveis
                </p>
              </div>
              <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                <ShieldAlert className="size-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <QuickFilterGroup>
          {ACOES.map(([valor, rotulo, Icone]) => (
            <QuickFilterButton
              key={valor || "todas"}
              active={acao === valor}
              onClick={() => {
                setAcao(valor);
                setPage(1);
              }}
              className="gap-1.5"
            >
              <Icone className="size-3.5" />
              {rotulo}
            </QuickFilterButton>
          ))}
        </QuickFilterGroup>

        {/* Table */}
        <EntityTable
          columns={columns}
          rows={data?.data ?? []}
          rowKey={(l) => l.id}
          isLoading={isLoading}
          error={error}
          emptyMessage="Nenhuma alteração registrada até o momento."
          page={data?.page ?? page}
          pageSize={data?.pageSize ?? pageSize}
          total={data?.total ?? 0}
          totalPages={data?.totalPages ?? 1}
          onPageChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
        />
      </div>
    </PlataformaGuard>
  );
}

