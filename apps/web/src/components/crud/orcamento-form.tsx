"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFieldArray, useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  autorizacaoDescontoSituacao,
  calcularComissaoItem,
  orcamentoCreateSchema,
  orcamentoUpdateSchema,
  type Cliente,
  type CondicaoPagamento,
  type Oportunidade,
  type Orcamento,
  type OrcamentoConfig,
  type OrcamentoCreate,
  type OrcamentoUpdate,
  type PosicaoCliente,
  type PosicaoClienteMix,
  type RegraParaCalculo,
  type Produto,
  type StatusOrcamento,
} from "@plataforma/contracts";
import { useResourceMutations } from "@/hooks/use-resource";
import { apiDownload, apiFetch, ApiError } from "@/lib/api-client";
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
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
  CircleCheck,
  Clock,
  Copy,
  FileDown,
  Info,
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

/**
 * Quantidade da linha de item: descarta tudo que não for dígito, porque
 * quantidade de orçamento é inteira (o schema em contracts também barra
 * fracionário). Campo vazio guarda 0 no formulário — o zod recusa no submit —
 * e volta a aparecer vazio, pra dar pra apagar e digitar outro número.
 */
function QuantidadeInput({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
}) {
  return (
    <Input
      type="text"
      inputMode="numeric"
      className={className}
      aria-invalid={!value}
      value={value ? String(value) : ""}
      onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, "")) || 0)}
    />
  );
}

/** Info local (não vai pro submit) de cada linha de item, pra render das colunas Preço tabela/Desconto/Estoque. */
interface LinhaInfo {
  vlrTabela: number | null;
  saldoEstoque: number | null;
  /** Regra aplicável ao produto (tabela de preço > produto > categoria > padrão). */
  regra?: RegraAplicavel | null;
  /** "código — descrição" do produto, só pra identificar a linha na aba Advertências. */
  produtoLabel?: string | null;
}

/**
 * Advertência de uma linha de item: `critico` pinta a linha de vermelho (e o
 * ícone no início dela), `aviso` fica em âmbar. Nada aqui bloqueia a gravação
 * — exceto desconto acima do limite quando o parâmetro
 * DESCONTO_ACIMA_LIMITE_BLOQUEIA da empresa está ligado, e aí quem recusa é o
 * servidor.
 */
interface Advertencia {
  nivel: "critico" | "aviso";
  titulo: string;
  detalhe: string;
}

/**
 * Fração do saldo que, se for tudo o que sobra depois do item, já rende o
 * aviso de "estoque baixo" — é o "próximo de zero" da aba Advertências.
 */
const ESTOQUE_BAIXO_RESTANTE = 0.1;

/**
 * Escala do desconto da linha, medida contra o "% Desc Máximo" da regra. Cada
 * degrau acende um sinal mais forte que o anterior:
 *
 * | Desconto                          | Sinal                              |
 * |-----------------------------------|------------------------------------|
 * | negativo (preço acima da tabela)  | ícone azul                         |
 * | de zero até metade do máximo      | ícone verde                        |
 * | ≥ metade do máximo                | ícone amarelo                      |
 * | ≥ 80% do máximo                   | ícone vermelho                     |
 * | ≥ 90% do máximo                   | ícone e números da linha vermelhos |
 * | ≥ o máximo da regra               | + linha inteira destacada          |
 * | ≥ o "% Desc Autorizado"           | ícone preto, linha destacada       |
 *
 * Os degraus intermediários são só sinalização. Do máximo em diante o
 * orçamento passa a exigir autorização de desconto (ver `travadoPorDesconto`).
 */
type ChaveNivelDesconto =
  | "acima-tabela"
  | "normal"
  | "atencao"
  | "alto"
  | "muito-alto"
  | "no-maximo"
  | "faixa-aprovacao";

interface NivelDesconto {
  chave: ChaveNivelDesconto;
  /** Classe de cor do ícone da linha. */
  corIcone: string;
  /** Números da linha em vermelho. */
  textoVermelho: boolean;
  /** Linha inteira destacada em vermelho. */
  linhaDestacada: boolean;
  legenda: string;
}

const NIVEL_SEM_REGRA: NivelDesconto = {
  chave: "normal",
  corIcone: "text-success",
  textoVermelho: false,
  linhaDestacada: false,
  legenda: "Sem regra de desconto aplicável a este produto",
};

