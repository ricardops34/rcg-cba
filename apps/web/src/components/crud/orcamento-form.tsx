"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  calcularComissaoItem,
  orcamentoCreateSchema,
  orcamentoUpdateSchema,
  type Cliente,
  type CondicaoPagamento,
  type Empresa,
  type Oportunidade,
  type Orcamento,
  type OrcamentoConfig,
  type OrcamentoCreate,
  type OrcamentoUpdate,
  type PosicaoClienteMix,
  type RegraParaCalculo,
  type Produto,
  type StatusOrcamento,
} from "@plataforma/contracts";
import { useResourceMutations } from "@/hooks/use-resource";
import { apiFetch, ApiError, assetUrl } from "@/lib/api-client";
import { gerarOrcamentoPdf } from "@/lib/orcamento-pdf";
import { regraDescontoLabel } from "@/lib/regra-desconto";
import { useAuthStore } from "@/stores/auth-store";
import { useVendedoresEscopo } from "@/hooks/use-vendedores-escopo";
import { STATUS_ORCAMENTO, STATUS_ORCAMENTO_LABEL } from "@/components/crud/orcamento-status";
import { ClienteCombobox } from "@/components/crud/cliente-combobox";
import { ProdutoCombobox } from "@/components/crud/produto-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Sheet, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ResizableSheetContent } from "@/components/ui/resizable-sheet-content";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusDot } from "@/components/crud/status-dot";
import { SortableTableHead } from "@/components/crud/sortable-table-head";
import { OrcamentoTimeline } from "@/components/crud/orcamento-timeline";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Copy,
  FileDown,
  MinusCircle,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";

const LIST_ROUTE = "/crm/orcamentos";

const dateToInput = (v: unknown) => {
  if (!v) return "";
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};
const inputToDate = (v: unknown) => (v === "" || v == null ? null : new Date(`${v}T00:00:00`));
/**
 * Par date<->input do campo Data de retorno, que é datetime-local (a hora vai
 * pro vencimento da Atividade de acompanhamento gerada pelo backend, então
 * aparece no horário certo na Agenda). Formata com os getters locais de
 * propósito: `toISOString()` converteria pra UTC e deslocaria a hora exibida.
 */
const dateTimeToInput = (v: unknown) => {
  if (!v) return "";
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const inputToDateTime = (v: unknown) => (v === "" || v == null ? null : new Date(v as string));
const moeda = (v: number | null | undefined) =>
  v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const percentual = (v: number | null | undefined) =>
  v != null ? `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%` : "—";
const numero = (v: number | null | undefined) =>
  v != null ? v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—";
const dataBr = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};
const dataHoraBr = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR");
};

/**
 * Situação do orçamento perante o ERP, pra aba "Aprovação e integração" —
 * mesmos três estados do ícone da listagem de Orçamentos: só aprovado fica
 * disponível pro ERP puxar; codigoLegado preenchido = já vinculado lá.
 */
function situacaoIntegracao(orcamento: Orcamento) {
  if (orcamento.status !== "aprovado") {
    return {
      icone: MinusCircle,
      classe: "border-border/70 bg-muted/40 text-muted-foreground",
      titulo: "Ainda não disponível para o ERP",
      descricao: "O orçamento só é enviado ao ERP depois de aprovado.",
    };
  }
  if (orcamento.codigoLegado != null) {
    return {
      icone: CheckCircle2,
      classe:
        "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      titulo: "Integrado ao ERP",
      descricao: `Importado pelo ERP com o código ${orcamento.codigoLegado}.`,
    };
  }
  return {
    icone: Clock,
    classe: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    titulo: "Aprovado — aguardando integração",
    descricao: "Disponível para o ERP importar; o código será preenchido no vínculo.",
  };
}

/**
 * Input mascarado no padrão "dígitos viram centavos" (ex.: digitar 4600 exibe
 * "46,00") — usado nas colunas Preço e Desconto (%) da tabela de itens, pra
 * não mostrar o valor cru sem separador decimal.
 */
