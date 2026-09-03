"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  TIPO_VENDEDOR_LABEL,
  VINCULO_VENDEDOR_LABEL,
  type TipoVendedor,
  type Vendedor,
  type VinculoVendedor,
} from "@plataforma/contracts";
import { useResourceList, useResourceMutations } from "@/hooks/use-resource";
import { apiFetch, ApiError } from "@/lib/api-client";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { StatusQuickFilter, type StatusFilterValue } from "@/components/crud/status-quick-filter";
import { FiltersPopover } from "@/components/crud/filters-popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { KeyRound, Lock, MoreHorizontal, Pencil, Trash2, Unlock, UserPlus } from "lucide-react";

type SimNaoTodos = "todos" | "sim" | "nao";

/** Resposta de criar-usuario / reenviar-senha: quando o e-mail não sai,
 * a senha provisória volta aqui pro admin repassar (o acesso já existe). */
interface AcessoVendedorResposta {
  emailEnviado?: boolean;
  senhaProvisoria?: string;
}

/**
 * Texto do aviso: com SMTP fora do ar o acesso é criado do mesmo jeito, e a
 * senha provisória vem na resposta pro admin repassar ao vendedor.
 */
function mensagemAcesso(titulo: string, r: AcessoVendedorResposta) {
  return r.emailEnviado === false && r.senhaProvisoria
    ? `${titulo}, mas o e-mail não pôde ser enviado. Senha provisória: ${r.senhaProvisoria}`
    : `${titulo} — senha provisória enviada por e-mail`;
}

