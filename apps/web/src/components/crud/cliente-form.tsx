"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  clienteCreateSchema,
  clienteUpdateSchema,
  type Cliente,
  type ClienteCamposConfig,
  type ClienteCreate,
  type ClienteUpdate,
  type ClienteUpdateResultado,
  type CondicaoPagamento,
  type ConsultaCepResultado,
  type ConsultaCnpjResultado,
  type TabelaPreco,
} from "@plataforma/contracts";
import { useResourceMutations } from "@/hooks/use-resource";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useVendedoresEscopo } from "@/hooks/use-vendedores-escopo";
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
import { Sheet, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ResizableSheetContent } from "@/components/ui/resizable-sheet-content";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClienteCnaeSection } from "@/components/crud/cliente-cnae-section";
import { ClienteHistoricoSection } from "@/components/crud/cliente-historico-section";
import { ArrowLeft, Search } from "lucide-react";

const LIST_ROUTE = "/cadastros/clientes";

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

/**
 * Corpo do formulário de cliente (cartão + campos) — usado tanto na página
 * cheia (`ClienteForm`, `variant="page"`, seções empilhadas) quanto na
 * cortina lateral (`ClienteSheet`, `variant="sheet"`, seções em abas — cabe
 * melhor numa cortina mais estreita).
 */
