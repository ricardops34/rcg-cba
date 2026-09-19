"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ClienteCamposConfig } from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  User,
  Mail,
  MapPin,
  Briefcase,
  Lock,
  Save,
  RotateCcw,
  SlidersHorizontal,
  CheckCircle2,
  LockKeyhole,
} from "lucide-react";

interface CampoItem {
  campo: string;
  label: string;
  descricao?: string;
}

interface GrupoCampos {
  legenda: string;
  descricao: string;
  icone: React.ComponentType<{ className?: string }>;
  campos: CampoItem[];
}

const GRUPOS: GrupoCampos[] = [
  {
    legenda: "Identificação",
    descricao: "Dados cadastrais principais e documentos de identificação",
    icone: User,
    campos: [
      { campo: "tipoPessoa", label: "Tipo de pessoa", descricao: "Física ou Jurídica" },
      { campo: "codigoErp", label: "Código ERP", descricao: "Identificador no ERP externo" },
      { campo: "cnpjCpf", label: "CNPJ / CPF", descricao: "Documento principal do cliente" },
      { campo: "razaoSocial", label: "Razão social / Nome", descricao: "Nome legal cadastrado" },
      { campo: "nomeFantasia", label: "Nome fantasia", descricao: "Nome comercial de exibição" },
      { campo: "inscricaoEstadual", label: "Inscrição estadual", descricao: "Registro de ICMS estadual" },
      { campo: "inscricaoMunicipal", label: "Inscrição municipal", descricao: "Registro na prefeitura" },
      { campo: "contribuinteIcms", label: "Contribuinte ICMS", descricao: "Indicador de tributação" },
      { campo: "rg", label: "RG", descricao: "Registro geral (Pessoa Física)" },
      { campo: "dataNascimento", label: "Data de nascimento", descricao: "Data de nascimento / fundação" },
      { campo: "cnaes", label: "Ramo de atividade (CNAE)", descricao: "Códigos CNAE vinculados" },
    ],
  },
  {
    legenda: "Contato",
    descricao: "Canais de comunicação e pessoas de contato direto",
    icone: Mail,
    campos: [
      { campo: "contato", label: "Pessoa de contato", descricao: "Nome do responsável de contato" },
      { campo: "email", label: "E-mail principal", descricao: "Endereço eletrônico corporativo" },
      { campo: "telefone", label: "Telefone fixo", descricao: "Telefone de contato comercial" },
      { campo: "telefone2", label: "Telefone secundário", descricao: "Linha alternativa de contato" },
      { campo: "celular", label: "Celular / WhatsApp", descricao: "Contato móvel direto" },
      { campo: "site", label: "Website", descricao: "Endereço da página corporativa" },
    ],
  },
  {
    legenda: "Endereço",
    descricao: "Localização geográfica e endereço de entrega/faturamento",
    icone: MapPin,
    campos: [
      { campo: "endereco", label: "Endereço logradouro", descricao: "Rua, avenida ou servidão" },
      { campo: "complemento", label: "Complemento", descricao: "Sala, bloco ou referência" },
      { campo: "bairro", label: "Bairro", descricao: "Bairro do estabelecimento" },
      { campo: "municipio", label: "Município", descricao: "Cidade onde reside/sedia" },
      { campo: "uf", label: "Estado (UF)", descricao: "Unidade federativa" },
      { campo: "cep", label: "CEP", descricao: "Código de endereçamento postal" },
      { campo: "latitude", label: "Latitude", descricao: "Coordenada geográfica de latitude" },
      { campo: "longitude", label: "Longitude", descricao: "Coordenada geográfica de longitude" },
    ],
  },
  {
    legenda: "Comercial",
    descricao: "Vínculos de vendas, regras de preço e políticas de crédito",
    icone: Briefcase,
    campos: [
      { campo: "vendedorId", label: "Vendedor responsável", descricao: "Vendedor atribuído ao cliente" },
      { campo: "tabelaPrecoId", label: "Tabela de preço", descricao: "Tabela de preços padrão" },
      { campo: "carteira", label: "Cliente de carteira", descricao: "Indicador de carteira exclusiva" },
      { campo: "limiteCredito", label: "Limite de crédito", descricao: "Valor máximo concedido a prazo" },
      { campo: "vencimentoLimite", label: "Vencimento do limite", descricao: "Data limite de vigência do crédito" },
      { campo: "observacao", label: "Observações comerciais", descricao: "Notas internas sobre o cliente" },
      { campo: "ativo", label: "Status do cadastro (Ativo)", descricao: "Status de permissão de uso" },
    ],
  },
  {
    legenda: "Bloqueio",
    descricao: "Restrições de atendimento e histórico de reativações",
    icone: Lock,
    campos: [
      { campo: "dataBloqueio", label: "Data de bloqueio", descricao: "Data da aplicação do bloqueio" },
      { campo: "observacaoBloqueio", label: "Motivo do bloqueio", descricao: "Justificativa da restrição" },
      { campo: "dataReativacao", label: "Data de reativação", descricao: "Data da última liberação" },
      { campo: "observacaoReativacao", label: "Observação de reativação", descricao: "Histórico de liberações" },
    ],
  },
];

