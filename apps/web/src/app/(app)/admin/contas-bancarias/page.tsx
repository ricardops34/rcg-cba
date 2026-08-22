"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Star, Trash2 } from "lucide-react";
import type { ContaBancaria } from "@plataforma/contracts";
import { BANCO_BOLETO_LABEL } from "@plataforma/contracts";
import { useResourceList, useResourceMutations } from "@/hooks/use-resource";
import { ApiError } from "@/lib/api-client";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import {
  StatusQuickFilter,
  type StatusFilterValue,
} from "@/components/crud/status-quick-filter";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface FormState {
  descricao: string;
  banco: string;
  agencia: string;
  agenciaDv: string;
  conta: string;
  contaDv: string;
  carteira: string;
  beneficiarioNome: string;
  beneficiarioDocumento: string;
  beneficiarioEndereco: string;
  localPagamento: string;
  especieDocumento: string;
  aceite: string;
  instrucoes: string;
  multaPerc: string;
  jurosMesPerc: string;
  diasProtesto: string;
  padrao: boolean;
  ativo: boolean;
}

const FORM_VAZIO: FormState = {
  descricao: "",
  banco: "237",
  agencia: "",
  agenciaDv: "",
  conta: "",
  contaDv: "",
  carteira: "",
  beneficiarioNome: "",
  beneficiarioDocumento: "",
  beneficiarioEndereco: "",
  localPagamento: "Pagável em qualquer banco até o vencimento",
  especieDocumento: "DM",
  aceite: "N",
  instrucoes: "",
  multaPerc: "",
  jurosMesPerc: "",
  diasProtesto: "",
  padrao: false,
  ativo: true,
};