function MaskedNumberInput({
  value,
  onChange,
  suffix,
  className,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  className?: string;
  disabled?: boolean;
}) {
  const display = (value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (
    <Input
      type="text"
      inputMode="decimal"
      className={className}
      disabled={disabled}
      value={suffix ? `${display}${suffix}` : display}
      onChange={(e) => {
        const digitos = e.target.value.replace(/\D/g, "");
        onChange(digitos ? Number(digitos) / 100 : 0);
      }}
    />
  );
}

/** Info local (não vai pro submit) de cada linha de item, pra render das colunas Preço tabela/Desconto/Estoque. */
interface LinhaInfo {
  vlrTabela: number | null;
  saldoEstoque: number | null;
  /** Regra aplicável ao produto (tabela de preço > produto > categoria > padrão). */
  regra?: RegraAplicavel | null;
}

/** Resumo da regra que /orcamentos/preco-produto devolve, pro cálculo na tela. */
type RegraAplicavel = RegraParaCalculo & {
  id: string;
  codigoErp: string | null;
  descricao: string;
};

/** Resposta de /orcamentos/preco-produto. */
interface PrecoProdutoResposta {
  vlrTabela: number | null;
  ultimoPreco: number | null;
  saldoEstoque: number;
  regraDesconto: RegraAplicavel | null;
}

/** Colunas ordenáveis da aba Mix (ordenação client-side, ver `mixVisivel`). */
type MixSortKey =
  | "codigoErp"
  | "descricao"
  | "ultimaCompra"
  | "ultimoPrecoUnitario"
  | "ultimoDesconto"
  | "precoTabela"
  | "ativo";

/**
 * Comparador de duas linhas do mix já na direção pedida. Valor nulo vai
 * sempre pro fim, nas duas direções — "sem última compra"/"sem preço" não
 * deve disputar o topo da lista ao inverter a ordenação.
 */
function compararMix(
  a: PosicaoClienteMix,
  b: PosicaoClienteMix,
  key: MixSortKey,
  order: "asc" | "desc",
): number {
  const sinal = order === "asc" ? 1 : -1;
  if (key === "codigoErp" || key === "descricao") {
    return a[key].localeCompare(b[key], "pt-BR") * sinal;
  }
  if (key === "ativo") {
    return (Number(a.ativo) - Number(b.ativo)) * sinal;
  }
  const valor = (m: PosicaoClienteMix) =>
    key === "ultimaCompra" ? (m.ultimaCompra ? new Date(m.ultimaCompra).getTime() : null) : m[key];
  const va = valor(a);
  const vb = valor(b);
  if (va == null && vb == null) return 0;
  if (va == null) return 1;
  if (vb == null) return -1;
  return (va - vb) * sinal;
}

/**
 * Corpo do formulário de orçamento (cartão + campos) — usado tanto na página
 * cheia (`OrcamentoForm`) quanto na cortina lateral (`OrcamentoSheet`, aberta
 * a partir da listagem de Posição de Cliente).
 */
export function OrcamentoFormContent({
  orcamento,
  clienteIdPadrao,
  onClose,
}: {
  orcamento?: Orcamento;
  /** Pré-seleciona o cliente ao criar (ex.: "Incluir Orçamento" na Posição de Cliente). */
  clienteIdPadrao?: string | null;
  /** Chamado ao cancelar ou depois de salvar com sucesso. */
  onClose: () => void;
}) {
  const { create, update } = useResourceMutations<OrcamentoCreate, OrcamentoUpdate>("orcamentos");
  const queryClient = useQueryClient();
  const [infoPorLinha, setInfoPorLinha] = useState<(LinhaInfo | null)[]>(
    orcamento
      ? orcamento.itens.map((i) => ({ vlrTabela: i.vlrTabela, saldoEstoque: null }))
      : [],
  );

  const vendedoresEscopoQuery = useVendedoresEscopo();
  const opcoesVendedor = vendedoresEscopoQuery.data?.data ?? [];

  const orcamentoConfigQuery = useQuery({
    queryKey: ["orcamento-config"],
    queryFn: () => apiFetch<OrcamentoConfig>("/orcamento-config"),
  });

  const condicoesQuery = useQuery({
    queryKey: ["condicoes-pagamento", "select"],
    queryFn: () =>
      apiFetch<{ data: CondicaoPagamento[] }>("/condicoes-pagamento", {
        query: { pageSize: 100, ativo: true },
      }),
  });
  const opcoesCondicao = condicoesQuery.data?.data ?? [];


  const schema = orcamento ? orcamentoUpdateSchema : orcamentoCreateSchema;
  const empty: OrcamentoCreate = {
    clienteId: "",
    vendedorId: "",
    oportunidadeId: null,
    condicaoPagamentoId: null,
    titulo: "",
    status: "rascunho",
    dataValidade: null,
    dataRetorno: null,
    observacao: "",
    ativo: true,
    itens: [],
  };
  const form = useForm<OrcamentoCreate>({
    resolver: zodResolver(schema as typeof orcamentoCreateSchema),
    defaultValues: orcamento
      ? {
          clienteId: orcamento.clienteId,
          vendedorId: orcamento.vendedorId,
          oportunidadeId: orcamento.oportunidadeId,
          condicaoPagamentoId: orcamento.condicaoPagamentoId,
          titulo: orcamento.titulo,
          status: orcamento.status,
          dataValidade: orcamento.dataValidade ? new Date(orcamento.dataValidade) : null,
          dataRetorno: orcamento.dataRetorno ? new Date(orcamento.dataRetorno) : null,
          observacao: orcamento.observacao ?? "",
          ativo: orcamento.ativo,
          itens: orcamento.itens.map((i) => ({
            produtoId: i.produtoId,
            quantidade: i.quantidade,
            vlrUnitario: i.vlrUnitario,
          })),
        }
      : empty,
  });

  const linhas = useFieldArray({ control: form.control, name: "itens" });
  const clienteId = form.watch("clienteId");
  const vendedorId = form.watch("vendedorId");
  const status = form.watch("status");
  // % base de comissão do vendedor escolhido — entra no cálculo por linha.
  const vendedorSelecionado = opcoesVendedor.find((v) => v.id === vendedorId);

  /**
   * Registro já gravado: o que veio por prop (edição) ou o que acabou de ser
   * salvo aqui pelo "Salvar" (sem fechar). É ele que libera PDF, Histórico e
   * Aprovação/integração — e que faz o próximo salvamento virar uma alteração
   * em vez de cadastrar um segundo orçamento.
   */
  const [salvoNaSessao, setSalvoNaSessao] = useState<Orcamento | null>(null);
  /**
   * Modo cópia: o formulário volta a se comportar como cadastro novo (mesmo
   * cliente/itens, validade reiniciada), sem tocar no orçamento de origem.
   */
  const [copiando, setCopiando] = useState(false);
  const registro = copiando ? null : (salvoNaSessao ?? orcamento ?? null);

  // Aprovado e vencido são imutáveis — o servidor já recusa a alteração
  // (ConflictException), isso aqui só trava a UI pra não deixar tentar. Vencido
  // também não pode ser efetivado; o caminho é copiar.
  const bloqueado = registro?.status === "aprovado" || registro?.status === "expirado";

  // Ao criar vindo de "Incluir Orçamento" (Posição de Cliente ou ?clienteId=
  // na URL), busca o cliente pré-selecionado pra ler o vendedor cadastrado
  // nele (mesma queryKey do ClienteCombobox, reaproveita o cache).
  const clienteIdPadraoQuery = useQuery({
    queryKey: ["clientes", clienteIdPadrao],
    queryFn: () => apiFetch<Cliente>(`/clientes/${clienteIdPadrao}`),
    enabled: !orcamento && !!clienteIdPadrao,
  });

  // Ao criar (não editar), pré-seleciona o vendedor cadastrado no cliente
  // informado (clienteIdPadrao); sem cliente pré-selecionado, cai pro
  // próprio vendedor do usuário logado, se houver vínculo — só na primeira
  // carga.
  const [vendedorPadraoAplicado, setVendedorPadraoAplicado] = useState(false);
  const meuVendedorId = vendedoresEscopoQuery.data?.meuVendedorId;
  const vendedorDoClientePadrao = clienteIdPadraoQuery.data?.vendedorId;
  useEffect(() => {
    if (orcamento || vendedorPadraoAplicado) return;
    // Aguarda o cliente carregar antes de decidir — exceto se a busca falhou
    // (ex.: sem permissão clientes.visualizar), aí cai direto pro fallback.
    if (clienteIdPadrao && clienteIdPadraoQuery.isPending) return;
    const vendedorPadrao = vendedorDoClientePadrao || meuVendedorId;
    if (vendedorPadrao) {
      form.setValue("vendedorId", vendedorPadrao);
      setVendedorPadraoAplicado(true);
    }
  }, [
    orcamento,
    vendedorPadraoAplicado,
    clienteIdPadrao,
    clienteIdPadraoQuery.isPending,
    vendedorDoClientePadrao,
    meuVendedorId,
    form,
  ]);

  // Ao criar vindo de "Incluir Orçamento" (Posição de Cliente ou ?clienteId=
  // na URL), pré-seleciona o cliente informado — só na primeira carga.
  const [clientePadraoAplicado, setClientePadraoAplicado] = useState(false);
  useEffect(() => {
    if (!orcamento && !clientePadraoAplicado && clienteIdPadrao) {
      form.setValue("clienteId", clienteIdPadrao);
      setClientePadraoAplicado(true);
    }
  }, [orcamento, clientePadraoAplicado, clienteIdPadrao, form]);

  // Ao criar, sugere "Válido até" = hoje + diasValidade do parâmetro de
  // sistema (admin/orcamento-config) — só na primeira carga, o vendedor pode
  // ajustar a data livremente depois.
  const [validadePadraoAplicada, setValidadePadraoAplicada] = useState(false);
  const diasValidade = orcamentoConfigQuery.data?.diasValidade;
  useEffect(() => {
    if (!orcamento && !validadePadraoAplicada && diasValidade != null) {
      const data = new Date();
      data.setDate(data.getDate() + diasValidade);
      form.setValue("dataValidade", data);
      setValidadePadraoAplicada(true);
    }
  }, [orcamento, validadePadraoAplicada, diasValidade, form]);

  // Ao criar, sugere "Data de retorno" = "Válido até", acompanhando essa data
  // enquanto o vendedor não mexer manualmente no campo de retorno.
  const [retornoTocado, setRetornoTocado] = useState(false);
  const dataValidadeAtual = form.watch("dataValidade");
  useEffect(() => {
    if (!orcamento && !retornoTocado) {
      form.setValue("dataRetorno", dataValidadeAtual ?? null);
    }
  }, [orcamento, retornoTocado, dataValidadeAtual, form]);

  // Cadastro completo do cliente escolhido (mesma queryKey do ClienteCombobox,
  // reaproveita o cache) — fonte dos padrões de Título/Condição de pagamento
  // abaixo (só ao criar) e dos dados de cliente do PDF (só ao editar).
  const clienteSelecionadoQuery = useQuery({
    queryKey: ["clientes", clienteId],
    queryFn: () => apiFetch<Cliente>(`/clientes/${clienteId}`),
    enabled: !!clienteId,
  });

  // Ao criar, sugere "Título" = "Orçamento Cliente <nome fantasia>", acompanhando
  // o cliente escolhido enquanto o vendedor não mexer manualmente no título.
  const [tituloTocado, setTituloTocado] = useState(false);
  const nomeClienteSelecionado =
    clienteSelecionadoQuery.data?.nomeFantasia || clienteSelecionadoQuery.data?.razaoSocial;
  useEffect(() => {
    if (!orcamento && !tituloTocado && nomeClienteSelecionado) {
      form.setValue("titulo", `Orçamento Cliente ${nomeClienteSelecionado}`);
    }
  }, [orcamento, tituloTocado, nomeClienteSelecionado, form]);
  const tituloReg = form.register("titulo");

  // Ao criar, sugere "Condição de pagamento" = a cadastrada no cliente,
  // acompanhando o cliente escolhido enquanto o vendedor não mexer
  // manualmente no campo.
  const [condicaoPagamentoTocada, setCondicaoPagamentoTocada] = useState(false);
  const condicaoPagamentoDoCliente = clienteSelecionadoQuery.data?.condicaoPagamentoId;
  useEffect(() => {
    if (!orcamento && !condicaoPagamentoTocada && clienteSelecionadoQuery.data) {
      form.setValue("condicaoPagamentoId", condicaoPagamentoDoCliente ?? null);
    }
  }, [orcamento, condicaoPagamentoTocada, clienteSelecionadoQuery.data, condicaoPagamentoDoCliente, form]);

  // Ao editar, busca o saldo de estoque dos itens já salvos — só na primeira
  // carga (preco-produto não é chamado de novo pra vlrTabela/vlrUnitario,
  // que já vêm salvos no orçamento, só pro saldo de estoque atual).
  const [estoquePadraoAplicado, setEstoquePadraoAplicado] = useState(false);
  useEffect(() => {
    if (!orcamento || estoquePadraoAplicado) return;
    setEstoquePadraoAplicado(true);
    orcamento.itens.forEach((item, index) => {
      apiFetch<PrecoProdutoResposta>("/orcamentos/preco-produto", {
        query: { clienteId: orcamento.clienteId, produtoId: item.produtoId },
      })
        .then((resp) => {
          setInfoPorLinha((arr) =>
            arr.map((v, i) =>
              i === index
                ? {
                    ...(v ?? { vlrTabela: null }),
                    saldoEstoque: resp.saldoEstoque,
                    regra: resp.regraDesconto,
                  }
                : v,
            ),
          );
        })
        .catch(() => {
          // Sem saldo disponível — coluna Estoque fica em branco pra essa linha.
        });
    });
  }, [orcamento, estoquePadraoAplicado]);

  const itensAtuais = form.watch("itens");
  const totalCalculado = itensAtuais.reduce(
    (acc, it) => acc + (it.quantidade || 0) * (it.vlrUnitario || 0),
    0,
  );

  // Oportunidades do vendedor escolhido — só as ativas, mesmo critério do form de Atividade.
  const oportunidadesQuery = useQuery({
    queryKey: ["oportunidades", "select", vendedorId],
    queryFn: () =>
      apiFetch<{ data: Oportunidade[] }>("/oportunidades", {
        query: { vendedorId, pageSize: 100, ativo: true },
      }),
    enabled: !!vendedorId,
  });
  const opcoesOportunidade = oportunidadesQuery.data?.data ?? [];

  // Mix de produtos já comprados pelo cliente — alimenta a aba "Mix" (adicionar
  // ao orçamento) e a coluna "Última venda" da aba Itens.
  const mixQuery = useQuery({
    queryKey: ["clientes", clienteId, "mix"],
    queryFn: () => apiFetch<PosicaoClienteMix[]>(`/clientes/${clienteId}/mix`),
    enabled: !!clienteId,
  });
  const mix = mixQuery.data ?? [];
  const mixPorProduto = new Map(mix.map((m) => [m.produtoId, m]));

  const integracao = registro ? situacaoIntegracao(registro) : null;

  // Proposta em PDF — só pra orçamento já salvo: os itens só carregam produto
  // (código/descrição/unidade) e total consolidado depois de gravados.
  const usuario = useAuthStore((s) => s.user);
  const empresaAtiva = usuario?.empresas.find((e) => e.empresaId === usuario.empresaAtivaId);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const baixarPdf = async () => {
    if (!registro) return;
    setGerandoPdf(true);
    try {
      // Cadastro da empresa emitente pro cabeçalho (CNPJ, IE, endereço,
      // contato) — buscado na hora, e não mantido em cache de query, porque
      // só o PDF usa. A rota é liberada a qualquer usuário autenticado; se
      // falhar, o PDF ainda sai com o nome fantasia da sessão.
      const empresa = await apiFetch<Empresa>("/empresas/ativa").catch(() => null);
      await gerarOrcamentoPdf({
        orcamento: registro,
        cliente: clienteSelecionadoQuery.data,
        empresa,
        empresaNome: empresaAtiva?.nomeFantasia,
        empresaLogoUrl: assetUrl(empresaAtiva?.logoUrl),
      });
    } catch {
      toast.error("Não foi possível gerar o PDF do orçamento");
    } finally {
      setGerandoPdf(false);
    }
  };

  // Busca/ordenação da aba Mix acontecem no cliente: a rota devolve o mix
  // inteiro de uma vez (sem paginação), então não vale ida ao servidor.
  const [mixBusca, setMixBusca] = useState("");
  const [mixSortBy, setMixSortBy] = useState<MixSortKey>("ultimaCompra");
  const [mixSortOrder, setMixSortOrder] = useState<"asc" | "desc">("desc");
  const ordenarMix = (key: MixSortKey) => {
    if (mixSortBy !== key) {
      setMixSortBy(key);
      setMixSortOrder("asc");
    } else {
      setMixSortOrder(mixSortOrder === "asc" ? "desc" : "asc");
    }
  };
  const termoMix = mixBusca.trim().toLowerCase();
  const mixVisivel = [...mix]
    .filter(
      (m) =>
        !termoMix ||
        m.codigoErp.toLowerCase().includes(termoMix) ||
        m.descricao.toLowerCase().includes(termoMix),
    )
    .sort((a, b) => compararMix(a, b, mixSortBy, mixSortOrder));

  const adicionarItem = () => {
    linhas.append({ produtoId: "", quantidade: 1, vlrUnitario: 0 });
    setInfoPorLinha((arr) => [...arr, null]);
  };
  const removerItem = (index: number) => {
    linhas.remove(index);
    setInfoPorLinha((arr) => arr.filter((_, i) => i !== index));
  };

  /** Editar o desconto (%) recalcula o preço unitário a partir do preço de tabela. */
  const aplicarDesconto = (index: number, percentual: number) => {
    const vlrTabela = infoPorLinha[index]?.vlrTabela;
    if (vlrTabela == null) return;
    const novoPreco = Math.round(vlrTabela * (1 - percentual / 100) * 100) / 100;
    form.setValue(`itens.${index}.vlrUnitario`, novoPreco);
  };

  const onSelecionarProduto = async (index: number, produto: Produto | null) => {
    if (!produto) return;
    form.setValue(`itens.${index}.produtoId`, produto.id);
    if (!clienteId) return;
    try {
      const resp = await apiFetch<PrecoProdutoResposta>("/orcamentos/preco-produto", {
        query: { clienteId, produtoId: produto.id },
      });
      form.setValue(`itens.${index}.vlrUnitario`, resp.vlrTabela ?? resp.ultimoPreco ?? 0);
      setInfoPorLinha((arr) =>
        arr.map((v, i) =>
          i === index
            ? {
                vlrTabela: resp.vlrTabela,
                saldoEstoque: resp.saldoEstoque,
                regra: resp.regraDesconto,
              }
            : v,
        ),
      );
    } catch {
      // Sem preço disponível — fica com o que já estava, o vendedor ajusta na mão.
    }
  };

  /**
   * Adiciona um item a partir da aba Mix, respeitando os valores/% da última
   * venda: reaplica o desconto praticado na última compra (ultimoDesconto)
   * sobre o preço de tabela vigente hoje, em vez de reusar o preço antigo
   * como está — se não houver tabela vigente ou desconto anterior, cai no
   * último preço praticado.
   */
  const adicionarDoMix = async (produto: PosicaoClienteMix) => {
    if (itensAtuais.some((it) => it.produtoId === produto.produtoId)) {
      toast.info("Produto já está nos itens do orçamento");
      return;
    }
    const vlrUnitario =
      produto.precoTabela != null && produto.ultimoDesconto != null
        ? Math.round(produto.precoTabela * (1 - produto.ultimoDesconto / 100) * 100) / 100
        : (produto.ultimoPrecoUnitario ?? produto.precoTabela ?? 0);
    const novoIndex = itensAtuais.length;
    linhas.append({ produtoId: produto.produtoId, quantidade: 1, vlrUnitario });
    setInfoPorLinha((arr) => [...arr, { vlrTabela: produto.precoTabela, saldoEstoque: null }]);
    toast.success("Item adicionado ao orçamento");

    if (!clienteId) return;
    try {
      const resp = await apiFetch<PrecoProdutoResposta>("/orcamentos/preco-produto", {
        query: { clienteId, produtoId: produto.produtoId },
      });
      setInfoPorLinha((arr) =>
        arr.map((v, i) =>
          i === novoIndex
            ? {
                vlrTabela: produto.precoTabela,
                saldoEstoque: resp.saldoEstoque,
                regra: resp.regraDesconto,
              }
            : v,
        ),
      );
    } catch {
      // Sem saldo disponível — coluna Estoque fica em branco pra essa linha.
    }
  };

  /**
   * Grava o orçamento e, quando `fechar` é false, permanece no formulário com
   * o registro recém-salvo — é o que permite cadastrar e emitir o PDF / abrir
   * as abas de Histórico e Integração sem sair da tela.
   *
   * A resposta do POST/PATCH é o próprio orçamento (com itens e total já
   * consolidados pelo servidor); useResourceMutations não é tipado no retorno,
   * daí o cast.
   */
  const salvar = async (values: OrcamentoCreate, fechar: boolean) => {
    try {
      const salvo = registro
        ? ((await update.mutateAsync({ id: registro.id, input: values })) as Orcamento)
        : ((await create.mutateAsync(values)) as Orcamento);
      setSalvoNaSessao(salvo);
      setCopiando(false);
      // A data de retorno gera/atualiza uma Atividade de acompanhamento no
      // backend — sem invalidar, a aba Histórico e a Agenda ficariam com o
      // cache anterior.
      void queryClient.invalidateQueries({ queryKey: ["atividades"] });
      toast.success(registro ? "Orçamento atualizado" : "Orçamento cadastrado");
      if (fechar) onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar orçamento");
    }
  };

  /**
   * Copia o orçamento para um novo cadastro: mantém cliente, vendedor e itens
   * já carregados no formulário, reinicia a validade (hoje + diasValidade do
   * parâmetro de sistema) e volta o status pra rascunho. É o caminho para
   * reaproveitar um orçamento vencido, que não pode mais ser alterado.
   */
  const copiar = () => {
    setCopiando(true);
    setSalvoNaSessao(null);
    form.setValue("status", "rascunho");
    if (diasValidade != null) {
      const validade = new Date();
      validade.setDate(validade.getDate() + diasValidade);
      form.setValue("dataValidade", validade);
      if (!retornoTocado) form.setValue("dataRetorno", validade);
    }
    toast.info("Cópia iniciada — revise os dados e salve para gerar um novo orçamento.");
  };

  return (
    <Card>
      <form
        id="orcamento-form"
        onSubmit={form.handleSubmit((v) => salvar(v, true))}
        noValidate
      >
        <CardContent>
          {bloqueado && (
            <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              {registro?.status === "expirado"
                ? "Orçamento vencido — não pode ser alterado nem efetivado. Use “Copiar” para gerar um novo com a validade reiniciada."
                : "Orçamento aprovado — não pode mais ser alterado."}
            </p>
          )}
          <fieldset disabled={bloqueado} className="m-0 min-w-0 border-0 p-0">
          <Tabs defaultValue="orcamento">
            <TabsList>
              <TabsTrigger value="orcamento">Orçamento</TabsTrigger>
              <TabsTrigger value="itens">Itens ({linhas.fields.length})</TabsTrigger>
              <TabsTrigger value="mix">Mix de produtos ({mix.length})</TabsTrigger>
              {/* O histórico é do cliente, então já vale antes de gravar. Já
                  aprovação/integração só existe depois (status, codigoLegado e
                  auditoria vêm do servidor). */}
              {clienteId && <TabsTrigger value="historico">Histórico</TabsTrigger>}
              {registro && <TabsTrigger value="integracao">Aprovação e integração</TabsTrigger>}
            </TabsList>

            <TabsContent value="orcamento" className="space-y-4 pt-3">
            <FieldGroup>
            <Field data-invalid={!!form.formState.errors.titulo}>
              <FieldLabel htmlFor="titulo">Título</FieldLabel>
              <Input
                id="titulo"
                {...tituloReg}
                onChange={(e) => {
                  setTituloTocado(true);
                  tituloReg.onChange(e);
                }}
              />
              <FieldError errors={[form.formState.errors.titulo]} />
            </Field>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field data-invalid={!!form.formState.errors.clienteId}>
                <FieldLabel htmlFor="clienteId">Cliente</FieldLabel>
                <ClienteCombobox
                  value={form.watch("clienteId") || null}
                  onChange={(id) => form.setValue("clienteId", id ?? "")}
                  disabled={!orcamento && !!clienteIdPadrao}
                />
                <FieldError errors={[form.formState.errors.clienteId]} />
              </Field>
              <Field data-invalid={!!form.formState.errors.vendedorId}>
                <FieldLabel htmlFor="vendedorId">Vendedor</FieldLabel>
                <Select
                  value={vendedorId || undefined}
                  onValueChange={(v) => {
                    form.setValue("vendedorId", v);
                    form.setValue("oportunidadeId", null);
                  }}
                >
                  <SelectTrigger id="vendedorId" className="w-full">
                    <SelectValue placeholder="Selecione o vendedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {opcoesVendedor.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.nomeReduzido || v.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError errors={[form.formState.errors.vendedorId]} />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="oportunidadeId">Oportunidade</FieldLabel>
                <Select
                  value={form.watch("oportunidadeId") ?? "none"}
                  onValueChange={(v) => form.setValue("oportunidadeId", v === "none" ? null : v)}
                  disabled={!vendedorId}
                >
                  <SelectTrigger id="oportunidadeId" className="w-full">
                    <SelectValue
                      placeholder={vendedorId ? "Sem oportunidade" : "Escolha um vendedor primeiro"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem oportunidade</SelectItem>
                    {opcoesOportunidade.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.titulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="condicaoPagamentoId">Condição de pagamento</FieldLabel>
                <Select
                  value={form.watch("condicaoPagamentoId") ?? "none"}
                  onValueChange={(v) => {
                    setCondicaoPagamentoTocada(true);
                    form.setValue("condicaoPagamentoId", v === "none" ? null : v);
                  }}
                >
                  <SelectTrigger id="condicaoPagamentoId" className="w-full">
                    <SelectValue placeholder="Sem condição" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem condição</SelectItem>
                    {opcoesCondicao.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.descricao}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="status">Status</FieldLabel>
                <Select
                  value={status}
                  onValueChange={(v) => form.setValue("status", v as StatusOrcamento)}
                >
                  <SelectTrigger id="status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_ORCAMENTO.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="dataValidade">Válido até</FieldLabel>
                <Input
                  id="dataValidade"
                  type="date"
                  value={dateToInput(form.watch("dataValidade"))}
                  onChange={(e) => form.setValue("dataValidade", inputToDate(e.target.value))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="dataRetorno">Data e hora de retorno</FieldLabel>
                <Input
                  id="dataRetorno"
                  type="datetime-local"
                  value={dateTimeToInput(form.watch("dataRetorno"))}
                  onChange={(e) => {
                    setRetornoTocado(true);
                    form.setValue("dataRetorno", inputToDateTime(e.target.value));
                  }}
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
              Orçamento ativo
            </label>

            <Field>
              <FieldLabel>Total</FieldLabel>
              <div className="text-lg font-semibold">{moeda(totalCalculado)}</div>
            </Field>
            </FieldGroup>
            </TabsContent>

            <TabsContent value="itens" className="space-y-2 pt-3">
                  <div className="flex items-center justify-between">
                    <FieldLabel>Itens</FieldLabel>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!clienteId}
                      onClick={adicionarItem}
                    >
                      <Plus className="size-3.5" />
                      Adicionar item
                    </Button>
                  </div>

                  {!clienteId && (
                    <p className="text-sm text-muted-foreground">Selecione um cliente primeiro.</p>
                  )}
                  {clienteId && linhas.fields.length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhum item adicionado.</p>
                  )}

                  {linhas.fields.length > 0 && (
                    <Table className="text-xs">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="px-1.5">Produto</TableHead>
                          <TableHead className="px-1.5 text-right">Estoque</TableHead>
                          <TableHead className="px-1.5 text-right">Qtd.</TableHead>
                          <TableHead className="px-1.5 text-right">Preço</TableHead>
                          <TableHead className="px-1.5 text-right">Últ. preço</TableHead>
                          <TableHead className="px-1.5 text-right">Desc.</TableHead>
                          <TableHead className="px-1.5 text-right">Últ. desc.</TableHead>
                          <TableHead className="px-1.5">Últ. venda</TableHead>
                          <TableHead className="px-1.5 text-right">% Comis.</TableHead>
                          <TableHead className="px-1.5">Regra desc.</TableHead>
                          <TableHead className="px-1.5 text-right">Pç. tabela</TableHead>
                          <TableHead className="w-7 px-1" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {linhas.fields.map((linha, index) => {
                          const info = infoPorLinha[index];
                          const produtoId = itensAtuais[index]?.produtoId;
                          const vlrUnitario = itensAtuais[index]?.vlrUnitario || 0;
                          const vlrTabela = info?.vlrTabela ?? null;
                          const desconto =
                            vlrTabela != null && vlrTabela > 0
                              ? ((vlrTabela - vlrUnitario) / vlrTabela) * 100
                              : null;
                          const mixInfo = produtoId ? mixPorProduto.get(produtoId) : undefined;
                          const ultimaVenda = mixInfo?.ultimaCompra ?? null;
                          const ultimoPreco = mixInfo?.ultimoPrecoUnitario ?? null;
                          // Prévia da comissão enquanto o vendedor mexe no
                          // preço: mesma função que o servidor usa ao salvar
                          // (calculo-comissao, nos contratos), então o número
                          // exibido é o que vai ser gravado.
                          const regraDaLinha = info?.regra ?? null;
                          const comissao = calcularComissaoItem(
                            regraDaLinha,
                            desconto,
                            vendedorSelecionado?.percComissao ?? null,
                          );
                          return (
                            <TableRow key={linha.id}>
                              <TableCell className="min-w-36 px-1.5">
                                <ProdutoCombobox
                                  value={produtoId || null}
                                  onChange={(produto) => onSelecionarProduto(index, produto)}
                                />
                              </TableCell>
                              <TableCell className="px-1.5 text-right text-muted-foreground">
                                {numero(info?.saldoEstoque)}
                              </TableCell>
                              <TableCell className="px-1.5 text-right">
                                <Input
                                  type="number"
                                  step="0.01"
                                  min={0.01}
                                  className="w-14 text-right"
                                  {...form.register(`itens.${index}.quantidade`, {
                                    valueAsNumber: true,
                                  })}
                                />
                              </TableCell>
                              <TableCell className="px-1.5 text-right">
                                <MaskedNumberInput
                                  className="w-20 text-right"
                                  value={vlrUnitario}
                                  onChange={(v) => form.setValue(`itens.${index}.vlrUnitario`, v)}
                                />
                              </TableCell>
                              <TableCell className="px-1.5 text-right text-muted-foreground">
                                {moeda(ultimoPreco)}
                              </TableCell>
                              <TableCell className="px-1.5 text-right">
                                <MaskedNumberInput
                                  className="w-[4.5rem] text-right"
                                  suffix="%"
                                  disabled={vlrTabela == null}
                                  value={desconto ?? 0}
                                  onChange={(v) => aplicarDesconto(index, v)}
                                />
                              </TableCell>
                              <TableCell className="px-1.5 text-right text-muted-foreground">
                                {percentual(mixInfo?.ultimoDesconto ?? null)}
                              </TableCell>
                              <TableCell className="px-1.5 text-muted-foreground">
                                {dataBr(ultimaVenda)}
                              </TableCell>
                              {/* Comissão e regra são calculadas pelo servidor;
                                  aqui é a prévia, e o alerta de desconto acima
                                  do limite da regra (que não bloqueia salvar). */}
                              <TableCell className="px-1.5 text-right text-muted-foreground">
                                {percentual(comissao.percComissao)}
                              </TableCell>
                              <TableCell className="px-1.5 text-xs text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  {regraDescontoLabel(regraDaLinha)}
                                  {comissao.acimaDoMaximo && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <TriangleAlert className="size-3.5 shrink-0 text-amber-500" />
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {comissao.acimaDoAutorizado
                                          ? `Desconto acima do autorizado (${percentual(regraDaLinha?.percDescontoAutorizado)})`
                                          : `Desconto acima do máximo da regra (${percentual(regraDaLinha?.percDescontoMaximo)})`}
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="px-1.5 text-right text-muted-foreground">
                                {moeda(vlrTabela)}
                              </TableCell>
                              <TableCell className="px-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-7"
                                  onClick={() => removerItem(index)}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}

                  {linhas.fields.length > 0 && (
                    <div className="flex justify-end border-t border-border/70 pt-2 text-sm font-medium">
                      Total: {moeda(totalCalculado)}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="mix" className="space-y-2 pt-3">
                  {!clienteId && (
                    <p className="text-sm text-muted-foreground">Selecione um cliente primeiro.</p>
                  )}
                  {clienteId && mixQuery.isLoading && (
                    <p className="text-sm text-muted-foreground">Carregando mix de produtos...</p>
                  )}
                  {clienteId && !mixQuery.isLoading && mix.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Cliente ainda não comprou nenhum produto.
                    </p>
                  )}
                  {mix.length > 0 && (
                    <Input
                      placeholder="Buscar produto por código ou descrição..."
                      value={mixBusca}
                      onChange={(e) => setMixBusca(e.target.value)}
                      className="max-w-sm"
                    />
                  )}
                  {mix.length > 0 && mixVisivel.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Nenhum produto do mix corresponde à busca.
                    </p>
                  )}
                  {mixVisivel.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-9" />
                          <SortableTableHead
                            label="Código"
                            active={mixSortBy === "codigoErp"}
                            order={mixSortOrder}
                            onClick={() => ordenarMix("codigoErp")}
                          />
                          <SortableTableHead
                            label="Descrição"
                            active={mixSortBy === "descricao"}
                            order={mixSortOrder}
                            onClick={() => ordenarMix("descricao")}
                          />
                          <SortableTableHead
                            label="Última compra"
                            active={mixSortBy === "ultimaCompra"}
                            order={mixSortOrder}
                            onClick={() => ordenarMix("ultimaCompra")}
                          />
                          <SortableTableHead
                            label="Últ. preço"
                            className="text-right"
                            active={mixSortBy === "ultimoPrecoUnitario"}
                            order={mixSortOrder}
                            onClick={() => ordenarMix("ultimoPrecoUnitario")}
                          />
                          <SortableTableHead
                            label="Últ. desconto"
                            className="text-right"
                            active={mixSortBy === "ultimoDesconto"}
                            order={mixSortOrder}
                            onClick={() => ordenarMix("ultimoDesconto")}
                          />
                          <SortableTableHead
                            label="Preço tabela"
                            className="text-right"
                            active={mixSortBy === "precoTabela"}
                            order={mixSortOrder}
                            onClick={() => ordenarMix("precoTabela")}
                          />
                          <SortableTableHead
                            label="Situação"
                            active={mixSortBy === "ativo"}
                            order={mixSortOrder}
                            onClick={() => ordenarMix("ativo")}
                          />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mixVisivel.map((m) => {
                          const jaAdicionado = itensAtuais.some((it) => it.produtoId === m.produtoId);
                          return (
                            <TableRow key={m.produtoId}>
                              <TableCell>
                                {m.ativo && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="size-7"
                                    disabled={jaAdicionado}
                                    title={jaAdicionado ? "Adicionado" : "Adicionar"}
                                    onClick={() => adicionarDoMix(m)}
                                  >
                                    <Plus className="size-3.5" />
                                  </Button>
                                )}
                              </TableCell>
                              <TableCell>{m.codigoErp}</TableCell>
                              <TableCell className="max-w-56 truncate">{m.descricao}</TableCell>
                              <TableCell className="text-muted-foreground">
                                {dataBr(m.ultimaCompra)}
                              </TableCell>
                              <TableCell className="text-right">{moeda(m.ultimoPrecoUnitario)}</TableCell>
                              <TableCell className="text-right">{percentual(m.ultimoDesconto)}</TableCell>
                              <TableCell className="text-right">{moeda(m.precoTabela)}</TableCell>
                              <TableCell>
                                <StatusDot active={m.ativo} showLabel={false} offColor="danger" />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>

            {clienteId && (
              <TabsContent value="historico" className="space-y-2 pt-3">
                <p className="text-sm text-muted-foreground">
                  Atendimentos registrados com este cliente — tudo que aconteceu até chegar neste
                  orçamento.
                </p>
                <OrcamentoTimeline clienteId={clienteId} orcamentoId={registro?.id} />
              </TabsContent>
            )}

            {registro && integracao && (
              <TabsContent value="integracao" className="space-y-4 pt-3">
                <div
                  className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${integracao.classe}`}
                >
                  <integracao.icone className="mt-0.5 size-4 shrink-0" />
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{integracao.titulo}</p>
                    <p className="text-sm opacity-90">{integracao.descricao}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field>
                    <FieldLabel>Nº do orçamento</FieldLabel>
                    <div className="text-sm">{registro.numero}</div>
                  </Field>
                  <Field>
                    <FieldLabel>Status do orçamento</FieldLabel>
                    <div className="text-sm">{STATUS_ORCAMENTO_LABEL[registro.status]}</div>
                  </Field>
                  <Field>
                    <FieldLabel>Código no ERP</FieldLabel>
                    <div className="text-sm">
                      {registro.codigoLegado ?? "— (ainda não integrado)"}
                    </div>
                  </Field>
                  <Field>
                    <FieldLabel>Criado em</FieldLabel>
                    <div className="text-sm">{dataHoraBr(registro.createdAt)}</div>
                  </Field>
                  <Field>
                    <FieldLabel>Última alteração</FieldLabel>
                    <div className="text-sm">{dataHoraBr(registro.updatedAt)}</div>
                  </Field>
                </div>

                <p className="text-sm text-muted-foreground">
                  Só orçamentos aprovados ficam disponíveis para o ERP importar. Depois de importar,
                  o ERP vincula o registro e o código gerado lá aparece aqui.
                </p>
              </TabsContent>
            )}
          </Tabs>
          </fieldset>
        </CardContent>

        <CardFooter className="justify-end gap-2">
          {/* PDF só depois de salvo — precisa dos itens com produto e do total
              consolidado pelo servidor. */}
          {registro && (
            <Button
              type="button"
              variant="outline"
              className="mr-auto"
              disabled={gerandoPdf}
              onClick={() => void baixarPdf()}
            >
              <FileDown className="size-4" />
              {gerandoPdf ? "Gerando..." : "Gerar PDF"}
            </Button>
          )}
          {/* Copiar é a saída para orçamento aprovado/vencido, que não aceita
              mais alteração — gera um novo cadastro a partir deste. */}
          {registro && (
            <Button type="button" variant="outline" onClick={copiar}>
              <Copy className="size-4" />
              Copiar
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose}>
            {bloqueado ? "Voltar" : "Cancelar"}
          </Button>
          {!bloqueado && (
            <>
              {/* Salva e continua na tela — é assim que dá pra emitir o PDF e
                  abrir Histórico/Integração logo depois de cadastrar. */}
              <Button
                type="button"
                variant="secondary"
                disabled={form.formState.isSubmitting}
                onClick={form.handleSubmit((v) => salvar(v, false))}
              >
                Salvar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {registro ? "Salvar e fechar" : "Cadastrar e fechar"}
              </Button>
            </>
          )}
        </CardFooter>
      </form>
    </Card>
  );
}

/** Página cheia de cadastro/edição de orçamento. */
export function OrcamentoForm({ orcamento }: { orcamento?: Orcamento }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clienteIdPadrao = searchParams.get("clienteId");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">
          {orcamento ? `Editar orçamento Nº ${orcamento.numero}` : "Novo orçamento"}
        </h1>
      </div>

      <OrcamentoFormContent
        orcamento={orcamento}
        clienteIdPadrao={clienteIdPadrao}
        onClose={() => router.push(LIST_ROUTE)}
      />
    </div>
  );
}

/**
 * Cortina lateral pra criar um orçamento já com o cliente pré-selecionado —
 * usada a partir da listagem de Posição de Cliente ("Incluir Orçamento"),
 * pra não perder busca/filtro/paginação de quem está consultando a lista.
 */
export function OrcamentoSheet({
  clienteId,
  onOpenChange,
}: {
  clienteId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();

  const handleClose = () => {
    onOpenChange(false);
    void queryClient.invalidateQueries({ queryKey: ["orcamentos"] });
  };

  return (
    <Sheet open={!!clienteId} onOpenChange={onOpenChange}>
      <ResizableSheetContent defaultWidth={860}>
        <SheetHeader>
          <SheetTitle>Novo orçamento</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-4">
          {clienteId && (
            <OrcamentoFormContent key={clienteId} clienteIdPadrao={clienteId} onClose={handleClose} />
          )}
        </div>
      </ResizableSheetContent>
    </Sheet>
  );
}