export default function ClientesConfigPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["clientes-config"],
    queryFn: () => apiFetch<ClienteCamposConfig>("/clientes-config/campos"),
  });

  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const config: ClienteCamposConfig = { ...data, ...overrides };

  const update = useMutation({
    mutationFn: (campos: { campo: string; editavel: boolean }[]) =>
      apiFetch<ClienteCamposConfig>("/clientes-config/campos", {
        method: "PATCH",
        body: { campos },
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["clientes-config"], data);
      setOverrides({});
      toast.success("Configuração de campos atualizada com sucesso");
    },
  });

  const handleSave = async () => {
    const campos = Object.entries(config).map(([campo, editavel]) => ({ campo, editavel }));
    try {
      await update.mutateAsync(campos);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar configuração");
    }
  };

  const handleToggleGroup = (grupo: GrupoCampos, targetState: boolean) => {
    setOverrides((prev) => {
      const next = { ...prev };
      for (const { campo } of grupo.campos) {
        next[campo] = targetState;
      }
      return next;
    });
  };

  const handleReset = () => {
    setOverrides({});
  };

  const totalCampos = GRUPOS.reduce((acc, g) => acc + g.campos.length, 0);
  const totalEditaveis = GRUPOS.reduce(
    (acc, g) => acc + g.campos.filter((c) => (config[c.campo] ?? true) === true).length,
    0
  );
  const totalBloqueados = totalCampos - totalEditaveis;
  const hasChanges = Object.keys(overrides).length > 0;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-1/3" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Campos do Cliente</h1>
          <p className="text-sm text-muted-foreground">
            Configure a permissão de edição dos campos no cadastro de clientes na opção &quot;Alterar Cliente&quot;.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Button variant="outline" size="sm" onClick={handleReset} disabled={update.isPending}>
              <RotateCcw className="mr-1.5 h-4 w-4 text-muted-foreground" />
              Desfazer alterações
            </Button>
          )}
          <Button onClick={handleSave} disabled={update.isPending} size="sm">
            <Save className="mr-1.5 h-4 w-4" />
            {update.isPending ? "Salvando..." : "Salvar alterações"}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Total de Campos
              </p>
              <p className="text-2xl font-bold mt-1">{totalCampos}</p>
            </div>
            <div className="rounded-full bg-primary/10 p-3 text-primary">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Campos Editáveis
              </p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {totalEditaveis}
                </p>
                <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs">
                  Permitidos
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
                Somente Leitura
              </p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {totalBloqueados}
                </p>
                <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs">
                  Protegidos
                </Badge>
              </div>
            </div>
            <div className="rounded-full bg-amber-500/10 p-3 text-amber-600 dark:text-amber-400">
              <LockKeyhole className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Field Groups Grid */}
      <div className="space-y-6">
        {GRUPOS.map((grupo) => {
          const Icone = grupo.icone;
          const editaveisNoGrupo = grupo.campos.filter(
            (c) => (config[c.campo] ?? true) === true
          ).length;
          const todosEditaveis = editaveisNoGrupo === grupo.campos.length;

          return (
            <Card key={grupo.legenda} className="overflow-hidden">
              <CardHeader className="bg-muted/30 pb-3 border-b">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="rounded-lg bg-primary/10 p-2 text-primary">
                      <Icone className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{grupo.legenda}</CardTitle>
                      <CardDescription className="text-xs mt-0.5">
                        {grupo.descricao}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="font-mono text-xs">
                      {editaveisNoGrupo} de {grupo.campos.length} editáveis
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => handleToggleGroup(grupo, !todosEditaveis)}
                    >
                      {todosEditaveis ? "Bloquear grupo" : "Permitir todos"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {grupo.campos.map(({ campo, label, descricao }) => {
                    const isEditable = config[campo] ?? true;
                    return (
                      <div
                        key={campo}
                        className={`flex items-start justify-between rounded-lg border p-3.5 transition-colors ${
                          isEditable
                            ? "bg-card hover:border-primary/50"
                            : "bg-muted/40 border-dashed"
                        }`}
                      >
                        <div className="space-y-0.5 pr-2">
                          <label
                            htmlFor={`switch-${campo}`}
                            className="text-sm font-medium leading-none cursor-pointer"
                          >
                            {label}
                          </label>
                          {descricao && (
                            <p className="text-xs text-muted-foreground">{descricao}</p>
                          )}
                          <div className="pt-1">
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 ${
                                isEditable
                                  ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5"
                                  : "border-muted-foreground/30 text-muted-foreground bg-muted"
                              }`}
                            >
                              {isEditable ? "Editável" : "Somente Leitura"}
                            </Badge>
                          </div>
                        </div>
                        <Switch
                          id={`switch-${campo}`}
                          checked={isEditable}
                          onCheckedChange={(v) =>
                            setOverrides((prev) => ({ ...prev, [campo]: v === true }))
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Floating Save Bar on Mobile/Bottom */}
      {hasChanges && (
        <div className="sticky bottom-4 z-10 rounded-xl border bg-background/95 backdrop-blur p-4 shadow-lg flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-2">
            <Badge variant="default" className="bg-amber-500 text-amber-950 font-medium">
              Alterações pendentes
            </Badge>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Lembre-se de salvar para aplicar as novas permissões de campo.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleReset}>
              Desfazer
            </Button>
            <Button size="sm" onClick={handleSave} disabled={update.isPending}>
              <Save className="mr-1.5 h-4 w-4" />
              Salvar agora
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

