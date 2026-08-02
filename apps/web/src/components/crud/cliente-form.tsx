"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  clienteCreateSchema,
  clienteUpdateSchema,
  type Cliente,
  type ClienteCreate,
  type ClienteUpdate,
  type TabelaPreco,
  type Vendedor,
} from "@plataforma/contracts";
import { useResourceMutations } from "@/hooks/use-resource";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

const LIST_ROUTE = "/comercial/clientes";

const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
  "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
];

const dateToInput = (v: unknown) => {
  if (!v) return "";
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};
const inputToDate = (v: unknown) => (v === "" || v == null ? null : new Date(`${v}T00:00:00`));
const dateToLabel = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};
const emptyToNull = (v: unknown) => (v === "" || v === null || v === undefined ? null : Number(v));
const nanToNull = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? null : v);

// Boolean nullable (carteira, contribuinteIcms) via Select de 3 estados —
// checkbox converteria null pra false silenciosamente ao salvar.
const boolToSelect = (v: boolean | null | undefined) => (v == null ? "nao-informado" : v ? "sim" : "nao");
const selectToBool = (v: string) => (v === "nao-informado" ? null : v === "sim");

export function ClienteForm({ cliente }: { cliente?: Cliente }) {
  const router = useRouter();
  const { create, update } = useResourceMutations<ClienteCreate, ClienteUpdate>("clientes");

  // Opções de vendedor já restritas ao escopo hierárquico do usuário logado.
  const vendedoresEscopoQuery = useQuery({
    queryKey: ["clientes", "vendedores-escopo"],
    queryFn: () => apiFetch<{ data: Vendedor[]; restrito: boolean }>("/clientes/vendedores-escopo"),
  });
  const opcoesVendedor = vendedoresEscopoQuery.data?.data ?? [];
  const restrito = vendedoresEscopoQuery.data?.restrito ?? false;

  const tabelasPrecoQuery = useQuery({
    queryKey: ["tabelas-preco", "select"],
    queryFn: () =>
      apiFetch<{ data: TabelaPreco[] }>("/tabelas-preco", { query: { pageSize: 100, ativo: true } }),
  });
  const opcoesTabelaPreco = tabelasPrecoQuery.data?.data ?? [];

  const schema = cliente ? clienteUpdateSchema : clienteCreateSchema;
  const empty: ClienteCreate = {
    codigoErp: "",
    tipoPessoa: "juridica",
    razaoSocial: "",
    nomeFantasia: "",
    cnpjCpf: "",
    inscricaoEstadual: "",
    inscricaoMunicipal: "",
    contribuinteIcms: null,
    rg: "",
    dataNascimento: null,
    contato: "",
    email: "",
    telefone: "",
    telefone2: "",
    celular: "",
    endereco: "",
    complemento: "",
    bairro: "",
    municipio: "",
    uf: "",
    cep: "",
    latitude: null,
    longitude: null,
    vendedorId: null,
    tabelaPrecoId: null,
    ativo: true,
    carteira: null,
    site: "",
    limiteCredito: null,
    vencimentoLimite: null,
    observacao: "",
    dataBloqueio: null,
    observacaoBloqueio: "",
    dataReativacao: null,
    observacaoReativacao: "",
  };
  const form = useForm<ClienteCreate>({
    resolver: zodResolver(schema as typeof clienteCreateSchema),
    defaultValues: cliente
      ? {
          codigoErp: cliente.codigoErp ?? "",
          tipoPessoa: cliente.tipoPessoa,
          razaoSocial: cliente.razaoSocial,
          nomeFantasia: cliente.nomeFantasia ?? "",
          cnpjCpf: cliente.cnpjCpf ?? "",
          inscricaoEstadual: cliente.inscricaoEstadual ?? "",
          inscricaoMunicipal: cliente.inscricaoMunicipal ?? "",
          contribuinteIcms: cliente.contribuinteIcms ?? null,
          rg: cliente.rg ?? "",
          dataNascimento: cliente.dataNascimento ?? null,
          contato: cliente.contato ?? "",
          email: cliente.email ?? "",
          telefone: cliente.telefone ?? "",
          telefone2: cliente.telefone2 ?? "",
          celular: cliente.celular ?? "",
          endereco: cliente.endereco ?? "",
          complemento: cliente.complemento ?? "",
          bairro: cliente.bairro ?? "",
          municipio: cliente.municipio ?? "",
          uf: cliente.uf ?? "",
          cep: cliente.cep ?? "",
          latitude: cliente.latitude ?? null,
          longitude: cliente.longitude ?? null,
          vendedorId: cliente.vendedorId ?? null,
          tabelaPrecoId: cliente.tabelaPrecoId ?? null,
          ativo: cliente.ativo,
          carteira: cliente.carteira ?? null,
          site: cliente.site ?? "",
          limiteCredito: cliente.limiteCredito ?? null,
          vencimentoLimite: cliente.vencimentoLimite ?? null,
          observacao: cliente.observacao ?? "",
          dataBloqueio: cliente.dataBloqueio ?? null,
          observacaoBloqueio: cliente.observacaoBloqueio ?? "",
          dataReativacao: cliente.dataReativacao ?? null,
          observacaoReativacao: cliente.observacaoReativacao ?? "",
        }
      : empty,
  });

  const tipoPessoa = form.watch("tipoPessoa");

  const onSubmit = async (values: ClienteCreate) => {
    const payload: ClienteCreate = {
      ...values,
      latitude: nanToNull(values.latitude),
      longitude: nanToNull(values.longitude),
      limiteCredito: nanToNull(values.limiteCredito),
    };
    try {
      if (cliente) {
        await update.mutateAsync({ id: cliente.id, input: payload });
        toast.success("Cliente atualizado");
      } else {
        await create.mutateAsync(payload);
        toast.success("Cliente cadastrado");
      }
      router.push(LIST_ROUTE);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar cliente");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">
          {cliente ? "Editar cliente" : "Novo cliente"}
        </h1>
      </div>

      <Card>
        <form id="cliente-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <CardContent>
            <FieldGroup>
              <FieldSet>
                <FieldLegend>Identificação</FieldLegend>
                <FieldGroup>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Field>
                      <FieldLabel htmlFor="tipoPessoa">Tipo de pessoa</FieldLabel>
                      <Select
                        value={tipoPessoa}
                        onValueChange={(v) => form.setValue("tipoPessoa", v as "fisica" | "juridica")}
                      >
                        <SelectTrigger id="tipoPessoa" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="juridica">Jurídica</SelectItem>
                          <SelectItem value="fisica">Física</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="codigoErp">Código ERP</FieldLabel>
                      <Input id="codigoErp" {...form.register("codigoErp")} />
                    </Field>
                    <Field data-invalid={!!form.formState.errors.cnpjCpf}>
                      <FieldLabel htmlFor="cnpjCpf">{tipoPessoa === "fisica" ? "CPF" : "CNPJ"}</FieldLabel>
                      <Input id="cnpjCpf" {...form.register("cnpjCpf")} />
                      <FieldError errors={[form.formState.errors.cnpjCpf]} />
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field data-invalid={!!form.formState.errors.razaoSocial}>
                      <FieldLabel htmlFor="razaoSocial">
                        {tipoPessoa === "fisica" ? "Nome" : "Razão social"}
                      </FieldLabel>
                      <Input id="razaoSocial" {...form.register("razaoSocial")} />
                      <FieldError errors={[form.formState.errors.razaoSocial]} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="nomeFantasia">Nome fantasia</FieldLabel>
                      <Input id="nomeFantasia" {...form.register("nomeFantasia")} />
                    </Field>
                  </div>

                  {tipoPessoa === "juridica" ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <Field>
                        <FieldLabel htmlFor="inscricaoEstadual">Inscrição estadual</FieldLabel>
                        <Input id="inscricaoEstadual" {...form.register("inscricaoEstadual")} />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="inscricaoMunicipal">Inscrição municipal</FieldLabel>
                        <Input id="inscricaoMunicipal" {...form.register("inscricaoMunicipal")} />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="contribuinteIcms">Contribuinte ICMS</FieldLabel>
                        <Select
                          value={boolToSelect(form.watch("contribuinteIcms"))}
                          onValueChange={(v) => form.setValue("contribuinteIcms", selectToBool(v))}
                        >
                          <SelectTrigger id="contribuinteIcms" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="nao-informado">Não informado</SelectItem>
                            <SelectItem value="sim">Sim</SelectItem>
                            <SelectItem value="nao">Não</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="rg">RG</FieldLabel>
                        <Input id="rg" {...form.register("rg")} />
                      </Field>
                      <Field data-invalid={!!form.formState.errors.dataNascimento}>
                        <FieldLabel htmlFor="dataNascimento">Data de nascimento</FieldLabel>
                        <Input
                          id="dataNascimento"
                          type="date"
                          defaultValue={dateToInput(form.getValues("dataNascimento"))}
                          onChange={(e) => form.setValue("dataNascimento", inputToDate(e.target.value))}
                        />
                      </Field>
                    </div>
                  )}
                </FieldGroup>
              </FieldSet>

              <FieldSet>
                <FieldLegend>Contato</FieldLegend>
                <FieldGroup>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="contato">Pessoa de contato</FieldLabel>
                      <Input id="contato" {...form.register("contato")} />
                    </Field>
                    <Field data-invalid={!!form.formState.errors.email}>
                      <FieldLabel htmlFor="email">E-mail</FieldLabel>
                      <Input id="email" {...form.register("email")} />
                      <FieldError errors={[form.formState.errors.email]} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                    <Field>
                      <FieldLabel htmlFor="telefone">Telefone</FieldLabel>
                      <Input id="telefone" {...form.register("telefone")} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="telefone2">Telefone 2</FieldLabel>
                      <Input id="telefone2" {...form.register("telefone2")} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="celular">Celular</FieldLabel>
                      <Input id="celular" {...form.register("celular")} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="site">Site</FieldLabel>
                      <Input id="site" {...form.register("site")} />
                    </Field>
                  </div>
                </FieldGroup>
              </FieldSet>

              <FieldSet>
                <FieldLegend>Endereço</FieldLegend>
                <FieldGroup>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Field className="sm:col-span-2">
                      <FieldLabel htmlFor="endereco">Endereço</FieldLabel>
                      <Input id="endereco" {...form.register("endereco")} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="complemento">Complemento</FieldLabel>
                      <Input id="complemento" {...form.register("complemento")} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                    <Field>
                      <FieldLabel htmlFor="bairro">Bairro</FieldLabel>
                      <Input id="bairro" {...form.register("bairro")} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="municipio">Município</FieldLabel>
                      <Input id="municipio" {...form.register("municipio")} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="uf">UF</FieldLabel>
                      <Select
                        value={form.watch("uf") || "none"}
                        onValueChange={(v) => form.setValue("uf", v === "none" ? "" : v)}
                      >
                        <SelectTrigger id="uf" className="w-full">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">—</SelectItem>
                          {UFS.map((uf) => (
                            <SelectItem key={uf} value={uf}>
                              {uf}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="cep">CEP</FieldLabel>
                      <Input id="cep" {...form.register("cep")} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field data-invalid={!!form.formState.errors.latitude}>
                      <FieldLabel htmlFor="latitude">Latitude</FieldLabel>
                      <Input
                        id="latitude"
                        type="number"
                        step="any"
                        {...form.register("latitude", { setValueAs: emptyToNull })}
                      />
                      <FieldError errors={[form.formState.errors.latitude]} />
                    </Field>
                    <Field data-invalid={!!form.formState.errors.longitude}>
                      <FieldLabel htmlFor="longitude">Longitude</FieldLabel>
                      <Input
                        id="longitude"
                        type="number"
                        step="any"
                        {...form.register("longitude", { setValueAs: emptyToNull })}
                      />
                      <FieldError errors={[form.formState.errors.longitude]} />
                    </Field>
                  </div>
                </FieldGroup>
              </FieldSet>

              <FieldSet>
                <FieldLegend>Comercial</FieldLegend>
                <FieldGroup>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Field>
                      <FieldLabel htmlFor="vendedorId">Vendedor</FieldLabel>
                      <Select
                        value={form.watch("vendedorId") ?? "none"}
                        onValueChange={(v) => form.setValue("vendedorId", v === "none" ? null : v)}
                      >
                        <SelectTrigger id="vendedorId" className="w-full">
                          <SelectValue placeholder="Sem vendedor" />
                        </SelectTrigger>
                        <SelectContent>
                          {/* Usuário restrito é obrigado a manter o cliente na própria carteira/time. */}
                          {!restrito && <SelectItem value="none">Sem vendedor</SelectItem>}
                          {opcoesVendedor.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.nomeReduzido || v.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="tabelaPrecoId">Tabela de preço</FieldLabel>
                      <Select
                        value={form.watch("tabelaPrecoId") ?? "none"}
                        onValueChange={(v) => form.setValue("tabelaPrecoId", v === "none" ? null : v)}
                      >
                        <SelectTrigger id="tabelaPrecoId" className="w-full">
                          <SelectValue placeholder="Sem tabela de preço" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem tabela de preço</SelectItem>
                          {opcoesTabelaPreco.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.descricao}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="carteira">Cliente de carteira</FieldLabel>
                      <Select
                        value={boolToSelect(form.watch("carteira"))}
                        onValueChange={(v) => form.setValue("carteira", selectToBool(v))}
                      >
                        <SelectTrigger id="carteira" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nao-informado">Não informado</SelectItem>
                          <SelectItem value="sim">Sim</SelectItem>
                          <SelectItem value="nao">Não</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field data-invalid={!!form.formState.errors.limiteCredito}>
                      <FieldLabel htmlFor="limiteCredito">Limite de crédito</FieldLabel>
                      <Input
                        id="limiteCredito"
                        type="number"
                        step="any"
                        {...form.register("limiteCredito", { setValueAs: emptyToNull })}
                      />
                      <FieldError errors={[form.formState.errors.limiteCredito]} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="vencimentoLimite">Vencimento do limite</FieldLabel>
                      <Input
                        id="vencimentoLimite"
                        type="date"
                        defaultValue={dateToInput(form.getValues("vencimentoLimite"))}
                        onChange={(e) => form.setValue("vencimentoLimite", inputToDate(e.target.value))}
                      />
                    </Field>
                  </div>
                  <Field>
                    <FieldLabel htmlFor="observacao">Observação</FieldLabel>
                    <Textarea id="observacao" rows={3} {...form.register("observacao")} />
                  </Field>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.watch("ativo")}
                      onCheckedChange={(v) => form.setValue("ativo", v === true)}
                    />
                    Cliente ativo
                  </label>
                </FieldGroup>
              </FieldSet>

              {cliente && (
                <FieldSet>
                  <FieldLegend>Bloqueio</FieldLegend>
                  <FieldGroup>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="dataBloqueio">Data de bloqueio</FieldLabel>
                        <Input
                          id="dataBloqueio"
                          type="date"
                          defaultValue={dateToInput(form.getValues("dataBloqueio"))}
                          onChange={(e) => form.setValue("dataBloqueio", inputToDate(e.target.value))}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="observacaoBloqueio">Motivo do bloqueio</FieldLabel>
                        <Input id="observacaoBloqueio" {...form.register("observacaoBloqueio")} />
                      </Field>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="dataReativacao">Data de reativação</FieldLabel>
                        <Input
                          id="dataReativacao"
                          type="date"
                          defaultValue={dateToInput(form.getValues("dataReativacao"))}
                          onChange={(e) => form.setValue("dataReativacao", inputToDate(e.target.value))}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="observacaoReativacao">Observação da reativação</FieldLabel>
                        <Input id="observacaoReativacao" {...form.register("observacaoReativacao")} />
                      </Field>
                    </div>
                  </FieldGroup>
                </FieldSet>
              )}

              {cliente && (
                <FieldSet>
                  <FieldLegend>Histórico comercial</FieldLegend>
                  {/* Preenchido pelo import do legado — somente leitura. */}
                  <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                    {(
                      [
                        ["Primeira compra", cliente.primeiraCompra],
                        ["Última visita", cliente.ultimaVisita],
                        ["Última compra", cliente.ultimaCompra],
                        ["Último atendimento", cliente.ultimoAtendimento],
                        ["Consulta RFB", cliente.dataConsultaRfb],
                      ] as const
                    ).map(([label, value]) => (
                      <div key={label}>
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p>{dateToLabel(value)}</p>
                      </div>
                    ))}
                  </div>
                </FieldSet>
              )}
            </FieldGroup>
          </CardContent>

          <CardFooter className="justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push(LIST_ROUTE)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {cliente ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
