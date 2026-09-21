"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  SITUACAO_EMPRESA_LABEL,
  type PlataformaEmpresa,
} from "@plataforma/contracts";
import { useResourceList } from "@/hooks/use-resource";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import {
  QuickFilterButton,
  QuickFilterGroup,
} from "@/components/crud/quick-filter-group";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Building2,
  Building,
  CheckCircle2,
  Clock,
  AlertTriangle,
  PauseCircle,
  MoreHorizontal,
  Pencil,
  Settings2,
  Plus,
  Users,
} from "lucide-react";
import { SituacaoDialog } from "./situacao-dialog";
import { PlataformaGuard } from "../plataforma-guard";

type Filtro = "todas" | "teste" | "ativa" | "suspensa" | "expiradas";

/** Cor do selo por situação — expirado tem cor própria, é o que pede ação. */
function SituacaoBadge({ empresa }: { empresa: PlataformaEmpresa }) {
  if (empresa.testeExpirado) {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="size-3" /> Teste vencido
      </Badge>
    );
  }
  const variante =
    empresa.situacao === "ativa"
      ? "default"
      : empresa.situacao === "teste"
        ? "secondary"
        : "outline";
  return (
    <Badge variant={variante} className="capitalize">
      {SITUACAO_EMPRESA_LABEL[empresa.situacao]}
    </Badge>
  );
}

/**
 * Uso do limite. Sem limite não vira "0 de ∞" — mostra só o número, porque
 * "ilimitado" não é informação que alguém precise reler a cada linha.
 */
function UsoDeUsuarios({ empresa }: { empresa: PlataformaEmpresa }) {
  if (empresa.limiteUsuarios === null) {
    return (
      <span className="text-muted-foreground flex items-center gap-1">
        <Users className="size-3.5 opacity-70" />
        {empresa.usuariosAtivos}
      </span>
    );
  }
  const cheio = empresa.usuariosAtivos >= empresa.limiteUsuarios;
  return (
    <span
      className={`flex items-center gap-1 tabular-nums ${cheio ? "font-medium text-destructive" : ""}`}
    >
      <Users className="size-3.5 opacity-70" />
      {empresa.usuariosAtivos} / {empresa.limiteUsuarios}
    </span>
  );
}

const formatarData = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";

const formatCnpj = (cnpj: string) =>
  cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

