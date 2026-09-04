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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Settings2 } from "lucide-react";
import { SituacaoDialog } from "./situacao-dialog";
import { PlataformaGuard } from "../plataforma-guard";

type Filtro = "todas" | "teste" | "ativa" | "suspensa" | "expiradas";

/** Cor do selo por situação — expirado tem cor própria, é o que pede ação. */
function SituacaoBadge({ empresa }: { empresa: PlataformaEmpresa }) {
  if (empresa.testeExpirado) {
    return <Badge variant="destructive">Teste vencido</Badge>;
  }
  const variante =
    empresa.situacao === "ativa"
      ? "default"
      : empresa.situacao === "teste"
        ? "secondary"
        : "outline";
  return <Badge variant={variante}>{SITUACAO_EMPRESA_LABEL[empresa.situacao]}</Badge>;
}

/**
 * Uso do limite. Sem limite não vira "0 de ∞" — mostra só o número, porque
 * "ilimitado" não é informação que alguém precise reler a cada linha.
 */
function UsoDeUsuarios({ empresa }: { empresa: PlataformaEmpresa }) {
  if (empresa.limiteUsuarios === null) {
    return <span className="text-muted-foreground">{empresa.usuariosAtivos}</span>;
  }
  const cheio = empresa.usuariosAtivos >= empresa.limiteUsuarios;
  return (
    <span className={cheio ? "font-medium text-destructive" : undefined}>
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

  const columns: ColumnDef<PlataformaEmpresa>[] = [
    {
      header: "Empresa",
      sortKey: "nomeFantasia",
      cell: (e) => (
        <div>
          <div className="font-medium">{e.nomeFantasia}</div>
          <div className="text-xs text-muted-foreground">{e.razaoSocial}</div>
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
          <span className={e.testeExpirado ? "text-destructive" : undefined}>
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
        <span className="text-muted-foreground">{formatarData(e.ultimoAcesso)}</span>
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
      <div className="space-y-4">
        <CrudHeader
          search={search}
          onSearchChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          onRefresh={() => refetch()}
          isRefreshing={isFetching}
          onCreate={() => router.push("/plataforma/empresas/nova")}
          createLabel="Nova empresa"
        />

        <QuickFilterGroup>
          {(
            [
              ["todas", "Todas"],
              ["teste", "Em teste"],
              ["expiradas", "Teste vencido"],
              ["ativa", "Ativas"],
              ["suspensa", "Suspensas"],
            ] as const
          ).map(([valor, rotulo]) => (
            <QuickFilterButton
              key={valor}
              active={filtro === valor}
              onClick={() => {
                setFiltro(valor);
                setPage(1);
              }}
            >
              {rotulo}
            </QuickFilterButton>
          ))}
        </QuickFilterGroup>

        <EntityTable
          columns={columns}
          rows={data?.data ?? []}
          rowKey={(e) => e.id}
          isLoading={isLoading}
          error={error}
          emptyMessage="Nenhuma empresa encontrada."
          page={data?.page ?? page}
          pageSize={data?.pageSize ?? pageSize}
          total={data?.total ?? 0}
          totalPages={data?.totalPages ?? 1}
          onPageChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
          onRowClick={(e) => setEmEdicao(e)}
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
            toast.success("Empresa atualizada");
          }}
        />
      </div>
    </PlataformaGuard>
  );
}