function nivelDoDesconto(
  desconto: number | null,
  regra: RegraAplicavel | null,
): NivelDesconto | null {
  // Sem preço de tabela não há desconto conhecido — nada a sinalizar.
  if (desconto == null) return null;
  if (desconto < 0) {
    return {
      chave: "acima-tabela",
      corIcone: "text-blue-600 dark:text-blue-400",
      textoVermelho: false,
      linhaDestacada: false,
      legenda: "Preço acima da tabela (desconto negativo)",
    };
  }
  if (!regra) return NIVEL_SEM_REGRA;

  const maximo = regra.percDescontoMaximo;
  const autorizado = regra.percDescontoAutorizado;
  // A faixa de aprovação só existe quando o cadastro prevê um teto autorizado
  // acima do máximo — é o degrau em que a venda só sai com liberação.
  if (autorizado > maximo && desconto >= autorizado) {
    return {
      chave: "faixa-aprovacao",
      corIcone: "text-foreground",
      textoVermelho: true,
      linhaDestacada: true,
      legenda: `Desconto na faixa de aprovação da regra (a partir de ${percentual(autorizado)})`,
    };
  }
  if (desconto > 0 && desconto >= maximo) {
    return {
      chave: "no-maximo",
      corIcone: "text-destructive",
      textoVermelho: true,
      linhaDestacada: true,
      legenda: `Desconto igual ou acima do máximo da regra (${percentual(maximo)})`,
    };
  }
  if (maximo > 0 && desconto >= maximo * 0.9) {
    return {
      chave: "muito-alto",
      corIcone: "text-destructive",
      textoVermelho: true,
      linhaDestacada: false,
      legenda: `Desconto em 90% ou mais do máximo da regra (${percentual(maximo)})`,
    };
  }
  if (maximo > 0 && desconto >= maximo * 0.8) {
    return {
      chave: "alto",
      corIcone: "text-destructive",
      textoVermelho: false,
      linhaDestacada: false,
      legenda: `Desconto em 80% ou mais do máximo da regra (${percentual(maximo)})`,
    };
  }
  if (maximo > 0 && desconto >= maximo * 0.5) {
    return {
      chave: "atencao",
      corIcone: "text-amber-500",
      textoVermelho: false,
      linhaDestacada: false,
      legenda: `Desconto na metade ou mais do máximo da regra (${percentual(maximo)})`,
    };
  }
  return {
    chave: "normal",
    corIcone: "text-success",
    textoVermelho: false,
    linhaDestacada: false,
    legenda:
      desconto === 0
        ? "Venda sem desconto"
        : `Desconto dentro do previsto pela regra (máximo ${percentual(maximo)})`,
  };
}

/**
 * Advertências da linha: desconto acima do limite da regra e situação de
 * estoque (zerado, insuficiente pro que foi pedido, ou perto de zerar).
 * Compartilhada entre o ícone da linha na aba Itens e a aba Advertências,
 * pra as duas dizerem exatamente a mesma coisa.
 */