export function ClienteFormContent({
  cliente,
  readOnly = false,
  onClose,
  variant = "page",
}: {
  cliente?: Cliente;
  readOnly?: boolean;
  /** Chamado ao cancelar ou depois de salvar com sucesso. */
  onClose: () => void;
  variant?: "page" | "sheet";
}) {
  const { create, update } = useResourceMutations<ClienteCreate, ClienteUpdate>("clientes");

  // Opções de vendedor já restritas ao escopo hierárquico do usuário logado.
  const vendedoresEscopoQuery = useVendedoresEscopo();
  const opcoesVendedor = vendedoresEscopoQuery.data?.data ?? [];
  const restrito = vendedoresEscopoQuery.data?.restrito ?? false;

  const tabelasPrecoQuery = useQuery({
    queryKey: ["tabelas-preco", "select"],
    queryFn: () =>
      apiFetch<{ data: TabelaPreco[] }>("/tabelas-preco", { query: { pageSize: 100, ativo: true } }),
  });

  const condicoesPagamentoQuery = useQuery({
    queryKey: ["condicoes-pagamento", "select"],
    queryFn: () =>
      apiFetch<{ data: CondicaoPagamento[] }>("/condicoes-pagamento", {
        query: { pageSize: 100, ativo: true },
      }),
  });

  /**
   * Opções do Select somadas ao vínculo atual do cliente. As duas listas
   * trazem só registros ativos e exigem permissão de cadastro (o vendedor não
   * tem) — sem o vínculo que vem no detalhe do cliente, o campo apareceria em
   * branco mesmo preenchido, que é o caso da maioria das tabelas de preço
   * herdadas do legado, hoje inativas.
   */
  const comVinculoAtual = (
    lista: { id: string; descricao: string }[],
    vinculo: { id: string; descricao: string } | null | undefined,
  ) =>
    vinculo && !lista.some((item) => item.id === vinculo.id) ? [vinculo, ...lista] : lista;

  const opcoesTabelaPreco = comVinculoAtual(
    tabelasPrecoQuery.data?.data ?? [],
    cliente?.tabelaPreco,
  );
  const opcoesCondicaoPagamento = comVinculoAtual(
    condicoesPagamentoQuery.data?.data ?? [],
    cliente?.condicaoPagamento,
  );

  // Quais campos a opção "Alterar Cliente" permite editar (Admin > Campos do
  // Cliente) — campo sem configuração prévia é considerado editável.
  const camposConfigQuery = useQuery({
    queryKey: ["clientes-config"],
    queryFn: () => apiFetch<ClienteCamposConfig>("/clientes-config/campos"),
  });
  const desabilitado = (campo: string) => readOnly || camposConfigQuery.data?.[campo] === false;

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
    condicaoPagamentoId: null,
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
          condicaoPagamentoId: cliente.condicaoPagamentoId ?? null,
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

  // Ao criar (não editar), pré-seleciona o próprio vendedor do usuário
  // logado, se houver vínculo — só na primeira carga. Não se aplica a
  // usuário restrito (a carteira já é dele por definição, o Select some).
  const [vendedorPadraoAplicado, setVendedorPadraoAplicado] = useState(false);
  const meuVendedorId = vendedoresEscopoQuery.data?.meuVendedorId;
  useEffect(() => {
    if (!cliente && !restrito && !vendedorPadraoAplicado && meuVendedorId) {
      form.setValue("vendedorId", meuVendedorId);
      setVendedorPadraoAplicado(true);
    }
  }, [cliente, restrito, vendedorPadraoAplicado, meuVendedorId, form]);

  const queryClient = useQueryClient();

  /**
   * Preenche o formulário com o que a Receita Federal tem sobre o CNPJ. Só
   * escreve em campo vazio ou que o usuário ainda não editou? Não: sobrescreve
   * mesmo — a fonte oficial é mais confiável que o cadastro herdado, e o
   * usuário revisa antes de salvar. Campo travado em Admin > Campos do Cliente
   * é respeitado.
   */
  const [consultandoCnpj, setConsultandoCnpj] = useState(false);
  // CNAEs consultados antes de o cliente existir: ficam retidos aqui e são
  // vinculados assim que o cadastro é criado (ver onSubmit). Sem isso o usuário
  // teria de salvar e consultar o CNPJ de novo só para trazer o ramo.
  const [cnaesRetidos, setCnaesRetidos] = useState<ConsultaCnpjResultado["cnaes"]>([]);
  const consultarCnpj = async () => {
    const cnpj = (form.getValues("cnpjCpf") ?? "").replace(/\D/g, "");
    if (cnpj.length !== 14) {
      toast.error("Informe um CNPJ com 14 dígitos para consultar");
      return;
    }
    setConsultandoCnpj(true);
    try {
      const dados = await apiFetch<ConsultaCnpjResultado>(`/clientes/consulta-cnpj/${cnpj}`);
      const preencher = (campo: keyof ClienteCreate, valor: string | null) => {
        if (valor == null || desabilitado(campo as string)) return;
        form.setValue(campo, valor as never, { shouldDirty: true });
      };
      preencher("razaoSocial", dados.razaoSocial);
      preencher("nomeFantasia", dados.nomeFantasia);
      preencher("endereco", dados.endereco);
      preencher("complemento", dados.complemento);
      preencher("bairro", dados.bairro);
      preencher("municipio", dados.municipio);
      preencher("uf", dados.uf);
      preencher("cep", dados.cep);
      preencher("telefone", dados.telefone);
      preencher("telefone2", dados.telefone2);
      preencher("email", dados.email);

      // CNAEs são coleção filha: só dá para vincular em cliente já salvo.
      if (cliente && dados.cnaes.length > 0) {
        const vinculaveis = dados.cnaes.filter((c) => c.cnaeId);
        for (const c of vinculaveis) {
          try {
            await apiFetch(`/clientes/${cliente.id}/cnaes`, {
              method: "POST",
              body: { cnaeId: c.cnaeId, principal: c.principal },
            });
          } catch {
            // Já vinculado (409) é resultado esperado ao reconsultar — segue.
          }
        }
        void queryClient.invalidateQueries({
          queryKey: ["clientes", cliente.id, "cnaes"],
        });
        const semReferencia = dados.cnaes.length - vinculaveis.length;
        toast.success(
          `Dados da Receita preenchidos. ${vinculaveis.length} CNAE(s) vinculado(s)` +
            (semReferencia
              ? ` — ${semReferencia} não estão na referência local (rode o sync do IBGE).`
              : "."),
        );
      } else {
        // Cadastro novo: retém para vincular logo após a criação.
        setCnaesRetidos(dados.cnaes.filter((c) => c.cnaeId));
        toast.success(
          dados.cnaes.length > 0 && !cliente
            ? `Dados preenchidos. ${dados.cnaes.length} CNAE(s) serão vinculados ao salvar.`
            : "Dados da Receita preenchidos. Revise antes de salvar.",
        );
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao consultar o CNPJ");
    } finally {
      setConsultandoCnpj(false);
    }
  };

  /** Autopreenche endereço ao sair do campo CEP (cache local, ViaCEP no miss). */
  const consultarCep = async () => {
    const cep = (form.getValues("cep") ?? "").replace(/\D/g, "");
    if (cep.length !== 8) return;
    // Endereço já preenchido não é sobrescrito: quem digitou o número e o
    // complemento perderia o trabalho a cada saída do campo.
    if (form.getValues("endereco")) return;
    try {
      const dados = await apiFetch<ConsultaCepResultado>(`/ceps/consulta/${cep}`);
      const preencher = (campo: keyof ClienteCreate, valor: string | null) => {
        if (valor == null || desabilitado(campo as string)) return;
        form.setValue(campo, valor as never, { shouldDirty: true });
      };
      preencher("endereco", dados.endereco);
      preencher("bairro", dados.bairro);
      preencher("municipio", dados.municipio);
      preencher("uf", dados.uf);
    } catch {
      // CEP não encontrado ou fonte fora do ar não é erro do formulário — o
      // usuário digita o endereço à mão.
    }
  };

  const onSubmit = async (values: ClienteCreate) => {
    const payload: ClienteCreate = {
      ...values,
      latitude: nanToNull(values.latitude),
      longitude: nanToNull(values.longitude),
      limiteCredito: nanToNull(values.limiteCredito),
    };
    try {
      if (cliente) {
        // Editar cliente passa pela fila de aprovação: quem não tem
        // `clientes.aprovar` sai daqui com a solicitação registrada, e o
        // cadastro segue como estava até alguém liberar.
        const resultado = (await update.mutateAsync({
          id: cliente.id,
          input: payload,
        })) as unknown as ClienteUpdateResultado;
        if (resultado?.aplicado === false) {
          toast.success(
            "Alteração enviada para aprovação — o cadastro só muda depois de liberada.",
          );
        } else {
          toast.success("Cliente atualizado");
        }
      } else {
        const criado = (await create.mutateAsync(payload)) as { id: string };
        // Vincula os CNAEs trazidos da Receita antes de salvar — agora que há
        // um cliente a que pendurá-los. Falha aqui não invalida o cadastro, que
        // já está gravado.
        let vinculados = 0;
        for (const c of cnaesRetidos) {
          try {
            await apiFetch(`/clientes/${criado.id}/cnaes`, {
              method: "POST",
              body: { cnaeId: c.cnaeId, principal: c.principal },
            });
            vinculados += 1;
          } catch {
            // Segue: o CNAE pode ser vinculado depois pela aba do cadastro.
          }
        }
        setCnaesRetidos([]);
        toast.success(
          vinculados
            ? `Cliente cadastrado com ${vinculados} CNAE(s).`
            : "Cliente cadastrado",
        );
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar cliente");
    }
  };

  const camposIdentificacao = (
    <FieldGroup>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="tipoPessoa">Tipo de pessoa</FieldLabel>
          <Select
            value={tipoPessoa}
            onValueChange={(v) => form.setValue("tipoPessoa", v as "fisica" | "juridica")}
            disabled={desabilitado("tipoPessoa")}
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
          <Input id="codigoErp" {...form.register("codigoErp")} disabled={desabilitado("codigoErp")} />
        </Field>
        <Field data-invalid={!!form.formState.errors.cnpjCpf}>
          <FieldLabel htmlFor="cnpjCpf">{tipoPessoa === "fisica" ? "CPF" : "CNPJ"}</FieldLabel>
          <div className="flex gap-2">
            <Input id="cnpjCpf" {...form.register("cnpjCpf")} disabled={desabilitado("cnpjCpf")} />
            {/* Só para jurídica: a consulta é de CNPJ na base da Receita. */}
            {tipoPessoa === "juridica" && !readOnly && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Consultar CNPJ na Receita Federal"
                onClick={consultarCnpj}
                disabled={consultandoCnpj}
              >
                <Search className="size-4" />
              </Button>
            )}
          </div>
          <FieldError errors={[form.formState.errors.cnpjCpf]} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field data-invalid={!!form.formState.errors.razaoSocial}>
          <FieldLabel htmlFor="razaoSocial">
            {tipoPessoa === "fisica" ? "Nome" : "Razão social"}
          </FieldLabel>
          <Input
            id="razaoSocial"
            {...form.register("razaoSocial")}
            disabled={desabilitado("razaoSocial")}
          />
          <FieldError errors={[form.formState.errors.razaoSocial]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="nomeFantasia">Nome fantasia</FieldLabel>
          <Input
            id="nomeFantasia"
            {...form.register("nomeFantasia")}
            disabled={desabilitado("nomeFantasia")}
          />
        </Field>
      </div>

      {tipoPessoa === "juridica" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="inscricaoEstadual">Inscrição estadual</FieldLabel>
            <Input
              id="inscricaoEstadual"
              {...form.register("inscricaoEstadual")}
              disabled={desabilitado("inscricaoEstadual")}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="inscricaoMunicipal">Inscrição municipal</FieldLabel>
            <Input
              id="inscricaoMunicipal"
              {...form.register("inscricaoMunicipal")}
              disabled={desabilitado("inscricaoMunicipal")}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="contribuinteIcms">Contribuinte ICMS</FieldLabel>
            <Select
              value={boolToSelect(form.watch("contribuinteIcms"))}
              onValueChange={(v) => form.setValue("contribuinteIcms", selectToBool(v))}
              disabled={desabilitado("contribuinteIcms")}
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
            <Input id="rg" {...form.register("rg")} disabled={desabilitado("rg")} />
          </Field>
          <Field data-invalid={!!form.formState.errors.dataNascimento}>
            <FieldLabel htmlFor="dataNascimento">Data de nascimento</FieldLabel>
            <Input
              id="dataNascimento"
              type="date"
              defaultValue={dateToInput(form.getValues("dataNascimento"))}
              onChange={(e) => form.setValue("dataNascimento", inputToDate(e.target.value))}
              disabled={desabilitado("dataNascimento")}
            />
          </Field>
        </div>
      )}
    </FieldGroup>
  );

  const camposContato = (
    <FieldGroup>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="contato">Pessoa de contato</FieldLabel>
          <Input id="contato" {...form.register("contato")} disabled={desabilitado("contato")} />
        </Field>
        <Field data-invalid={!!form.formState.errors.email}>
          <FieldLabel htmlFor="email">E-mail</FieldLabel>
          <Input id="email" {...form.register("email")} disabled={desabilitado("email")} />
          <FieldError errors={[form.formState.errors.email]} />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Field>
          <FieldLabel htmlFor="telefone">Telefone</FieldLabel>
          <Input id="telefone" {...form.register("telefone")} disabled={desabilitado("telefone")} />
        </Field>
        <Field>
          <FieldLabel htmlFor="telefone2">Telefone 2</FieldLabel>
          <Input id="telefone2" {...form.register("telefone2")} disabled={desabilitado("telefone2")} />
        </Field>
        <Field>
          <FieldLabel htmlFor="celular">Celular</FieldLabel>
          <Input id="celular" {...form.register("celular")} disabled={desabilitado("celular")} />
        </Field>
        <Field>
          <FieldLabel htmlFor="site">Site</FieldLabel>
          <Input id="site" {...form.register("site")} disabled={desabilitado("site")} />
        </Field>
      </div>
    </FieldGroup>
  );

  const camposEndereco = (
    <FieldGroup>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="endereco">Endereço</FieldLabel>
          <Input id="endereco" {...form.register("endereco")} disabled={desabilitado("endereco")} />
        </Field>
        <Field>
          <FieldLabel htmlFor="complemento">Complemento</FieldLabel>
          <Input
            id="complemento"
            {...form.register("complemento")}
            disabled={desabilitado("complemento")}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Field>
          <FieldLabel htmlFor="bairro">Bairro</FieldLabel>
          <Input id="bairro" {...form.register("bairro")} disabled={desabilitado("bairro")} />
        </Field>
        <Field>
          <FieldLabel htmlFor="municipio">Município</FieldLabel>
          <Input id="municipio" {...form.register("municipio")} disabled={desabilitado("municipio")} />
        </Field>
        <Field>
          <FieldLabel htmlFor="uf">UF</FieldLabel>
          <Select
            value={form.watch("uf") || "none"}
            onValueChange={(v) => form.setValue("uf", v === "none" ? "" : v)}
            disabled={desabilitado("uf")}
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
          <Input
            id="cep"
            {...form.register("cep", { onBlur: consultarCep })}
            disabled={desabilitado("cep")}
          />
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
            disabled={desabilitado("latitude")}
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
            disabled={desabilitado("longitude")}
          />
          <FieldError errors={[form.formState.errors.longitude]} />
        </Field>
      </div>
    </FieldGroup>
  );

  const camposComercial = (
    <FieldGroup>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="vendedorId">Vendedor</FieldLabel>
          <Select
            value={form.watch("vendedorId") ?? "none"}
            onValueChange={(v) => form.setValue("vendedorId", v === "none" ? null : v)}
            disabled={desabilitado("vendedorId")}
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
            disabled={desabilitado("tabelaPrecoId")}
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
          <FieldLabel htmlFor="condicaoPagamentoId">Condição de pagamento</FieldLabel>
          <Select
            value={form.watch("condicaoPagamentoId") ?? "none"}
            onValueChange={(v) => form.setValue("condicaoPagamentoId", v === "none" ? null : v)}
            disabled={desabilitado("condicaoPagamentoId")}
          >
            <SelectTrigger id="condicaoPagamentoId" className="w-full">
              <SelectValue placeholder="Sem condição de pagamento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem condição de pagamento</SelectItem>
              {opcoesCondicaoPagamento.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.descricao}
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
            disabled={desabilitado("carteira")}
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
            disabled={desabilitado("limiteCredito")}
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
            disabled={desabilitado("vencimentoLimite")}
          />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="observacao">Observação</FieldLabel>
        <Textarea
          id="observacao"
          rows={3}
          {...form.register("observacao")}
          disabled={desabilitado("observacao")}
        />
      </Field>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <Checkbox
          checked={form.watch("ativo")}
          onCheckedChange={(v) => form.setValue("ativo", v === true)}
          disabled={desabilitado("ativo")}
        />
        Cliente ativo
      </label>
    </FieldGroup>
  );

  const camposBloqueio = cliente && (
    <FieldGroup>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="dataBloqueio">Data de bloqueio</FieldLabel>
          <Input
            id="dataBloqueio"
            type="date"
            defaultValue={dateToInput(form.getValues("dataBloqueio"))}
            onChange={(e) => form.setValue("dataBloqueio", inputToDate(e.target.value))}
            disabled={desabilitado("dataBloqueio")}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="observacaoBloqueio">Motivo do bloqueio</FieldLabel>
          <Input
            id="observacaoBloqueio"
            {...form.register("observacaoBloqueio")}
            disabled={desabilitado("observacaoBloqueio")}
          />
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
            disabled={desabilitado("dataReativacao")}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="observacaoReativacao">Observação da reativação</FieldLabel>
          <Input
            id="observacaoReativacao"
            {...form.register("observacaoReativacao")}
            disabled={desabilitado("observacaoReativacao")}
          />
        </Field>
      </div>
    </FieldGroup>
  );

  // Coleção filha: grava por conta própria e só existe com cliente salvo.
  const camposCnae = cliente && (
    <ClienteCnaeSection clienteId={cliente.id} readOnly={readOnly} />
  );

  const camposAlteracoes = cliente && (
    <ClienteHistoricoSection clienteId={cliente.id} />
  );

  const camposHistorico = cliente && (
    // Preenchido pelo import do legado — somente leitura.
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
  );

  return (
    <Card>
      <form id="cliente-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <CardContent>
          {variant === "sheet" ? (
            <Tabs defaultValue="identificacao">
              <TabsList>
                <TabsTrigger value="identificacao">Identificação</TabsTrigger>
                <TabsTrigger value="contato">Contato</TabsTrigger>
                <TabsTrigger value="endereco">Endereço</TabsTrigger>
                <TabsTrigger value="comercial">Comercial</TabsTrigger>
                {cliente && <TabsTrigger value="cnae">CNAE</TabsTrigger>}
                {cliente && <TabsTrigger value="bloqueio">Bloqueio</TabsTrigger>}
                {cliente && <TabsTrigger value="historico">Histórico</TabsTrigger>}
                {cliente && <TabsTrigger value="alteracoes">Alterações</TabsTrigger>}
              </TabsList>
              <TabsContent value="identificacao">{camposIdentificacao}</TabsContent>
              <TabsContent value="contato">{camposContato}</TabsContent>
              <TabsContent value="endereco">{camposEndereco}</TabsContent>
              <TabsContent value="comercial">{camposComercial}</TabsContent>
              {cliente && <TabsContent value="cnae">{camposCnae}</TabsContent>}
              {cliente && <TabsContent value="bloqueio">{camposBloqueio}</TabsContent>}
              {cliente && <TabsContent value="historico">{camposHistorico}</TabsContent>}
              {cliente && <TabsContent value="alteracoes">{camposAlteracoes}</TabsContent>}
            </Tabs>
          ) : (
            <FieldGroup>
              <FieldSet>
                <FieldLegend>Identificação</FieldLegend>
                {camposIdentificacao}
              </FieldSet>
              <FieldSet>
                <FieldLegend>Contato</FieldLegend>
                {camposContato}
              </FieldSet>
              <FieldSet>
                <FieldLegend>Endereço</FieldLegend>
                {camposEndereco}
              </FieldSet>
              <FieldSet>
                <FieldLegend>Comercial</FieldLegend>
                {camposComercial}
              </FieldSet>
              {cliente && (
                <FieldSet>
                  <FieldLegend>Ramo de atividade</FieldLegend>
                  {camposCnae}
                </FieldSet>
              )}
              {cliente && (
                <FieldSet>
                  <FieldLegend>Bloqueio</FieldLegend>
                  {camposBloqueio}
                </FieldSet>
              )}
              {cliente && (
                <FieldSet>
                  <FieldLegend>Histórico comercial</FieldLegend>
                  {camposHistorico}
                </FieldSet>
              )}
              {cliente && (
                <FieldSet>
                  <FieldLegend>Alterações do cadastro</FieldLegend>
                  {camposAlteracoes}
                </FieldSet>
              )}
            </FieldGroup>
          )}
        </CardContent>

        <CardFooter className="justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {readOnly ? "Voltar" : "Cancelar"}
          </Button>
          {!readOnly && (
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {cliente ? "Salvar alterações" : "Cadastrar"}
            </Button>
          )}
        </CardFooter>
      </form>
    </Card>
  );
}

/** Página cheia de cadastro/edição/visualização de cliente. */
export function ClienteForm({ cliente, readOnly = false }: { cliente?: Cliente; readOnly?: boolean }) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">
          {readOnly ? "Visualizar cliente" : cliente ? "Editar cliente" : "Novo cliente"}
        </h1>
      </div>

      <ClienteFormContent cliente={cliente} readOnly={readOnly} onClose={() => router.push(LIST_ROUTE)} />
    </div>
  );
}