export default function VendedoresPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("nome");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [status, setStatus] = useState<StatusFilterValue>("ativos");
  // O tipo é o recorte principal da tela: as abas agrupam a listagem por
  // papel, e o filtro vai junto para o servidor (uma linha por vendedor, sem
  // paginação bagunçada por agrupamento client-side).
  const [tipo, setTipo] = useState<TipoVendedor | "todos">("todos");
  const [vinculo, setVinculo] = useState<VinculoVendedor | "todos">("todos");
  const [desligado, setDesligado] = useState<SimNaoTodos>("todos");
  const [usaDashboard, setUsaDashboard] = useState<SimNaoTodos>("todos");
  const [superiorId, setSuperiorId] = useState<string | undefined>(undefined);

  const superioresQuery = useQuery({
    queryKey: ["vendedores", "select", "superiores"],
    queryFn: () =>
      apiFetch<{ data: Vendedor[] }>("/vendedores", {
        query: { pageSize: 100, tipo: "superior" },
      }),
  });

  const { data, isLoading, isFetching, refetch, error } = useResourceList<Vendedor>("vendedores", {
    search,
    page,
    pageSize,
    sortBy,
    sortOrder,
    ...(status !== "todos" ? { ativo: status === "ativos" } : {}),
    ...(tipo !== "todos" ? { tipo } : {}),
    ...(vinculo !== "todos" ? { vinculo } : {}),
    ...(usaDashboard !== "todos" ? { usaDashboard: usaDashboard === "sim" } : {}),
    ...(desligado !== "todos" ? { desligado: desligado === "sim" } : {}),
    ...(superiorId ? { superiorId } : {}),
  });

  const { remove } = useResourceMutations("vendedores");
  const queryClient = useQueryClient();

  const openEdit = (v: Vendedor) => router.push(`/gerencial/vendedores/${v.id}`);

  const onDelete = async (v: Vendedor) => {
    if (!confirm(`Excluir o vendedor "${v.nome}"?`)) return;
    try {
      await remove.mutateAsync(v.id);
      toast.success("Vendedor excluído");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir vendedor");
    }
  };

  const criarUsuario = useMutation({
    mutationFn: (id: string) =>
      apiFetch<AcessoVendedorResposta>(`/vendedores/${id}/criar-usuario`, { method: "POST" }),
    onSuccess: (r) => {
      toast.success(mensagemAcesso("Usuário criado", r));
      queryClient.invalidateQueries({ queryKey: ["vendedores"] });
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erro ao criar usuário"),
  });

  const onCriarUsuario = (v: Vendedor) => {
    if (!confirm(`Criar usuário de acesso para "${v.nome}" e enviar senha provisória por e-mail?`)) return;
    criarUsuario.mutate(v.id);
  };

  const reenviarSenha = useMutation({
    mutationFn: (id: string) =>
      apiFetch<AcessoVendedorResposta>(`/vendedores/${id}/reenviar-senha`, { method: "POST" }),
    onSuccess: (r) => toast.success(mensagemAcesso("Senha redefinida", r)),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erro ao reenviar senha"),
  });

  const onReenviarSenha = (v: Vendedor) => {
    if (!confirm(`Enviar uma nova senha provisória para "${v.nome}" (${v.email})?`)) return;
    reenviarSenha.mutate(v.id);
  };

  const toggleBloqueio = useMutation({
    mutationFn: ({ id, bloquear }: { id: string; bloquear: boolean }) =>
      apiFetch(`/vendedores/${id}/${bloquear ? "bloquear" : "desbloquear"}`, { method: "PATCH" }),
    onSuccess: (_data, { bloquear }) => {
      toast.success(bloquear ? "Vendedor bloqueado" : "Vendedor desbloqueado");
      queryClient.invalidateQueries({ queryKey: ["vendedores"] });
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erro ao atualizar bloqueio"),
  });

  const onToggleBloqueio = (v: Vendedor) => {
    const bloquear = v.ativo;
    const msg = bloquear
      ? `Bloquear o vendedor "${v.nome}"?${v.usuarioId ? " O usuário de acesso também será bloqueado." : ""}`
      : `Desbloquear o vendedor "${v.nome}"?${v.usuarioId ? " O usuário de acesso também será reativado." : ""}`;
    if (!confirm(msg)) return;
    toggleBloqueio.mutate({ id: v.id, bloquear });
  };

  const filtrosAtivos =
    vinculo !== "todos" ||
    usaDashboard !== "todos" ||
    desligado !== "todos" ||
    !!superiorId;

  const limparFiltros = () => {
    setVinculo("todos");
    setUsaDashboard("todos");
    setDesligado("todos");
    setSuperiorId(undefined);
    setPage(1);
  };

  const columns: ColumnDef<Vendedor>[] = [
    {
      header: "Nome",
      sortKey: "nome",
      cell: (v) => (
        <div>
          <p className="font-medium">{v.nome}</p>
          {v.nomeReduzido && <p className="text-xs text-muted-foreground">{v.nomeReduzido}</p>}
        </div>
      ),
    },
    {
      header: "Código",
      sortKey: "codigoErp",
      cell: (v) => <span className="font-mono text-xs">{v.codigoErp || "—"}</span>,
    },
    {
      header: "Contato",
      cell: (v) => (
        <div className="text-xs">
          {v.telefone && <p>{v.telefone}</p>}
          {v.email && <p className="text-muted-foreground">{v.email}</p>}
          {!v.telefone && !v.email && "—"}
        </div>
      ),
    },
    {
      header: "Tipo",
      sortKey: "tipo",
      cell: (v) => (
        <div className="flex flex-wrap items-center gap-1">
          <Badge variant="outline">{TIPO_VENDEDOR_LABEL[v.tipo]}</Badge>
          {v.vinculo && (
            <span className="text-xs text-muted-foreground">
              {VINCULO_VENDEDOR_LABEL[v.vinculo]}
            </span>
          )}
        </div>
      ),
    },
    {
      header: "Clientes",
      className: "text-right",
      cell: (v) => (
        <div className="text-xs tabular-nums">
          <p>{(v.clientesAtivos ?? 0).toLocaleString("pt-BR")} ativos</p>
          {(v.clientesInativos ?? 0) > 0 && (
            <p className="text-muted-foreground">
              {(v.clientesInativos ?? 0).toLocaleString("pt-BR")} inativos
            </p>
          )}
        </div>
      ),
    },
    {
      header: "Dashboard",
      cell: (v) => (
        <span className="text-xs text-muted-foreground">{v.usaDashboard ? "Sim" : "—"}</span>
      ),
    },
    {
      header: "% Comissão",
      className: "text-right",
      cell: (v) =>
        v.percComissao != null
          ? `${v.percComissao.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`
          : "—",
    },
    { header: "Status", sortKey: "ativo", cell: (v) => <StatusDot active={v.ativo} /> },
    {
      header: "",
      className: "w-10",
      cell: (v) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" onClick={(ev) => ev.stopPropagation()}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEdit(v)}>
              <Pencil className="size-4" /> Editar
            </DropdownMenuItem>
            {v.ativo && !v.usuarioId && (
              <DropdownMenuItem onClick={() => onCriarUsuario(v)}>
                <UserPlus className="size-4" /> Criar usuário
              </DropdownMenuItem>
            )}
            {v.usuarioId && (
              <DropdownMenuItem onClick={() => onReenviarSenha(v)}>
                <KeyRound className="size-4" /> Reenviar senha
              </DropdownMenuItem>
            )}
            {v.ativo ? (
              <DropdownMenuItem onClick={() => onToggleBloqueio(v)}>
                <Lock className="size-4" /> Bloquear
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => onToggleBloqueio(v)}>
                <Unlock className="size-4" /> Desbloquear
              </DropdownMenuItem>
            )}
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(v)}>
              <Trash2 className="size-4" /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <CrudHeader
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
        onCreate={() => router.push("/gerencial/vendedores/novo")}
        createLabel="Novo vendedor"
      />

      {/* Agrupamento por tipo: cada aba é o recorte de um papel, e o filtro
          vai para o servidor junto com a paginação. */}
      <Tabs
        value={tipo}
        onValueChange={(v) => {
          setTipo(v as TipoVendedor | "todos");
          setPage(1);
        }}
      >
        <TabsList>
          <TabsTrigger value="todos">Todos</TabsTrigger>
          {(Object.keys(TIPO_VENDEDOR_LABEL) as TipoVendedor[]).map((t) => (
            <TabsTrigger key={t} value={t}>
              {TIPO_VENDEDOR_LABEL[t]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusQuickFilter
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
        <FiltersPopover active={filtrosAtivos} onClear={limparFiltros}>
          <div className="space-y-2">
            <FieldLabel>Vínculo</FieldLabel>
            <Select
              value={vinculo}
              onValueChange={(v) => {
                setVinculo(v as VinculoVendedor | "todos");
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {(Object.keys(VINCULO_VENDEDOR_LABEL) as VinculoVendedor[]).map((v) => (
                  <SelectItem key={v} value={v}>
                    {VINCULO_VENDEDOR_LABEL[v]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <FieldLabel>Usa em Dashboard</FieldLabel>
            <Select
              value={usaDashboard}
              onValueChange={(v) => {
                setUsaDashboard(v as SimNaoTodos);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="sim">Sim</SelectItem>
                <SelectItem value="nao">Não</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <FieldLabel>Desligado</FieldLabel>
            <Select
              value={desligado}
              onValueChange={(v) => {
                setDesligado(v as SimNaoTodos);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="sim">Sim</SelectItem>
                <SelectItem value="nao">Não</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <FieldLabel>Superior</FieldLabel>
            <Select
              value={superiorId ?? "none"}
              onValueChange={(v) => {
                setSuperiorId(v === "none" ? undefined : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Qualquer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Qualquer</SelectItem>
                {(superioresQuery.data?.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nomeReduzido || s.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </FiltersPopover>
      </div>

      <EntityTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(v) => v.id}
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
        emptyMessage="Nenhum vendedor cadastrado."
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(key, order) => {
          setSortBy(key);
          setSortOrder(order);
        }}
      />
    </div>
  );
}
