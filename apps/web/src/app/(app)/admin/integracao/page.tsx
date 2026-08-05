"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  integracaoApiKeyCreateSchema,
  type IntegracaoApiKey,
  type IntegracaoApiKeyCreate,
  type IntegracaoApiKeyCriada,
} from "@plataforma/contracts";
import { useResourceList, useResourceMutations } from "@/hooks/use-resource";
import { apiFetch, ApiError } from "@/lib/api-client";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
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
import { Copy, Check, KeyRound, MoreHorizontal, ShieldOff, ShieldCheck, Trash2 } from "lucide-react";

const dataBr = (v: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};
const dataHoraBr = (v: string | null) => {
  if (!v) return "Nunca usada";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR");
};

export default function IntegracaoPage() {
  const [novaChaveAberta, setNovaChaveAberta] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data, isLoading, isFetching, refetch } = useResourceList<IntegracaoApiKey>(
    "integracao-keys",
    { search, page, pageSize, sortBy: "createdAt", sortOrder: "desc" },
  );
  const { update, remove } = useResourceMutations<never, { ativo: boolean }>("integracao-keys");

  const onToggleAtivo = async (chave: IntegracaoApiKey) => {
    try {
      await update.mutateAsync({ id: chave.id, input: { ativo: !chave.ativo } });
      toast.success(chave.ativo ? "Chave revogada" : "Chave reativada");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao atualizar chave");
    }
  };

  const onDelete = async (chave: IntegracaoApiKey) => {
    if (!confirm(`Excluir a chave "${chave.nome}"? Isso não pode ser desfeito.`)) return;
    try {
      await remove.mutateAsync(chave.id);
      toast.success("Chave excluída");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir chave");
    }
  };

  const columns: ColumnDef<IntegracaoApiKey>[] = [
    {
      header: "Nome",
      cell: (c) => (
        <div className="flex items-center gap-2">
          <KeyRound className="size-3.5 text-muted-foreground" />
          <p className="font-medium">{c.nome}</p>
        </div>
      ),
    },
    { header: "Prefixo", cell: (c) => <code className="text-xs">{c.prefixo}…</code> },
    { header: "Status", cell: (c) => <StatusDot active={c.ativo} /> },
    { header: "Expira em", cell: (c) => dataBr(c.expiraEm) },
    {
      header: "Último uso",
      cell: (c) => <span className="text-xs text-muted-foreground">{dataHoraBr(c.ultimoUso)}</span>,
    },
    {
      header: "",
      className: "w-10",
      cell: (c) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" onClick={(ev) => ev.stopPropagation()}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onToggleAtivo(c)}>
              {c.ativo ? (
                <>
                  <ShieldOff className="size-4" /> Revogar
                </>
              ) : (
                <>
                  <ShieldCheck className="size-4" /> Reativar
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(c)}>
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
        onCreate={() => setNovaChaveAberta(true)}
        createLabel="Nova chave"
      />

      <p className="text-sm text-muted-foreground">
        Chaves de API pra um ERP externo empurrar dados continuamente (upsert em lote,
        idempotente). Veja os endpoints em{" "}
        <code className="text-xs">/api/docs</code>, seção &quot;integracao&quot;.
      </p>

      <EntityTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(c) => c.id}
        isLoading={isLoading}
        page={data?.page ?? page}
        pageSize={data?.pageSize ?? pageSize}
        total={data?.total ?? 0}
        totalPages={data?.totalPages ?? 1}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n);
          setPage(1);
        }}
        emptyMessage="Nenhuma chave de integração cadastrada."
      />

      {novaChaveAberta && <NovaChaveDialog onClose={() => setNovaChaveAberta(false)} />}
    </div>
  );
}

function NovaChaveDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [criada, setCriada] = useState<IntegracaoApiKeyCriada | null>(null);
  const [copiado, setCopiado] = useState(false);

  const form = useForm<IntegracaoApiKeyCreate>({
    resolver: zodResolver(integracaoApiKeyCreateSchema),
    defaultValues: { nome: "", expiraEm: null },
  });

  const criar = useMutation({
    mutationFn: (input: IntegracaoApiKeyCreate) =>
      apiFetch<IntegracaoApiKeyCriada>("/integracao-keys", { method: "POST", body: input }),
    onSuccess: (resultado) => {
      setCriada(resultado);
      queryClient.invalidateQueries({ queryKey: ["integracao-keys", "list"] });
    },
  });

  const onSubmit = async (values: IntegracaoApiKeyCreate) => {
    try {
      await criar.mutateAsync(values);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao criar chave");
    }
  };

  const copiar = async () => {
    if (!criada) return;
    await navigator.clipboard.writeText(criada.chave);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {criada ? (
          <>
            <DialogHeader>
              <DialogTitle>Chave criada</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <p className="text-sm text-destructive">
                Copie agora — esta chave não aparece de novo. Se perdida, revogue e crie outra.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-md border bg-muted px-3 py-2 text-xs">
                  {criada.chave}
                </code>
                <Button type="button" variant="outline" size="icon" onClick={copiar}>
                  {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" onClick={onClose}>
                Fechar
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <DialogHeader>
              <DialogTitle>Nova chave de integração</DialogTitle>
            </DialogHeader>
            <FieldGroup className="py-4">
              <Field data-invalid={!!form.formState.errors.nome}>
                <FieldLabel htmlFor="nome">Nome</FieldLabel>
                <Input id="nome" placeholder="Ex.: ERP Protheus - produção" {...form.register("nome")} />
                <FieldError errors={[form.formState.errors.nome]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="expiraEm">Expira em (opcional)</FieldLabel>
                <Input
                  id="expiraEm"
                  type="date"
                  onChange={(e) =>
                    form.setValue("expiraEm", e.target.value ? new Date(`${e.target.value}T00:00:00`) : null)
                  }
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                Criar
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