function advertenciasDaLinha(
  regra: RegraAplicavel | null,
  desconto: number | null,
  nivel: NivelDesconto | null,
  quantidade: number,
  saldoEstoque: number | null,
): Advertencia[] {
  const lista: Advertencia[] = [];
  const daRegra = regra ? ` da regra ${regraDescontoLabel(regra)}` : "";
  // Do "atenção" (metade do máximo) para cima o desconto vira advertência
  // listada; abaixo disso o ícone verde/azul da linha já diz o suficiente.
  if (nivel && nivel.chave !== "normal" && nivel.chave !== "acima-tabela") {
    const trava =
      nivel.chave === "no-maximo" || nivel.chave === "faixa-aprovacao";
    lista.push({
      nivel: trava ? "critico" : "aviso",
      titulo:
        nivel.chave === "faixa-aprovacao"
          ? "Desconto na faixa de aprovação"
          : nivel.chave === "no-maximo"
            ? "Desconto igual ou acima do máximo"
            : "Desconto se aproximando do máximo",
      detalhe:
        `Desconto de ${percentual(desconto)}${daRegra} — ${nivel.legenda.toLowerCase()}.` +
        (trava ? " PDF e efetivação exigem autorização de desconto." : ""),
    });
  }
  if (saldoEstoque != null) {
    if (saldoEstoque <= 0) {
      lista.push({
        nivel: "critico",
        titulo: "Produto sem estoque",
        detalhe: `Saldo disponível de ${numero(saldoEstoque)} — o item foi lançado sem estoque para atender.`,
      });
    } else if (saldoEstoque < quantidade) {
      lista.push({
        nivel: "critico",
        titulo: "Estoque insuficiente",
        detalhe: `Quantidade pedida (${numero(quantidade)}) maior que o saldo disponível (${numero(saldoEstoque)}).`,
      });
    } else if (saldoEstoque - quantidade <= saldoEstoque * ESTOQUE_BAIXO_RESTANTE) {
      lista.push({
        nivel: "aviso",
        titulo: "Estoque próximo de zero",
        detalhe: `Sobram ${numero(saldoEstoque - quantidade)} de saldo depois deste item (disponível hoje: ${numero(saldoEstoque)}).`,
      });
    }
  }
  return lista;
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
      ? orcamento.itens.map((i) => ({
          vlrTabela: i.vlrTabela,
          saldoEstoque: null,
          produtoLabel: `${i.produto.codigoErp} — ${i.produto.descricao}`,
        }))
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
  // Valores de comissão são restritos (o perfil Vendedor não vê) — a API já
  // devolve nulo pra quem não pode, e aqui a coluna some junto.
  const podeVerComissao = useAuthStore((s) => s.hasPermission)("comissao", "visualizar");
  // Quem aprova orçamento é quem libera desconto acima do máximo da regra
  // (segunda etapa da autorização).
  const podeAutorizarDesconto = useAuthStore((s) => s.hasPermission)(
    "orcamentos",
    "aprovar",
  );

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

  /**
   * O vendedor do orçamento é o vendedor cadastrado no cliente — não é uma
   * escolha do usuário. O campo fica somente leitura na tela e o servidor
   * reimpõe a mesma regra ao gravar (ver OrcamentosService.create/update).
   * Trocar o cliente traz o vendedor do novo cadastro junto; na edição, o
   * vendedor já gravado só é substituído se o cliente mudar — assim reabrir
   * um orçamento antigo não o transfere caso a carteira tenha mudado desde
   * então.
   *
   * Cliente sem vendedor cadastrado é a única exceção: aí o campo é liberado
   * (e cai no vendedor do usuário logado, abaixo), senão não haveria como
   * orçar.
   */
  const vendedorDoCliente = clienteSelecionadoQuery.data?.vendedorId ?? null;
  useEffect(() => {
    if (!vendedorDoCliente) return;
    // Cópia grava um orçamento novo, então segue a regra da criação.
    if (orcamento && !copiando && clienteId === orcamento.clienteId) return;
    if (form.getValues("vendedorId") === vendedorDoCliente) return;
    form.setValue("vendedorId", vendedorDoCliente);
    // A oportunidade é filtrada por vendedor — a anterior não vale mais.
    form.setValue("oportunidadeId", null);
  }, [vendedorDoCliente, orcamento, copiando, clienteId, form]);

  // Enquanto não houver cliente escolhido (criação pelo menu, sem
  // ?clienteId=), sugere o próprio vendedor do usuário logado, se houver
  // vínculo — só na primeira carga; o vendedor do cliente assume depois.
  const [vendedorPadraoAplicado, setVendedorPadraoAplicado] = useState(false);
  const meuVendedorId = vendedoresEscopoQuery.data?.meuVendedorId;
  useEffect(() => {
    if (orcamento || vendedorPadraoAplicado || clienteIdPadrao) return;
    if (!meuVendedorId) return;
    form.setValue("vendedorId", meuVendedorId);
    setVendedorPadraoAplicado(true);
  }, [orcamento, vendedorPadraoAplicado, clienteIdPadrao, meuVendedorId, form]);

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

  /**
   * Posição do cliente (mesma rota da tela Posição de Cliente): traz o resumo
   * de compras, os títulos em aberto e o cadastro com o bloqueio. É daqui que
   * saem o sinalizador de título ao lado do cliente e as advertências que não
   * dependem dos itens. A rota exige posicao-cliente.visualizar — sem essa
   * permissão a consulta falha e o formulário simplesmente não mostra esses
   * avisos, em vez de quebrar.
   */
  const posicaoQuery = useQuery({
    queryKey: ["clientes", clienteId, "posicao"],
    queryFn: () => apiFetch<PosicaoCliente>(`/clientes/${clienteId}/posicao`),
    enabled: !!clienteId,
    retry: false,
  });
  const posicao = posicaoQuery.data;

  const itensAtuais = form.watch("itens");
  const totalCalculado = itensAtuais.reduce(
    (acc, it) => acc + (it.quantidade || 0) * (it.vlrUnitario || 0),
    0,
  );

  /**
   * Números derivados de cada linha (desconto praticado, prévia da comissão e
   * advertências), calculados uma vez só e consumidos pela tabela de Itens e
   * pela aba Advertências — as duas mostram o mesmo resultado.
   *
   * A comissão usa a mesma função do servidor (calculo-comissao, nos
   * contratos), então o número exibido é o que vai ser gravado.
   */
  const linhasCalculadas = itensAtuais.map((item, index) => {
    const info = infoPorLinha[index] ?? null;
    const vlrTabela = info?.vlrTabela ?? null;
    const vlrUnitario = item?.vlrUnitario || 0;
    const quantidade = item?.quantidade || 0;
    const desconto =
      vlrTabela != null && vlrTabela > 0 ? ((vlrTabela - vlrUnitario) / vlrTabela) * 100 : null;
    const regra = info?.regra ?? null;
    const comissao = calcularComissaoItem(
      regra,
      desconto,
      vendedorSelecionado?.percComissao ?? null,
    );
    const nivel = nivelDoDesconto(desconto, regra);
    const advertencias = advertenciasDaLinha(
      regra,
      desconto,
      nivel,
      quantidade,
      info?.saldoEstoque ?? null,
    );
    return {
      info,
      vlrTabela,
      vlrUnitario,
      quantidade,
      desconto,
      regra,
      comissao,
      nivel,
      advertencias,
      temCritico: advertencias.some((a) => a.nivel === "critico"),
    };
  });
  /**
   * Advertências que são do cliente, não de um item: títulos vencidos e
   * cadastro bloqueado. Nenhuma das duas impede salvar, gerar PDF ou efetivar
   * — são informação para o vendedor decidir.
   */
  const advertenciasDoCliente: Advertencia[] = [];
  const titulosVencidos = posicao?.titulos.filter((t) => t.status === "vencido") ?? [];
  if (posicao && posicao.resumo.totalTitulosVencido > 0) {
    advertenciasDoCliente.push({
      nivel: "critico",
      titulo: "Cliente com títulos vencidos",
      detalhe:
        `${moeda(posicao.resumo.totalTitulosVencido)} vencidos em ` +
        `${titulosVencidos.length} ${titulosVencidos.length === 1 ? "título" : "títulos"}` +
        (posicao.resumo.totalTitulosAberto > 0
          ? `, de ${moeda(posicao.resumo.totalTitulosAberto)} em aberto.`
          : "."),
    });
  }
  const dataBloqueioCliente = clienteSelecionadoQuery.data?.dataBloqueio ?? null;
  if (dataBloqueioCliente) {
    advertenciasDoCliente.push({
      nivel: "critico",
      titulo: "Cliente bloqueado",
      detalhe:
        `Bloqueado em ${dataBr(String(dataBloqueioCliente))}.` +
        (clienteSelecionadoQuery.data?.observacaoBloqueio
          ? ` Motivo: ${clienteSelecionadoQuery.data.observacaoBloqueio}`
          : ""),
    });
  }

  const totalAdvertencias =
    linhasCalculadas.reduce((n, l) => n + l.advertencias.length, 0) +
    advertenciasDoCliente.length;

  /**
   * Situação do cliente nos títulos em aberto, no mesmo código de cores da
   * Posição de Cliente: vermelho = vencido, azul = vence em até 7 dias, verde
   * = em aberto e não vencido. Sem título em aberto, não mostra nada.
   */
  const indicadorTitulo = (() => {
    if (!posicao) return null;
    const abertos = posicao.titulos.filter((t) => t.status !== "baixado");
    if (abertos.length === 0) return null;
    if (abertos.some((t) => t.status === "vencido")) {
      return { cor: "text-destructive", legenda: "Cliente tem título vencido" };
    }
    const seteDias = Date.now() + 7 * 24 * 60 * 60 * 1000;
    if (
      abertos.some((t) => t.vencimento && new Date(t.vencimento).getTime() <= seteDias)
    ) {
      return {
        cor: "text-blue-600 dark:text-blue-400",
        legenda: "Cliente tem título vencendo nos próximos 7 dias",
      };
    }
    return { cor: "text-success", legenda: "Cliente tem título em aberto, não vencido" };
  })();

  /**
   * Trava do desconto: linha que alcançou ou passou o "% Desc Máximo" da regra
   * exige autorização antes de gerar a proposta em PDF ou efetivar (aprovar).
   * A prévia aqui usa o mesmo cálculo do servidor — que é quem recusa de fato,
   * pelas rotas.
   */
  const exigeAutorizacao = linhasCalculadas.some((l) => l.comissao.acimaDoMaximo);
  const situacaoAutorizacao = registro
    ? autorizacaoDescontoSituacao(registro)
    : "nao_solicitada";
  const travadoPorDesconto = exigeAutorizacao && situacaoAutorizacao !== "autorizada";

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
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const baixarPdf = async () => {
    if (!registro) return;
    if (travadoPorDesconto) {
      toast.error(
        "Desconto igual ou acima do máximo da regra — é preciso autorizar antes de gerar o PDF",
      );
      return;
    }
    setGerandoPdf(true);
    try {
      // O arquivo é montado no servidor (era no navegador, com jsPDF): é o
      // mesmo PDF que a conversa do WhatsApp anexa, e a rota já registra a
      // emissão no histórico do orçamento/cliente.
      await apiDownload(
        `/orcamentos/${registro.id}/pdf`,
        `orcamento-${registro.numero}.pdf`,
      );
      void queryClient.invalidateQueries({ queryKey: ["atividades"] });
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Não foi possível gerar o PDF do orçamento",
      );
    } finally {
      setGerandoPdf(false);
    }
  };

  /**
   * Autorização de desconto em duas etapas: o vendedor solicita (abre a
   * pendência na agenda do supervisor) e quem tem permissão de aprovar libera.
   * Enquanto não houver liberação, PDF e efetivação ficam travados.
   */
  const [acaoAutorizacao, setAcaoAutorizacao] = useState(false);
  const chamarAutorizacao = async (rota: "solicitar-autorizacao-desconto" | "autorizar-desconto") => {
    if (!registro) return;
    setAcaoAutorizacao(true);
    try {
      const atualizado = await apiFetch<Orcamento>(`/orcamentos/${registro.id}/${rota}`, {
        method: "POST",
      });
      setSalvoNaSessao(atualizado);
      void queryClient.invalidateQueries({ queryKey: ["atividades"] });
      void queryClient.invalidateQueries({ queryKey: ["orcamentos"] });
      toast.success(
        rota === "autorizar-desconto"
          ? "Desconto autorizado — PDF e efetivação liberados"
          : "Autorização solicitada ao supervisor",
      );
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Não foi possível concluir a ação",
      );
    } finally {
      setAcaoAutorizacao(false);
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
                produtoLabel: `${produto.codigoErp} — ${produto.descricao}`,
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
    setInfoPorLinha((arr) => [
      ...arr,
      {
        vlrTabela: produto.precoTabela,
        saldoEstoque: null,
        produtoLabel: `${produto.codigoErp} — ${produto.descricao}`,
      },
    ]);
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
                produtoLabel: `${produto.codigoErp} — ${produto.descricao}`,
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
   * Clicar em Salvar sem passar na validação não fazia nada: o formulário só
   * marcava os campos, e os erros de item (quantidade, produto) não têm onde
   * aparecer na tabela — dava a impressão de botão travado. Aqui o motivo vira
   * um aviso na tela, dizendo qual linha está impedindo.
   */
  const avisarInvalido = (erros: FieldErrors<OrcamentoCreate>) => {
    const itensComErro = Array.isArray(erros.itens)
      ? erros.itens
          .map((erro, i) => (erro ? i + 1 : null))
          .filter((i): i is number => i !== null)
      : [];
    if (itensComErro.length > 0) {
      toast.error(
        `Revise ${itensComErro.length === 1 ? "o item" : "os itens"} ${itensComErro.join(", ")} ` +
          "da aba Itens: produto e quantidade (número inteiro maior que zero) são obrigatórios.",
      );
      return;
    }
    const primeiro = Object.values(erros).find(
      (e) => e && typeof e === "object" && "message" in e && e.message,
    ) as { message?: string } | undefined;
    toast.error(primeiro?.message ?? "Revise os campos destacados antes de salvar.");
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
        onSubmit={form.handleSubmit((v) => salvar(v, true), avisarInvalido)}
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

          {/* Trava do desconto acima do máximo: o vendedor continua salvando,
              mas PDF e efetivação só depois da autorização. */}
          {exigeAutorizacao && (
            <div
              className={`mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2 text-sm ${
                situacaoAutorizacao === "autorizada"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "border-destructive/40 bg-destructive/10 text-destructive"
              }`}
            >
              <TriangleAlert className="size-4 shrink-0" />
              <span className="min-w-0 flex-1">
                {situacaoAutorizacao === "autorizada"
                  ? `Desconto autorizado em ${dataHoraBr(registro?.descontoAutorizadoEm ?? null)} — PDF e efetivação liberados.`
                  : situacaoAutorizacao === "pendente"
                    ? `Autorização solicitada em ${dataHoraBr(registro?.descontoSolicitadoEm ?? null)} — aguardando liberação. PDF e efetivação seguem bloqueados.`
                    : "Há item com desconto igual ou acima do máximo da regra. PDF e efetivação ficam bloqueados até a autorização."}
              </span>
              {registro && situacaoAutorizacao === "nao_solicitada" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={acaoAutorizacao}
                  onClick={() => void chamarAutorizacao("solicitar-autorizacao-desconto")}
                >
                  Solicitar autorização
                </Button>
              )}
              {registro && situacaoAutorizacao !== "autorizada" && podeAutorizarDesconto && (
                <Button
                  type="button"
                  size="sm"
                  disabled={acaoAutorizacao}
                  onClick={() => void chamarAutorizacao("autorizar-desconto")}
                >
                  Autorizar desconto
                </Button>
              )}
              {!registro && (
                <span className="text-xs opacity-90">
                  Salve o orçamento para solicitar a autorização.
                </span>
              )}
            </div>
          )}
          <fieldset disabled={bloqueado} className="m-0 min-w-0 border-0 p-0">
          <Tabs defaultValue="orcamento">
            <TabsList>
              <TabsTrigger value="orcamento">Orçamento</TabsTrigger>
              <TabsTrigger value="itens">Itens ({linhas.fields.length})</TabsTrigger>
              <TabsTrigger value="mix">Mix de produtos ({mix.length})</TabsTrigger>
              <TabsTrigger value="advertencias">
                <span className="flex items-center gap-1.5">
                  {totalAdvertencias > 0 && (
                    <TriangleAlert
                      className={`size-3.5 ${
                        linhasCalculadas.some((l) => l.temCritico)
                          ? "text-destructive"
                          : "text-amber-500"
                      }`}
                    />
                  )}
                  Advertências ({totalAdvertencias})
                </span>
              </TabsTrigger>
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
                <FieldLabel htmlFor="clienteId">
                  Cliente
                  {/* Mesmo sinalizador de título da Posição de Cliente — a cor
                      diz a pior situação entre os títulos em aberto. */}
                  {indicadorTitulo && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={`ml-1 font-bold ${indicadorTitulo.cor}`}>$</span>
                      </TooltipTrigger>
                      <TooltipContent>{indicadorTitulo.legenda}</TooltipContent>
                    </Tooltip>
                  )}
                </FieldLabel>
                <ClienteCombobox
                  value={form.watch("clienteId") || null}
                  onChange={(id) => form.setValue("clienteId", id ?? "")}
                  disabled={!orcamento && !!clienteIdPadrao}
                />
                <FieldError errors={[form.formState.errors.clienteId]} />
              </Field>
              {/* Vendedor vem do cadastro do cliente e não se troca aqui —
                  só fica liberado quando o cliente não tem vendedor. */}
              <Field data-invalid={!!form.formState.errors.vendedorId}>
                <FieldLabel htmlFor="vendedorId">Vendedor</FieldLabel>
                <Select
                  value={vendedorId || undefined}
                  onValueChange={(v) => {
                    form.setValue("vendedorId", v);
                    form.setValue("oportunidadeId", null);
                  }}
                  disabled={!!vendedorDoCliente}
                >
                  <SelectTrigger id="vendedorId" className="w-full">
                    <SelectValue
                      placeholder={clienteId ? "Selecione o vendedor" : "Escolha um cliente primeiro"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {opcoesVendedor.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.nomeReduzido || v.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {vendedorDoCliente
                    ? "Definido pelo cadastro do cliente."
                    : "Cliente sem vendedor cadastrado — selecione o responsável."}
                </FieldDescription>
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
                      <SelectItem
                        key={s.value}
                        value={s.value}
                        // Efetivar exige a autorização do desconto; o servidor
                        // recusa de todo jeito, aqui a opção nem fica clicável.
                        disabled={s.value === "aprovado" && travadoPorDesconto}
                      >
                        {s.label}
                        {s.value === "aprovado" && travadoPorDesconto
                          ? " (requer autorização)"
                          : ""}
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
                          {/* Coluna do sinalizador de advertência da linha. */}
                          <TableHead className="w-7 px-1" />
                          <TableHead className="px-1.5">Produto</TableHead>
                          <TableHead className="px-1.5 text-right">Estoque</TableHead>
                          <TableHead className="px-1.5 text-right">Qtd.</TableHead>
                          <TableHead className="px-1.5 text-right">Preço</TableHead>
                          <TableHead className="px-1.5 text-right">Total</TableHead>
                          <TableHead className="px-1.5 text-right">Últ. preço</TableHead>
                          <TableHead className="px-1.5 text-right">Desc.</TableHead>
                          <TableHead className="px-1.5 text-right">Últ. desc.</TableHead>
                          <TableHead className="px-1.5">Últ. venda</TableHead>
                          {podeVerComissao && (
                            <TableHead className="px-1.5 text-right">% Comis.</TableHead>
                          )}
                          <TableHead className="px-1.5">Regra desc.</TableHead>
                          <TableHead className="px-1.5 text-right">Pç. tabela</TableHead>
                          <TableHead className="w-7 px-1" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {linhas.fields.map((linha, index) => {
                          const calc = linhasCalculadas[index];
                          const info = calc?.info ?? infoPorLinha[index] ?? null;
                          const produtoId = itensAtuais[index]?.produtoId;
                          const quantidade = calc?.quantidade ?? 0;
                          const vlrUnitario = calc?.vlrUnitario ?? 0;
                          const vlrTabela = calc?.vlrTabela ?? null;
                          const desconto = calc?.desconto ?? null;
                          const mixInfo = produtoId ? mixPorProduto.get(produtoId) : undefined;
                          const ultimaVenda = mixInfo?.ultimaCompra ?? null;
                          const ultimoPreco = mixInfo?.ultimoPrecoUnitario ?? null;
                          const regraDaLinha = calc?.regra ?? null;
                          const comissao = calc?.comissao;
                          const advertencias = calc?.advertencias ?? [];
                          const nivel = calc?.nivel ?? null;
                          // A escala do desconto manda no ícone; um problema
                          // crítico de estoque puxa para vermelho quando a
                          // escala estaria em verde/azul/amarelo — o único
                          // sinal mais forte que o vermelho é o preto da faixa
                          // de aprovação.
                          const corSinal =
                            nivel?.chave === "faixa-aprovacao"
                              ? nivel.corIcone
                              : calc?.temCritico
                                ? "text-destructive"
                                : (nivel?.corIcone ??
                                  (advertencias.length > 0 ? "text-amber-500" : null));
                          const IconeSinal =
                            nivel?.chave === "normal"
                              ? CircleCheck
                              : nivel?.chave === "acima-tabela"
                                ? Info
                                : TriangleAlert;
                          const textoVermelho =
                            nivel?.textoVermelho === true ? "text-destructive" : "";
                          return (
                            <TableRow
                              key={linha.id}
                              // Linha destacada em vermelho a partir do máximo
                              // da regra, e também quando o item foi lançado
                              // sem saldo para atender.
                              className={
                                nivel?.linhaDestacada || calc?.temCritico
                                  ? "bg-destructive/10 hover:bg-destructive/15"
                                  : undefined
                              }
                            >
                              {/* O texto só no hover do ícone; o detalhe
                                  completo fica na aba Advertências. */}
                              <TableCell className="px-1">
                                {corSinal && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <IconeSinal className={`size-3.5 shrink-0 ${corSinal}`} />
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-72">
                                      <ul className="space-y-1">
                                        {nivel && <li>{nivel.legenda}</li>}
                                        {advertencias.map((a) => (
                                          <li key={a.titulo}>
                                            <span className="font-medium">{a.titulo}</span> —{" "}
                                            {a.detalhe}
                                          </li>
                                        ))}
                                      </ul>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </TableCell>
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
                                <QuantidadeInput
                                  className="w-14 text-right"
                                  value={quantidade}
                                  onChange={(v) => form.setValue(`itens.${index}.quantidade`, v)}
                                />
                              </TableCell>
                              <TableCell className="px-1.5 text-right">
                                <MaskedNumberInput
                                  className={`w-20 text-right ${textoVermelho}`}
                                  value={vlrUnitario}
                                  onChange={(v) => form.setValue(`itens.${index}.vlrUnitario`, v)}
                                />
                              </TableCell>
                              <TableCell
                                className={`px-1.5 text-right font-medium ${textoVermelho}`}
                              >
                                {moeda(quantidade * vlrUnitario)}
                              </TableCell>
                              <TableCell className="px-1.5 text-right text-muted-foreground">
                                {moeda(ultimoPreco)}
                              </TableCell>
                              <TableCell className="px-1.5 text-right">
                                <MaskedNumberInput
                                  className={`w-[4.5rem] text-right ${textoVermelho}`}
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
                                  aqui é a prévia. O alerta de desconto acima do
                                  limite virou o ícone no início da linha. */}
                              {podeVerComissao && (
                                <TableCell className="px-1.5 text-right text-muted-foreground">
                                  {percentual(comissao?.percComissao ?? null)}
                                </TableCell>
                              )}
                              <TableCell className="px-1.5 text-xs text-muted-foreground">
                                {regraDescontoLabel(regraDaLinha)}
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

                <TabsContent value="advertencias" className="space-y-3 pt-3">
                  <p className="text-sm text-muted-foreground">
                    Pontos de atenção do orçamento: situação do cliente (títulos vencidos,
                    cadastro bloqueado), desconto no limite da regra e situação de estoque (sem
                    saldo, saldo menor que a quantidade pedida ou saldo prestes a zerar). Salvar
                    continua liberado em todos os casos; só o desconto igual ou acima do máximo
                    trava a proposta em PDF e a efetivação, até haver autorização.
                  </p>

                  {/* Legenda da escala de desconto — a mesma cor que aparece
                      no ícone de cada linha da aba Itens. */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg border border-border/70 px-3 py-2 text-xs">
                    <span className="flex items-center gap-1.5">
                      <Info className="size-3.5 text-blue-600 dark:text-blue-400" />
                      Preço acima da tabela
                    </span>
                    <span className="flex items-center gap-1.5">
                      <CircleCheck className="size-3.5 text-success" />
                      Até metade do máximo
                    </span>
                    <span className="flex items-center gap-1.5">
                      <TriangleAlert className="size-3.5 text-amber-500" />≥ 50% do máximo
                    </span>
                    <span className="flex items-center gap-1.5">
                      <TriangleAlert className="size-3.5 text-destructive" />≥ 80% do máximo
                    </span>
                    <span className="flex items-center gap-1.5 text-destructive">
                      <TriangleAlert className="size-3.5" />≥ 90% do máximo
                    </span>
                    <span className="flex items-center gap-1.5 rounded bg-destructive/10 px-1.5 text-destructive">
                      <TriangleAlert className="size-3.5" />≥ o máximo (trava PDF/efetivação)
                    </span>
                    <span className="flex items-center gap-1.5 rounded bg-destructive/10 px-1.5">
                      <TriangleAlert className="size-3.5 text-foreground" />
                      Faixa de aprovação
                    </span>
                  </div>

                  {totalAdvertencias === 0 && (
                    <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
                      Nenhuma advertência neste orçamento.
                    </p>
                  )}

                  {/* Advertências do cliente (títulos vencidos, bloqueio) vêm
                      primeiro: são o pano de fundo do negócio inteiro, não de
                      uma linha. Nenhuma delas trava nada. */}
                  {advertenciasDoCliente.length > 0 && (
                    <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2.5">
                      <p className="text-sm font-medium">
                        {clienteSelecionadoQuery.data?.nomeFantasia ||
                          clienteSelecionadoQuery.data?.razaoSocial ||
                          "Cliente"}
                      </p>
                      <ul className="space-y-1.5">
                        {advertenciasDoCliente.map((a) => (
                          <li key={a.titulo} className="flex items-start gap-2 text-sm">
                            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                            <span>
                              <span className="font-medium text-destructive">{a.titulo}</span>{" "}
                              — {a.detalhe}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {linhasCalculadas.map((l, index) =>
                    l.advertencias.length === 0 ? null : (
                      <div
                        key={linhas.fields[index]?.id ?? index}
                        className={`space-y-2 rounded-lg border px-3 py-2.5 ${
                          l.temCritico
                            ? "border-destructive/40 bg-destructive/5"
                            : "border-amber-500/30 bg-amber-500/5"
                        }`}
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <p className="text-sm font-medium">
                            {l.info?.produtoLabel ?? `Item ${index + 1}`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Qtd. {numero(l.quantidade)} × {moeda(l.vlrUnitario)} ={" "}
                            {moeda(l.quantidade * l.vlrUnitario)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>Preço de tabela: {moeda(l.vlrTabela)}</span>
                          <span>Desconto: {percentual(l.desconto)}</span>
                          <span>Estoque: {numero(l.info?.saldoEstoque)}</span>
                          <span>Regra: {regraDescontoLabel(l.regra)}</span>
                        </div>
                        <ul className="space-y-1.5">
                          {l.advertencias.map((a) => (
                            <li key={a.titulo} className="flex items-start gap-2 text-sm">
                              <TriangleAlert
                                className={`mt-0.5 size-3.5 shrink-0 ${
                                  a.nivel === "critico" ? "text-destructive" : "text-amber-500"
                                }`}
                              />
                              <span>
                                <span
                                  className={`font-medium ${
                                    a.nivel === "critico"
                                      ? "text-destructive"
                                      : "text-amber-700 dark:text-amber-400"
                                  }`}
                                >
                                  {a.titulo}
                                </span>{" "}
                                — {a.detalhe}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ),
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
              disabled={gerandoPdf || travadoPorDesconto}
              title={
                travadoPorDesconto
                  ? "Desconto igual ou acima do máximo da regra — autorize antes de gerar o PDF"
                  : undefined
              }
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
                onClick={form.handleSubmit((v) => salvar(v, false), avisarInvalido)}
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
