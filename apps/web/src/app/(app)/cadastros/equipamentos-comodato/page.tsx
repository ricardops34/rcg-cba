"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DatabaseZap, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import type {
  EquipamentoComodato,
  EquipamentoExcluirLoteResultado,
  Produto,
} from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useResourceList } from "@/hooks/use-resource";
import { useAuthStore } from "@/stores/auth-store";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { StatusQuickFilter, type StatusFilterValue } from "@/components/crud/status-quick-filter";
import { ProdutoCombobox } from "@/components/crud/produto-combobox";
import { EquipamentoPopularDialog } from "@/components/crud/equipamento-popular-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const RECURSO = "equipamentos-comodato";

/**
 * Equipamentos de comodato: o produto que pode ser comodatado e, no detalhe,
 * os produtos que se aplicam nele (ver docs/planos/equipamentos-comodato.md).
 */
export default function EquipamentosComodatoPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const podeCadastrar = useAuthStore((s) => s.hasPermission(RECURSO, "cadastrar"));
  const podePopular = useAuthStore((s) => s.hasPermission(RECURSO, "importar"));
  const podeExcluir = useAuthStore((s) => s.hasPermission(RECURSO, "excluir"));

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState("descricao");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [status, setStatus] = useState<StatusFilterValue>("ativos");
  const [semAplicacao, setSemAplicacao] = useState(false);
  const [novoAberto, setNovoAberto] = useState(false);
  const [produto, setProduto] = useState<Produto | null>(null);
  const [popularAberto, setPopularAberto] = useState(false);
  // Seleção para exclusão em lote; atravessa páginas, mas filtro novo limpa —
  // senão o lote incluiria linhas que a pessoa já não está vendo.
  const [selecionados, setSelecionados] = useState<string[]>([]);

  const { data, isLoading, isFetching, refetch, error } = useResourceList<EquipamentoComodato>(
    RECURSO,
    {
      search,
      page,
      pageSize,
      sortBy,
      sortOrder,
      ...(status !== "todos" ? { ativo: status === "ativos" } : {}),
      ...(semAplicacao ? { semAplicacao: true } : {}),
    },
  );

  const invalidar = () => void queryClient.invalidateQueries({ queryKey: [RECURSO] });

  const criar = useMutation({
    mutationFn: () =>
      apiFetch<{ id: string }>(`/${RECURSO}`, {
        method: "POST",
        body: { produtoId: produto?.id },
      }),
    onSuccess: (r) => {
      toast.success("Equipamento cadastrado");
      setNovoAberto(false);
      setProduto(null);
      invalidar();
      router.push(`/cadastros/equipamentos-comodato/${r.id}`);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Não foi possível cadastrar"),
  });

  const excluirLote = useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch<EquipamentoExcluirLoteResultado>(`/${RECURSO}/excluir-lote`, {
        method: "POST",
        body: { ids },
      }),
    onSuccess: (r) => {
      toast.success(`${r.excluidos} equipamento(s) excluído(s)`);
      if (r.comAplicacoes > 0)
        toast.warning(
          `${r.comAplicacoes} não excluído(s) por ter produtos aplicáveis — exclua pelo detalhe.`,
        );
      setSelecionados([]);
      invalidar();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Não foi possível excluir"),
  });

  const confirmarExclusaoLote = () => {
    if (
      window.confirm(
        `Excluir ${selecionados.length} equipamento(s) do cadastro? Os produtos aplicáveis continuam no produto e voltam se o equipamento for cadastrado de novo.`,
      )
    )
      excluirLote.mutate(selecionados);
  };

  const excluir = useMutation({
    mutationFn: (id: string) => apiFetch(`/${RECURSO}/${id}`, { method: "DELETE" }),
    onSuccess: (_r, id) => {
      toast.success("Equipamento excluído");
      setSelecionados((atual) => atual.filter((s) => s !== id));
      invalidar();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Não foi possível excluir"),
  });

  const abrir = (e: EquipamentoComodato) =>
    router.push(`/cadastros/equipamentos-comodato/${e.id}`);

  // Mesma confirmação do detalhe: excluir daqui poupa abrir o equipamento só
  // para isso.
  const confirmarExclusao = (e: EquipamentoComodato) => {
    if (
      window.confirm(
        `Excluir "${e.produto.descricao}" do cadastro? Os produtos aplicáveis continuam no produto e voltam se ele for cadastrado de novo.`,
      )
    )
      excluir.mutate(e.id);
  };

  const columns: ColumnDef<EquipamentoComodato>[] = [
    {
      header: "Código",
      sortKey: "codigoErp",
      cell: (e) => <span className="font-mono text-xs">{e.produto.codigoErp}</span>,
    },
    {
      header: "Equipamento",
      sortKey: "descricao",
      cell: (e) => <p className="font-medium">{e.produto.descricao}</p>,
    },
    {
      header: "Categoria",
      cell: (e) => <span className="text-xs">{e.produto.categoria ?? "—"}</span>,
    },
    {
      header: "Produtos aplicáveis",
      className: "text-right",
      cell: (e) =>
        e.totalAplicacoes > 0 ? (
          e.totalAplicacoes
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Nenhum
          </Badge>
        ),
    },
    {
      header: "Clientes que receberam",
      className: "text-right",
      cell: (e) => e.totalClientes,
    },
    { header: "Status", cell: (e) => <StatusDot active={e.ativo} /> },
    ...(podeExcluir
      ? [
          {
            header: "",
            className: "w-10",
            cell: (e: EquipamentoComodato) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label="Ações"
                    onClick={(ev) => ev.stopPropagation()}
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(ev) => ev.stopPropagation()}>
                  <DropdownMenuItem onClick={() => abrir(e)}>
                    <Pencil className="size-4" /> Abrir
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={excluir.isPending}
                    onClick={() => confirmarExclusao(e)}
                  >
                    <Trash2 className="size-4" /> Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ),
          } satisfies ColumnDef<EquipamentoComodato>,
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <CrudHeader
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setSelecionados([]);
          setPage(1);
        }}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
        actions={
          <>
            {podePopular && (
              <Button variant="outline" onClick={() => setPopularAberto(true)}>
                <DatabaseZap className="size-4" />
                Popular pelas notas
              </Button>
            )}
            {podeCadastrar && (
              <Button onClick={() => setNovoAberto(true)}>
                <Plus className="size-4" />
                Novo equipamento
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-4">
        <StatusQuickFilter
          value={status}
          onChange={(v) => {
            setStatus(v);
            setSelecionados([]);
            setPage(1);
          }}
        />
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={semAplicacao}
            onCheckedChange={(v) => {
              setSemAplicacao(v === true);
              setSelecionados([]);
              setPage(1);
            }}
          />
          Só os sem produtos aplicáveis
        </label>
      </div>

      {selecionados.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <span className="font-medium">{selecionados.length} selecionado(s)</span>
          <Button variant="ghost" size="sm" onClick={() => setSelecionados([])}>
            Limpar seleção
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="ml-auto"
            disabled={excluirLote.isPending}
            onClick={confirmarExclusaoLote}
          >
            <Trash2 className="size-4" />
            Excluir selecionados
          </Button>
        </div>
      )}

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
        onRowClick={abrir}
        {...(podeExcluir
          ? {
              selectedKeys: selecionados,
              onSelectedKeysChange: setSelecionados,
              // A API recusa também; aqui só evita marcar o que não vai sair.
              rowSelectionBlocked: (e: EquipamentoComodato) =>
                e.totalAplicacoes > 0
                  ? "Tem produtos aplicáveis: exclua pelo detalhe do equipamento"
                  : null,
            }
          : {})}
        emptyMessage="Nenhum equipamento cadastrado. Use “Popular pelas notas” para trazer os que já saíram em comodato."
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(key, order) => {
          setSortBy(key);
          setSortOrder(order);
        }}
      />

      <Dialog open={novoAberto} onOpenChange={(o) => !o && setNovoAberto(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo equipamento de comodato</DialogTitle>
            <DialogDescription>
              Escolha o produto que pode ser emprestado ao cliente. Os produtos aplicáveis
              são cadastrados em seguida, no detalhe.
            </DialogDescription>
          </DialogHeader>
          <ProdutoCombobox value={produto?.id ?? null} onChange={setProduto} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoAberto(false)}>
              Cancelar
            </Button>
            <Button disabled={!produto || criar.isPending} onClick={() => criar.mutate()}>
              Cadastrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EquipamentoPopularDialog
        open={popularAberto}
        onOpenChange={setPopularAberto}
        onPopulado={() => {
          setPopularAberto(false);
          invalidar();
        }}
      />
    </div>
  );
}
