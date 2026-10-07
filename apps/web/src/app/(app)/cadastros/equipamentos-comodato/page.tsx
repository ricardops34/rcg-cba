"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DatabaseZap, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import type {
  EquipamentoComodato,
  EquipamentoPopularResultado,
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

  const popular = useMutation({
    mutationFn: () =>
      apiFetch<EquipamentoPopularResultado>(`/${RECURSO}/popular`, { method: "POST" }),
    onSuccess: (r) => {
      setPopularAberto(false);
      toast.success(
        r.criados === 0
          ? "Nenhum equipamento novo: todos os produtos das remessas já estavam no cadastro."
          : `${r.criados} equipamento(s) cadastrado(s) a partir das notas de comodato.`,
      );
      invalidar();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Não foi possível popular"),
  });

  const excluir = useMutation({
    mutationFn: (id: string) => apiFetch(`/${RECURSO}/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Equipamento excluído");
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
            setPage(1);
          }}
        />
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={semAplicacao}
            onCheckedChange={(v) => {
              setSemAplicacao(v === true);
              setPage(1);
            }}
          />
          Só os sem produtos aplicáveis
        </label>
      </div>

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

      <Dialog open={popularAberto} onOpenChange={(o) => !o && setPopularAberto(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Popular pelas notas de comodato</DialogTitle>
            <DialogDescription>
              Cadastra como equipamento todo produto que já saiu em remessa de comodato
              (CFOP 5908/6908). O que já está no cadastro não muda, e o que foi excluído
              continua excluído. Os produtos aplicáveis não são gravados aqui: cada
              equipamento mostra sugestões no detalhe, para você confirmar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPopularAberto(false)}>
              Cancelar
            </Button>
            <Button disabled={popular.isPending} onClick={() => popular.mutate()}>
              Popular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