/** Campo numérico opcional: em branco vira null, não zero. */
const numeroOuNulo = (v: string) => {
  const t = v.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const textoOuNulo = (v: string) => (v.trim() ? v.trim() : null);

/**
 * Contas Bancárias — o convênio de cobrança usado na 2ª via de boleto
 * (ver `docs/planos/segunda-via-danfe-boleto.md`).
 *
 * Fica em Administração, e não em Cadastros, porque agência, conta e carteira
 * entram no código de barras: valor errado aqui não dá erro em tela nenhuma —
 * dá um boleto que o cliente tenta pagar e o banco recusa.
 */
export default function ContasBancariasPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("descricao");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [status, setStatus] = useState<StatusFilterValue>("todos");

  const [editando, setEditando] = useState<ContaBancaria | null>(null);
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState<FormState>(FORM_VAZIO);

  const { data, isLoading, isFetching, refetch, error } =
    useResourceList<ContaBancaria>("contas-bancarias", {
      search,
      page,
      pageSize,
      sortBy,
      sortOrder,
      ...(status !== "todos" ? { ativo: status === "ativos" } : {}),
    });
  const { create, update, remove } = useResourceMutations("contas-bancarias");

  useEffect(() => {
    if (!aberto) return;
    setForm(
      editando
        ? {
            descricao: editando.descricao,
            banco: editando.banco,
            agencia: editando.agencia,
            agenciaDv: editando.agenciaDv ?? "",
            conta: editando.conta,
            contaDv: editando.contaDv ?? "",
            carteira: editando.carteira,
            beneficiarioNome: editando.beneficiarioNome ?? "",
            beneficiarioDocumento: editando.beneficiarioDocumento ?? "",
            beneficiarioEndereco: editando.beneficiarioEndereco ?? "",
            localPagamento: editando.localPagamento,
            especieDocumento: editando.especieDocumento,
            aceite: editando.aceite,
            instrucoes: editando.instrucoes ?? "",
            multaPerc: editando.multaPerc?.toString() ?? "",
            jurosMesPerc: editando.jurosMesPerc?.toString() ?? "",
            diasProtesto: editando.diasProtesto?.toString() ?? "",
            padrao: editando.padrao,
            ativo: editando.ativo,
          }
        : FORM_VAZIO,
    );
  }, [aberto, editando]);

  const salvar = async () => {
    if (!form.descricao.trim() || !form.agencia.trim() || !form.conta.trim() || !form.carteira.trim()) {
      toast.error("Descrição, agência, conta e carteira são obrigatórias");
      return;
    }
    const input = {
      descricao: form.descricao.trim(),
      banco: form.banco,
      agencia: form.agencia.trim(),
      agenciaDv: textoOuNulo(form.agenciaDv),
      conta: form.conta.trim(),
      contaDv: textoOuNulo(form.contaDv),
      carteira: form.carteira.trim(),
      beneficiarioNome: textoOuNulo(form.beneficiarioNome),
      beneficiarioDocumento: textoOuNulo(form.beneficiarioDocumento),
      beneficiarioEndereco: textoOuNulo(form.beneficiarioEndereco),
      localPagamento: form.localPagamento.trim(),
      especieDocumento: form.especieDocumento.trim(),
      aceite: form.aceite.trim(),
      instrucoes: textoOuNulo(form.instrucoes),
      multaPerc: numeroOuNulo(form.multaPerc),
      jurosMesPerc: numeroOuNulo(form.jurosMesPerc),
      diasProtesto: numeroOuNulo(form.diasProtesto),
      padrao: form.padrao,
      ativo: form.ativo,
    };
    try {
      if (editando) {
        await update.mutateAsync({ id: editando.id, input });
        toast.success("Conta atualizada");
      } else {
        await create.mutateAsync(input);
        toast.success("Conta cadastrada");
      }
      setAberto(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar");
    }
  };

  const excluir = async (c: ContaBancaria) => {
    if (!confirm(`Excluir a conta "${c.descricao}"?`)) return;
    try {
      await remove.mutateAsync(c.id);
      toast.success("Conta excluída");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir");
    }
  };

  const columns: ColumnDef<ContaBancaria>[] = [
    {
      header: "Descrição",
      sortKey: "descricao",
      cell: (c) => (
        <span className="flex items-center gap-1.5 font-medium">
          {c.padrao && <Star className="size-3.5 shrink-0 text-primary" />}
          {c.descricao}
        </span>
      ),
    },
    {
      header: "Banco",
      sortKey: "banco",
      cell: (c) =>
        `${c.banco} — ${BANCO_BOLETO_LABEL[c.banco as keyof typeof BANCO_BOLETO_LABEL] ?? "—"}`,
    },
    {
      header: "Agência / Conta",
      sortKey: "agencia",
      cell: (c) =>
        `${c.agencia}${c.agenciaDv ? `-${c.agenciaDv}` : ""} / ${c.conta}${c.contaDv ? `-${c.contaDv}` : ""}`,
    },
    { header: "Carteira", cell: (c) => c.carteira },
    {
      header: "Encargos",
      cell: (c) =>
        [
          c.multaPerc ? `multa ${c.multaPerc}%` : null,
          c.jurosMesPerc ? `juros ${c.jurosMesPerc}%/mês` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "—",
    },
    {
      header: "Status",
      sortKey: "ativo",
      cell: (c) => (
        <StatusDot active={c.ativo} labelOn="Ativa" labelOff="Inativa" />
      ),
    },
    {
      header: "",
      className: "w-10",
      cell: (c) => (
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
          <DropdownMenuContent align="end" onClick={(ev) => ev.stopPropagation()}>
            <DropdownMenuItem
              onClick={() => {
                setEditando(c);
                setAberto(true);
              }}
            >
              <Pencil className="size-4" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => excluir(c)}>
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
        onCreate={() => {
          setEditando(null);
          setAberto(true);
        }}
        createLabel="Nova conta"
      />

      <StatusQuickFilter
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
      />

      <EntityTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(c) => c.id}
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
        onRowClick={(c) => {
          setEditando(c);
          setAberto(true);
        }}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(key, order) => {
          setSortBy(key);
          setSortOrder(order);
        }}
      />

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editando ? "Editar conta bancária" : "Nova conta bancária"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              Estes dados entram no código de barras do boleto. Confira agência,
              conta e carteira com o extrato ou com o gerente: um dígito errado
              produz um boleto que o banco recusa no caixa, sem erro nenhum aqui.
            </p>

            <div className="space-y-1.5">
              <FieldLabel htmlFor="descricao">Descrição</FieldLabel>
              <Input
                id="descricao"
                value={form.descricao}
                maxLength={80}
                placeholder="Bradesco 237 — carteira 09"
                onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                É por esta descrição que o ERP indica a conta ao enviar o título.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-1.5">
                <FieldLabel htmlFor="banco">Banco</FieldLabel>
                <Input id="banco" value="237 — Bradesco" disabled />
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="agencia">Agência</FieldLabel>
                <div className="flex items-center gap-1">
                  <Input
                    id="agencia"
                    value={form.agencia}
                    inputMode="numeric"
                    maxLength={5}
                    onChange={(e) => setForm((f) => ({ ...f, agencia: e.target.value }))}
                  />
                  <span className="text-muted-foreground">-</span>
                  <Input
                    className="w-12"
                    value={form.agenciaDv}
                    inputMode="numeric"
                    maxLength={1}
                    onChange={(e) => setForm((f) => ({ ...f, agenciaDv: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="conta">Conta</FieldLabel>
                <div className="flex items-center gap-1">
                  <Input
                    id="conta"
                    value={form.conta}
                    inputMode="numeric"
                    maxLength={9}
                    onChange={(e) => setForm((f) => ({ ...f, conta: e.target.value }))}
                  />
                  <span className="text-muted-foreground">-</span>
                  <Input
                    className="w-12"
                    value={form.contaDv}
                    inputMode="numeric"
                    maxLength={1}
                    onChange={(e) => setForm((f) => ({ ...f, contaDv: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="carteira">Carteira</FieldLabel>
                <Input
                  id="carteira"
                  value={form.carteira}
                  inputMode="numeric"
                  maxLength={2}
                  placeholder="09"
                  onChange={(e) => setForm((f) => ({ ...f, carteira: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <FieldLabel htmlFor="multaPerc">Multa (%)</FieldLabel>
                <Input
                  id="multaPerc"
                  value={form.multaPerc}
                  inputMode="decimal"
                  placeholder="2"
                  onChange={(e) => setForm((f) => ({ ...f, multaPerc: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="jurosMesPerc">Juros (% ao mês)</FieldLabel>
                <Input
                  id="jurosMesPerc"
                  value={form.jurosMesPerc}
                  inputMode="decimal"
                  placeholder="1"
                  onChange={(e) => setForm((f) => ({ ...f, jurosMesPerc: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="diasProtesto">Protesto (dias)</FieldLabel>
                <Input
                  id="diasProtesto"
                  value={form.diasProtesto}
                  inputMode="numeric"
                  onChange={(e) => setForm((f) => ({ ...f, diasProtesto: e.target.value }))}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Multa e juros são usados para <strong>atualizar o valor</strong> do
              boleto de título vencido, e saem detalhados nas instruções da ficha.
              Em branco: a 2ª via sai pelo valor original.
            </p>

            <div className="space-y-1.5">
              <FieldLabel htmlFor="instrucoes">Instruções ao caixa</FieldLabel>
              <Textarea
                id="instrucoes"
                rows={3}
                value={form.instrucoes}
                onChange={(e) => setForm((f) => ({ ...f, instrucoes: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Uma por linha. As linhas de multa, juros e protesto são
                acrescentadas automaticamente.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-2">
                <FieldLabel htmlFor="localPagamento">Local de pagamento</FieldLabel>
                <Input
                  id="localPagamento"
                  value={form.localPagamento}
                  maxLength={120}
                  onChange={(e) => setForm((f) => ({ ...f, localPagamento: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="especieDocumento">Espécie</FieldLabel>
                  <Input
                    id="especieDocumento"
                    value={form.especieDocumento}
                    maxLength={5}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, especieDocumento: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="aceite">Aceite</FieldLabel>
                  <Input
                    id="aceite"
                    value={form.aceite}
                    maxLength={1}
                    onChange={(e) => setForm((f) => ({ ...f, aceite: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <FieldLabel htmlFor="beneficiarioNome">Beneficiário</FieldLabel>
              <Input
                id="beneficiarioNome"
                value={form.beneficiarioNome}
                maxLength={120}
                placeholder="Em branco: usa a razão social da empresa"
                onChange={(e) =>
                  setForm((f) => ({ ...f, beneficiarioNome: e.target.value }))
                }
              />
            </div>

            <div className="flex items-center gap-6">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Switch
                  checked={form.padrao}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, padrao: v }))}
                />
                Conta padrão
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Switch
                  checked={form.ativo}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, ativo: v }))}
                />
                Ativa
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              A conta padrão é usada pelos títulos que não indicam nenhuma — o
              caso de todos os títulos já importados do ERP. Só uma por empresa:
              marcar esta desmarca a anterior.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={create.isPending || update.isPending}>
              {create.isPending || update.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
