"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ORIGEM_FERIADO_LABEL, type Feriado } from "@plataforma/contracts";
import { useResourceMutations } from "@/hooks/use-resource";
import { ApiError, apiFetch } from "@/lib/api-client";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CalendarPlus, ChevronLeft, ChevronRight, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

const DIA_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/** "AAAA-MM-DD" → "dd/mm/aaaa" e o dia da semana, sem passar por fuso. */
function formatarDia(dia: string) {
  const [ano, mes, d] = dia.split("-").map(Number);
  const semana = DIA_SEMANA[new Date(Date.UTC(ano, mes - 1, d)).getUTCDay()];
  return { data: `${String(d).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`, semana };
}

export default function FeriadosPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [ano, setAno] = useState(() => new Date().getFullYear());
  const [search, setSearch] = useState("");

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["feriados", "list", ano],
    queryFn: () => apiFetch<Feriado[]>("/feriados", { query: { ano } }),
  });

  const { remove } = useResourceMutations("feriados");

  const gerar = useMutation({
    mutationFn: () =>
      apiFetch<{ criados: number; existentes: number }>("/feriados/gerar-nacionais", {
        method: "POST",
        body: { ano },
      }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["feriados"] });
      toast.success(
        r.criados === 0
          ? `Os feriados nacionais de ${ano} já estavam cadastrados`
          : `${r.criados} feriado(s) nacional(is) de ${ano} cadastrado(s)`,
      );
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erro ao gerar feriados"),
  });

  const rows = useMemo(() => {
    const termo = search.trim().toLowerCase();
    const lista = data ?? [];
    return termo ? lista.filter((f) => f.descricao.toLowerCase().includes(termo)) : lista;
  }, [data, search]);

  const openEdit = (f: Feriado) => router.push(`/admin/feriados/${f.id}`);

  const onDelete = async (f: Feriado) => {
    if (!confirm(`Excluir o feriado "${f.descricao}" (${formatarDia(f.data).data})?`)) return;
    try {
      await remove.mutateAsync(f.id);
      toast.success("Feriado excluído");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir feriado");
    }
  };

  const columns: ColumnDef<Feriado>[] = [
    {
      header: "Data",
      cell: (f) => {
        const { data: dia, semana } = formatarDia(f.data);
        return (
          <div>
            <p className="font-medium tabular-nums">{dia}</p>
            <p className="text-xs text-muted-foreground">{semana}</p>
          </div>
        );
      },
    },
    { header: "Descrição", cell: (f) => f.descricao },
    {
      header: "Origem",
      cell: (f) => (
        <Badge variant={f.origem === "manual" ? "default" : "secondary"}>{ORIGEM_FERIADO_LABEL[f.origem]}</Badge>
      ),
    },
    {
      header: "",
      className: "w-10",
      cell: (f) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" onClick={(ev) => ev.stopPropagation()}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEdit(f)}>
              <Pencil className="size-4" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(f)}>
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
        onSearchChange={setSearch}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
        onCreate={() => router.push("/admin/feriados/novo")}
        createLabel="Novo feriado"
        placeholder="Buscar feriado..."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="size-8" onClick={() => setAno((a) => a - 1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="w-16 text-center text-sm font-semibold tabular-nums">{ano}</span>
          <Button variant="outline" size="icon" className="size-8" onClick={() => setAno((a) => a + 1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={() => gerar.mutate()} disabled={gerar.isPending}>
          <CalendarPlus className="size-4" /> Gerar feriados nacionais de {ano}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        No feriado, quem tem &quot;Restringir acesso ao expediente&quot; no cadastro de usuário não acessa o sistema.
        Os demais usuários não são afetados.
      </p>

      <EntityTable
        columns={columns}
        rows={rows}
        rowKey={(f) => f.id}
        isLoading={isLoading}
        error={error}
        page={1}
        pageSize={Math.max(rows.length, 1)}
        total={rows.length}
        totalPages={1}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
        onRowClick={openEdit}
        emptyMessage={`Nenhum feriado cadastrado em ${ano}. Use "Gerar feriados nacionais" e inclua os municipais.`}
      />
    </div>
  );
}