export default function PlataformaEmpresasPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState("razaoSocial");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [emEdicao, setEmEdicao] = useState<PlataformaEmpresa | null>(null);

  const { data, isLoading, isFetching, refetch, error } =
    useResourceList<PlataformaEmpresa>("plataforma/empresas", {
      search,
      page,
      pageSize,
      sortBy,
      sortOrder,
      ...(filtro === "expiradas"
        ? { apenasExpiradas: true }
        : filtro !== "todas"
          ? { situacao: filtro }
          : {}),
    });

  const empresas = data?.data ?? [];
  const totalEmpresas = data?.total ?? empresas.length;

  // Métricas calculadas da página atual/lista
  const totalAtivas = empresas.filter((e) => e.situacao === "ativa").length;
  const totalTeste = empresas.filter((e) => e.situacao === "teste" && !e.testeExpirado).length;
  const totalExpiradas = empresas.filter((e) => e.testeExpirado).length;
  const totalSuspensas = empresas.filter((e) => e.situacao === "suspensa" || e.situacao === "cancelada").length;

  const columns: ColumnDef<PlataformaEmpresa>[] = [
    {
      header: "Empresa",
      sortKey: "nomeFantasia",
      cell: (e) => (
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary font-semibold text-sm shrink-0">
            {e.nomeFantasia.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-medium text-foreground">{e.nomeFantasia}</div>
            <div className="text-xs text-muted-foreground">{e.razaoSocial}</div>
          </div>
        </div>
      ),
    },
    {
      header: "CNPJ",
      sortKey: "cnpj",
      cell: (e) => <span className="font-mono text-xs">{formatCnpj(e.cnpj)}</span>,
    },
    {
      header: "Situação",
      sortKey: "situacao",
      cell: (e) => <SituacaoBadge empresa={e} />,
    },
    {
      header: "Teste até",
      cell: (e) =>
        e.situacao === "teste" ? (
          <span className={e.testeExpirado ? "font-medium text-destructive" : undefined}>
            {e.testeExpiraEm ? formatarData(e.testeExpiraEm) : "sem prazo"}
          </span>
        ) : (
          "—"
        ),
    },
    {
      header: "Usuários",
      cell: (e) => <UsoDeUsuarios empresa={e} />,
    },
    {
      header: "Último acesso",
      cell: (e) => (
        <span className="text-xs text-muted-foreground">{formatarData(e.ultimoAcesso)}</span>
      ),
    },
    {
      header: "",
      className: "w-10",
      cell: (e) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={(ev) => ev.stopPropagation()}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => router.push(`/plataforma/empresas/${e.id}`)}
            >
              <Pencil className="size-4" /> Editar cadastro
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setEmEdicao(e)}>
              <Settings2 className="size-4" /> Situação, teste e limite
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <PlataformaGuard>
      <div className="space-y-6">
        {/* Superior Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-xs">
              <Building2 className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight">Empresas da Plataforma</h1>
                <Badge variant="outline" className="text-xs">SaaS Multi-tenant</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Gestão de contas de empresas clientes, licenças de teste, limites de usuários e situação cadastral.
              </p>
            </div>
          </div>
          <Button
            onClick={() => router.push("/plataforma/empresas/nova")}
            className="gap-2 shadow-xs"
          >
            <Plus className="size-4" /> Nova empresa
          </Button>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Card className="shadow-xs border-border/60">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Total Cadastradas</p>
                <p className="text-2xl font-bold tracking-tight mt-1">{totalEmpresas}</p>
              </div>
              <div className="flex size-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
                <Building className="size-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-xs border-border/60">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Ativas</p>
                <p className="text-2xl font-bold tracking-tight mt-1 text-emerald-600 dark:text-emerald-400">
                  {totalAtivas}
                </p>
              </div>
              <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                <CheckCircle2 className="size-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-xs border-border/60">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Em Avaliação</p>
                <p className="text-2xl font-bold tracking-tight mt-1 text-amber-600 dark:text-amber-400">
                  {totalTeste}
                </p>
              </div>
              <div className="flex size-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                <Clock className="size-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-xs border-border/60">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Teste Vencido</p>
                <p className="text-2xl font-bold tracking-tight mt-1 text-rose-600 dark:text-rose-400">
                  {totalExpiradas}
                </p>
              </div>
              <div className="flex size-9 items-center justify-center rounded-lg bg-rose-500/10 text-rose-500">
                <AlertTriangle className="size-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-xs border-border/60">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Suspensas / Outras</p>
                <p className="text-2xl font-bold tracking-tight mt-1 text-muted-foreground">
                  {totalSuspensas}
                </p>
              </div>
              <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <PauseCircle className="size-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filter & Toolbar Header */}
        <div className="space-y-3">
          <CrudHeader
            search={search}
            onSearchChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            onRefresh={() => refetch()}
            isRefreshing={isFetching}
            placeholder="Buscar por nome fantasia, razão social ou CNPJ..."
          />

          <QuickFilterGroup>
            {(
              [
                ["todas", "Todas", Building],
                ["ativa", "Ativas", CheckCircle2],
                ["teste", "Em teste", Clock],
                ["expiradas", "Teste vencido", AlertTriangle],
                ["suspensa", "Suspensas", PauseCircle],
              ] as const
            ).map(([valor, rotulo, Icone]) => (
              <QuickFilterButton
                key={valor}
                active={filtro === valor}
                onClick={() => {
                  setFiltro(valor);
                  setPage(1);
                }}
                className="gap-1.5"
              >
                <Icone className="size-3.5" />
                {rotulo}
              </QuickFilterButton>
            ))}
          </QuickFilterGroup>
        </div>

        {/* Table */}
        <EntityTable
          columns={columns}
          rows={data?.data ?? []}
          rowKey={(e) => e.id}
          isLoading={isLoading}
          error={error}
          emptyMessage="Nenhuma empresa encontrada com os filtros aplicados."
          page={data?.page ?? page}
          pageSize={data?.pageSize ?? pageSize}
          total={data?.total ?? 0}
          totalPages={data?.totalPages ?? 1}
          onPageChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
          onRowClick={(e) => router.push(`/plataforma/empresas/${e.id}`)}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={(key, order) => {
            setSortBy(key);
            setSortOrder(order);
          }}
          storageKey="plataforma-empresas"
        />

        <SituacaoDialog
          empresa={emEdicao}
          onClose={() => setEmEdicao(null)}
          onSaved={() => {
            setEmEdicao(null);
            void refetch();
            toast.success("Empresa atualizada com sucesso");
          }}
        />
      </div>
    </PlataformaGuard>
  );
}

