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
import { PlataformaGuard } from "../plataforma-guard";

const ACOES = [
  ["", "Todas"],
  ["empresa.criada", "Criação"],
  ["empresa.situacao_alterada", "Situação"],
  ["empresa.teste_alterado", "Teste"],
  ["empresa.limite_alterado", "Limite"],
  ["admin.promovido", "Admin promovido"],
  ["admin.revogado", "Admin removido"],
] as const;

const formatarDataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * Antes → depois. Só mostra a seta quando existe um "antes": na criação de
 * empresa não há valor anterior, e um "— → ativa" seria ruído.
 */
function Mudanca({ linha }: { linha: PlataformaAuditoria }) {
  if (!linha.valorNovo) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="text-sm">
      {linha.valorAnterior && (
        <>
          <span className="text-muted-foreground line-through">
            {linha.valorAnterior}
          </span>
          <span className="mx-1.5 text-muted-foreground">→</span>
        </>
      )}
      <span>{linha.valorNovo}</span>
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

  const columns: ColumnDef<PlataformaAuditoria>[] = [
    {
      header: "Quando",
      className: "w-40",
      cell: (l) => (
        <span className="text-sm whitespace-nowrap">
          {formatarDataHora(l.createdAt)}
        </span>
      ),
    },
    {
      header: "Ação",
      cell: (l) => (
        <Badge variant="outline">{PLATAFORMA_ACAO_LABEL[l.acao] ?? l.acao}</Badge>
      ),
    },
    {
      header: "Empresa",
      cell: (l) =>
        l.empresaRazaoSocial ?? <span className="text-muted-foreground">—</span>,
    },
    { header: "Mudança", cell: (l) => <Mudanca linha={l} /> },
    {
      header: "Quem",
      cell: (l) => (
        <span className="text-sm text-muted-foreground">{l.usuarioEmail}</span>
      ),
    },
  ];

  return (
    <PlataformaGuard>
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold">Registro de alterações</h1>
          <p className="text-sm text-muted-foreground">
            O que a administração da plataforma mudou, quando e por quem. Mais
            recentes primeiro.
          </p>
        </div>

        <QuickFilterGroup>
          {ACOES.map(([valor, rotulo]) => (
            <QuickFilterButton
              key={valor || "todas"}
              active={acao === valor}
              onClick={() => {
                setAcao(valor);
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
          rowKey={(l) => l.id}
          isLoading={isLoading}
          error={error}
          emptyMessage="Nenhuma alteração registrada ainda."
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