/**
 * Cortina lateral com o cadastro do cliente (visualizar ou alterar) — usada
 * a partir da listagem de Posição de Cliente, pra não perder busca/filtro/
 * paginação de quem está consultando a lista. Campos organizados em abas
 * (não empilhados), já que a cortina é mais estreita que a página cheia.
 */
export function ClienteSheet({
  id,
  modo,
  onOpenChange,
}: {
  id: string | null;
  modo: "visualizar" | "alterar";
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: cliente, isLoading, isError } = useQuery({
    queryKey: ["clientes", id],
    queryFn: () => apiFetch<Cliente>(`/clientes/${id}`),
    enabled: !!id,
  });

  const handleClose = () => {
    onOpenChange(false);
    // Garante que a listagem (e a Posição de Cliente detalhada, se aberta em
    // outra aba) reflitam uma eventual alteração salva.
    void queryClient.invalidateQueries({ queryKey: ["clientes"] });
  };

  return (
    <Sheet open={!!id} onOpenChange={onOpenChange}>
      <ResizableSheetContent defaultWidth={720}>
        <SheetHeader>
          <SheetTitle>
            {modo === "visualizar" ? "Visualizar cliente" : "Alterar cliente"}
            {cliente ? ` — ${cliente.razaoSocial}` : ""}
          </SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-4">
          {isLoading && <Skeleton className="h-96 w-full rounded-xl" />}
          {isError && <p className="text-sm text-muted-foreground">Cliente não encontrado.</p>}
          {cliente && (
            <ClienteFormContent
              key={cliente.id}
              cliente={cliente}
              readOnly={modo === "visualizar"}
              onClose={handleClose}
              variant="sheet"
            />
          )}
        </div>
      </ResizableSheetContent>
    </Sheet>
  );
}
