"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Star, Trash2, Landmark, CheckCircle2, CreditCard, Plus, Upload } from "lucide-react";
import type { ContaBancaria } from "@plataforma/contracts";
import { BANCO_BOLETO_LABEL } from "@plataforma/contracts";
import { useResourceList, useResourceMutations } from "@/hooks/use-resource";
import { ApiError, apiFetch, apiUpload, assetUrl } from "@/lib/api-client";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import {
  StatusQuickFilter,
  type StatusFilterValue,
} from "@/components/crud/status-quick-filter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldGroup, FieldLabel } from "@/components/ui/field";
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

const numeroOuNulo = (v: string) => {
  const t = v.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const textoOuNulo = (v: string) => (v.trim() ? v.trim() : null);

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
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !editando) return;
    setUploadingLogo(true);
    try {
      const updated = await apiUpload<ContaBancaria>(`/contas-bancarias/${editando.id}/logo`, file);
      setEditando(updated);
      toast.success("Logo do banco enviado com sucesso");
      refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao enviar logo");
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoverLogo = async () => {
    if (!editando || !editando.logoUrl) return;
    setUploadingLogo(true);
    try {
      const updated = await apiFetch<ContaBancaria>(`/contas-bancarias/${editando.id}/logo`, {
        method: "DELETE",
      });
      setEditando(updated);
      toast.success("Logo removido com sucesso");
      refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao remover logo");
    } finally {
      setUploadingLogo(false);
    }
  };

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
        toast.success("Conta bancária atualizada com sucesso");
      } else {
        await create.mutateAsync(input);
        toast.success("Conta bancária cadastrada com sucesso");
      }
      setAberto(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar conta bancária");
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

  const totalContas = data?.total ?? 0;
  const listaContas = data?.data ?? [];
  const totalAtivas = listaContas.filter((c) => c.ativo).length;
  const contaPadrao = listaContas.find((c) => c.padrao);

  const columns: ColumnDef<ContaBancaria>[] = [
    {
      header: "Descrição",
      sortKey: "descricao",
      cell: (c) => (
        <div className="flex items-center gap-2">
          {c.padrao && (
            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs px-1.5 py-0">
              <Star className="h-3 w-3 mr-1 inline fill-amber-500 text-amber-500" /> Padrão
            </Badge>
          )}
          <span className="font-semibold text-sm text-foreground">{c.descricao}</span>
        </div>
      ),
    },
    {
      header: "Banco",
      sortKey: "banco",
      cell: (c) => (
        <div className="flex items-center gap-2">
          {c.logoUrl ? (
            <img
              src={assetUrl(c.logoUrl) ?? undefined}
              alt="Logo Banco"
              className="h-6 max-w-[60px] object-contain rounded bg-white p-0.5 border"
            />
          ) : null}
          <Badge variant="secondary" className="font-mono text-xs">
            {c.banco} — {BANCO_BOLETO_LABEL[c.banco as keyof typeof BANCO_BOLETO_LABEL] ?? "—"}
          </Badge>
        </div>
      ),
    },
    {
      header: "Agência / Conta",
      sortKey: "agencia",
      cell: (c) => (
        <span className="font-mono text-xs">
          {c.agencia}{c.agenciaDv ? `-${c.agenciaDv}` : ""} / {c.conta}{c.contaDv ? `-${c.contaDv}` : ""}
        </span>
      ),
    },
    { header: "Carteira", cell: (c) => <Badge variant="outline" className="font-mono text-xs">{c.carteira}</Badge> },
    {
      header: "Encargos",
      cell: (c) =>
        [
          c.multaPerc ? `Multa ${c.multaPerc}%` : null,
          c.jurosMesPerc ? `Juros ${c.jurosMesPerc}%/mês` : null,
        ]
          .filter(Boolean)
          .join(" · ") || <span className="text-xs text-muted-foreground">—</span>,
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
              className="h-8 w-8"
              onClick={(ev) => ev.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(ev) => ev.stopPropagation()}>
            <DropdownMenuItem
              onClick={() => {
                setEditando(c);
                setAberto(true);
              }}
            >
              <Pencil className="mr-2 h-4 w-4" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => excluir(c)}>
              <Trash2 className="mr-2 h-4 w-4" /> Excluir
            </DropdownMenuItem>
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
          <h1 className="text-2xl font-bold tracking-tight">Contas Bancárias</h1>
          <p className="text-sm text-muted-foreground">
            Configure as contas e convênios bancários utilizados para emissão de boleto e segunda via.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditando(null);
            setAberto(true);
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Nova conta
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Total de Contas
              </p>
              <p className="text-2xl font-bold mt-1">{totalContas}</p>
            </div>
            <div className="rounded-full bg-primary/10 p-3 text-primary">
              <Landmark className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Contas Ativas
              </p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {totalAtivas}
                </p>
                <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs">
                  Disponíveis
                </Badge>
              </div>
            </div>
            <div className="rounded-full bg-emerald-500/10 p-3 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Conta Padrão
              </p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-base font-bold truncate max-w-[150px]">
                  {contaPadrao ? contaPadrao.descricao : "Nenhuma"}
                </p>
                {contaPadrao && (
                  <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs">
                    Principal
                  </Badge>
                )}
              </div>
            </div>
            <div className="rounded-full bg-amber-500/10 p-3 text-amber-600 dark:text-amber-400">
              <CreditCard className="h-5 w-5" />
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
        emptyMessage="Nenhuma conta bancária cadastrada."
      />

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Landmark className="h-5 w-5 text-primary" />
              {editando ? "Editar Conta Bancária" : "Nova Conta Bancária"}
            </DialogTitle>
          </DialogHeader>

          <FieldGroup className="space-y-4 py-2">
            <p className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-900 dark:text-amber-200">
              Estes dados entram diretamente no código de barras e linha digitável do boleto. Certifique-se de que os dados de agência, conta e carteira conferem exatamente com o contrato bancário.
            </p>

            <div className="space-y-1.5">
              <FieldLabel htmlFor="descricao">Descrição da Conta</FieldLabel>
              <Input
                id="descricao"
                value={form.descricao}
                maxLength={80}
                placeholder="Ex: Bradesco Principal — Carteira 09"
                onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Descrição de referência para a seleção do convênio nas operações do sistema.
              </p>
            </div>

            {/* Logo do Banco para exibição no boleto */}
            <div className="space-y-1.5 border rounded-lg p-3 bg-muted/30">
              <FieldLabel>Logo do Banco no Boleto</FieldLabel>
              {editando ? (
                <div className="flex items-center gap-4">
                  {editando.logoUrl ? (
                    <div className="relative group shrink-0">
                      <img
                        src={assetUrl(editando.logoUrl) ?? undefined}
                        alt="Logo do Banco"
                        className="h-12 max-w-[140px] object-contain rounded border bg-white p-1"
                      />
                    </div>
                  ) : (
                    <div className="h-12 w-28 rounded border flex items-center justify-center bg-muted text-muted-foreground text-xs font-mono shrink-0">
                      Sem logo
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                      <Upload className="h-3.5 w-3.5" />
                      {uploadingLogo ? "Enviando..." : editando.logoUrl ? "Alterar logo do banco" : "Anexar logo do banco"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        className="hidden"
                        disabled={uploadingLogo}
                        onChange={handleLogoUpload}
                      />
                    </label>
                    {editando.logoUrl && (
                      <button
                        type="button"
                        onClick={handleRemoverLogo}
                        disabled={uploadingLogo}
                        className="inline-flex items-center gap-1 text-xs text-destructive hover:underline text-left"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remover logo
                      </button>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      PNG, JPEG, WEBP ou SVG (até 2 MB). Imagem impressa no topo do boleto.
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Cadastre a conta primeiro para realizar o upload da imagem do logo do banco.
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-1.5">
                <FieldLabel htmlFor="banco">Banco</FieldLabel>
                <Input id="banco" value="237 — Bradesco" disabled className="bg-muted font-medium text-xs" />
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="agencia">Agência</FieldLabel>
                <div className="flex items-center gap-1">
                  <Input
                    id="agencia"
                    value={form.agencia}
                    inputMode="numeric"
                    maxLength={5}
                    placeholder="0000"
                    onChange={(e) => setForm((f) => ({ ...f, agencia: e.target.value }))}
                  />
                  <span className="text-muted-foreground">-</span>
                  <Input
                    className="w-12 text-center"
                    value={form.agenciaDv}
                    inputMode="numeric"
                    maxLength={1}
                    placeholder="0"
                    onChange={(e) => setForm((f) => ({ ...f, agenciaDv: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="conta">Conta Corrente</FieldLabel>
                <div className="flex items-center gap-1">
                  <Input
                    id="conta"
                    value={form.conta}
                    inputMode="numeric"
                    maxLength={9}
                    placeholder="000000"
                    onChange={(e) => setForm((f) => ({ ...f, conta: e.target.value }))}
                  />
                  <span className="text-muted-foreground">-</span>
                  <Input
                    className="w-12 text-center"
                    value={form.contaDv}
                    inputMode="numeric"
                    maxLength={1}
                    placeholder="0"
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
                  placeholder="2.0"
                  onChange={(e) => setForm((f) => ({ ...f, multaPerc: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="jurosMesPerc">Juros (% ao mês)</FieldLabel>
                <Input
                  id="jurosMesPerc"
                  value={form.jurosMesPerc}
                  inputMode="decimal"
                  placeholder="1.0"
                  onChange={(e) => setForm((f) => ({ ...f, jurosMesPerc: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="diasProtesto">Protesto (dias)</FieldLabel>
                <Input
                  id="diasProtesto"
                  value={form.diasProtesto}
                  inputMode="numeric"
                  placeholder="0"
                  onChange={(e) => setForm((f) => ({ ...f, diasProtesto: e.target.value }))}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Multa e juros são calculados na atualização do valor da 2ª via após o vencimento.
            </p>

            <div className="space-y-1.5">
              <FieldLabel htmlFor="instrucoes">Instruções de Cobrança</FieldLabel>
              <Textarea
                id="instrucoes"
                rows={3}
                placeholder="Ex: Não receber após 30 dias do vencimento"
                value={form.instrucoes}
                onChange={(e) => setForm((f) => ({ ...f, instrucoes: e.target.value }))}
              />
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
              <FieldLabel htmlFor="beneficiarioNome">Nome do Beneficiário</FieldLabel>
              <Input
                id="beneficiarioNome"
                value={form.beneficiarioNome}
                maxLength={120}
                placeholder="Em branco: utiliza a Razão Social da empresa ativa"
                onChange={(e) =>
                  setForm((f) => ({ ...f, beneficiarioNome: e.target.value }))
                }
              />
            </div>

            <div className="flex items-center gap-6 pt-2 border-t">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <Switch
                  checked={form.padrao}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, padrao: v }))}
                />
                Definir como Conta Padrão
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <Switch
                  checked={form.ativo}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, ativo: v }))}
                />
                Ativa
              </label>
            </div>
          </FieldGroup>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={create.isPending || update.isPending}>
              {create.isPending || update.isPending ? "Salvando..." : "Salvar Conta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

