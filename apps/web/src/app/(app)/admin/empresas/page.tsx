"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SITUACAO_EMPRESA_LABEL, type Empresa } from "@plataforma/contracts";
import { useResourceList, useResourceMutations } from "@/hooks/use-resource";
import { useAuthStore } from "@/stores/auth-store";
import { ApiError } from "@/lib/api-client";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { StatusQuickFilter, type StatusFilterValue } from "@/components/crud/status-quick-filter";
import { ConectarWhatsappDialog } from "@/components/whatsapp/conectar-whatsapp-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MessageCircle, MoreHorizontal, Pencil, Trash2, Building2, CheckCircle2, Plus } from "lucide-react";

export default function EmpresasPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const administradorPlataforma = user?.administradorPlataforma;
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("razaoSocial");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [status, setStatus] = useState<StatusFilterValue>("todos");
  const [whatsappAlvo, setWhatsappAlvo] = useState<Empresa | null>(null);

  const { data, isLoading, isFetching, refetch, error } = useResourceList<Empresa>("empresas", {
    search,
    page,
    pageSize,
    sortBy,
    sortOrder,
    ...(status !== "todos" ? { situacao: status === "ativos" ? "ativa" : "suspensa" } : {}),
  });
  const { remove } = useResourceMutations("empresas");

  const openEdit = (empresa: Empresa) => router.push(`/admin/empresas/${empresa.id}`);

  const onDelete = async (empresa: Empresa) => {
    if (!confirm(`Excluir a empresa "${empresa.nomeFantasia}"?`)) return;
    try {
      await remove.mutateAsync(empresa.id);
      toast.success("Empresa excluída com sucesso");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir empresa");
    }
  };

  const formatCnpj = (cnpj: string) =>
    cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

  const totalEmpresas = data?.total ?? 0;
  const listaEmpresas = data?.data ?? [];
  const totalAtivas = listaEmpresas.filter((e) => e.situacao === "ativa" || e.situacao === "teste").length;

  const columns: ColumnDef<Empresa>[] = [
    {
      header: "Nome fantasia",
      sortKey: "nomeFantasia",
      cell: (e) => (
        <div className="flex items-center gap-2">
          {e.id === user?.empresaAtivaId && (
            <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary text-[10px] px-1.5 py-0">
              Sessão Ativa
            </Badge>
          )}
          <span className="font-semibold text-sm text-foreground">{e.nomeFantasia}</span>
        </div>
      ),
    },
    { header: "Razão social", sortKey: "razaoSocial", cell: (e) => <span className="text-xs text-muted-foreground">{e.razaoSocial}</span> },
    { header: "CNPJ", sortKey: "cnpj", cell: (e) => <span className="font-mono text-xs">{formatCnpj(e.cnpj)}</span> },
    {
      header: "Status",
      sortKey: "situacao",
      cell: (e) => (
        <StatusDot
          active={e.situacao === "ativa" || e.situacao === "teste"}
          labelOn={SITUACAO_EMPRESA_LABEL[e.situacao]}
          labelOff={SITUACAO_EMPRESA_LABEL[e.situacao]}
        />
      ),
    },
    {
      header: "",
      className: "w-10",
      cell: (e) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(ev) => ev.stopPropagation()}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEdit(e)}>
              <Pencil className="mr-2 h-4 w-4" /> Editar cadastro
            </DropdownMenuItem>
            {administradorPlataforma && (
              <DropdownMenuItem onClick={() => setWhatsappAlvo(e)}>
                <MessageCircle className="mr-2 h-4 w-4" /> Conectar WhatsApp
              </DropdownMenuItem>
            )}
            {administradorPlataforma && (
              <DropdownMenuItem variant="destructive" onClick={() => onDelete(e)}>
                <Trash2 className="mr-2 h-4 w-4" /> Excluir
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cadastro de Empresa</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie as informações cadastrais, fiscais e visuais da empresa atrelada à sua conta.
          </p>
        </div>
        {administradorPlataforma && (
          <Button size="sm" onClick={() => router.push("/admin/empresas/novo")}>
            <Plus className="mr-1.5 h-4 w-4" />
            Nova empresa
          </Button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Empresas no Cadastro
              </p>
              <p className="text-2xl font-bold mt-1">{totalEmpresas}</p>
            </div>
            <div className="rounded-full bg-primary/10 p-3 text-primary">
              <Building2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Empresas Ativas
              </p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {totalAtivas}
                </p>
                <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs">
                  Em operação
                </Badge>
              </div>
            </div>
            <div className="rounded-full bg-emerald-500/10 p-3 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      <CrudHeader
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
        onCreate={administradorPlataforma ? () => router.push("/admin/empresas/novo") : undefined}
        createLabel="Nova empresa"
      />

      <StatusQuickFilter
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
        activeLabel="Ativas"
        inactiveLabel="Inativas"
      />

      <EntityTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(e) => e.id}
        isLoading={isLoading}
        error={error}
        page={data?.page ?? page}
        pageSize={data?.pageSize ?? pageSize}
        total={data?.total ?? 0}
        totalPages={data?.totalPages ?? 1}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n);
          setPage(1);
        }}
        onRowClick={openEdit}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(key, order) => {
          setSortBy(key);
          setSortOrder(order);
        }}
        emptyMessage="Nenhuma empresa cadastrada ou disponível para sua conta."
      />

      {whatsappAlvo && (
        <ConectarWhatsappDialog
          aberto={Boolean(whatsappAlvo)}
          onOpenChange={(open) => {
            if (!open) setWhatsappAlvo(null);
          }}
          empresaId={whatsappAlvo.id}
          empresaNome={whatsappAlvo.nomeFantasia}
        />
      )}
    </div>
  );
}

