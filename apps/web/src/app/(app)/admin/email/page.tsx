"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  EMAIL_MODELOS_DISPONIVEIS,
  EMAIL_MODELOS_PADRAO,
  EMAIL_TAGS_CATALOGO,
  type CurrentUser,
  type EmailConfiguracao,
  type EmailConfiguracaoUpdate,
  type EmailModelosConfiguracao,
  type EmailModelosUpdate,
  type EmailModeloTipo,
  type EmailTagDef,
  type EmailTesteResultado,
  type Empresa,
} from "@plataforma/contracts";
import { ApiError, apiFetch, apiUpload, assetUrl } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Copy,
  Eye,
  FileText,
  ImageIcon,
  Loader2,
  Mail,
  Palette,
  Receipt,
  RotateCcw,
  Send,
  Server,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";

type FormSMTP = Omit<EmailConfiguracaoUpdate, "senha" | "porta"> & {
  senha: string;
  porta: string;
};

interface EmpresaVisualEmail {
  id?: string;
  nomeFantasia: string;
  razaoSocial?: string | null;
  cnpj?: string | null;
  endereco?: string | null;
  municipio?: string | null;
  uf?: string | null;
  telefone?: string | null;
  email?: string | null;
  site?: string | null;
  logoUrl?: string | null;
  bannerCor?: string | null;
}

const FUNCIONALIDADES: Array<{
  chave: keyof FormSMTP;
  rotulo: string;
  detalhe: string;
}> = [
  {
    chave: "documentos",
    rotulo: "DANFE e XML",
    detalhe: "2ª via da nota fiscal, na Posição do Cliente e em Notas de Saída.",
  },
  {
    chave: "boleto",
    rotulo: "Boleto",
    detalhe: "2ª via do boleto bancário, atualizado ou original.",
  },
  {
    chave: "cobranca",
    rotulo: "Cobrança",
    detalhe: "Títulos vencidos com boletos e DANFEs anexados.",
  },
  {
    chave: "senhaProvisoria",
    rotulo: "Senha provisória",
    detalhe: "Ao criar o acesso do vendedor ou reenviar a senha.",
  },
];

const NOMES_MODELOS: Record<EmailModeloTipo, { titulo: string; icone: React.ElementType; badge: string }> = {
  cobranca: { titulo: "Cobrança de Títulos em Atraso", icone: ShieldAlert, badge: "Cobrança Comercial" },
  nota: { titulo: "2ª Via de NF-e (DANFE e XML)", icone: FileText, badge: "Documento Fiscal" },
  boleto: { titulo: "2ª Via de Boleto Bancário", icone: Receipt, badge: "Cobrança Bancária" },
};

export default function EmailPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const empresaAtivaId = user?.empresaAtivaId;

  // Busca dados completos da empresa para obter o logoUrl atualizado
  const { data: empresaCompleta } = useQuery({
    queryKey: ["empresas", empresaAtivaId],
    queryFn: () => (empresaAtivaId ? apiFetch<Empresa>(`/empresas/${empresaAtivaId}`) : null),
    enabled: !!empresaAtivaId,
  });

  const empresaAtiva = useMemo<EmpresaVisualEmail | null>(() => {
    if (empresaCompleta) {
      const enderecoFormatado = [
        empresaCompleta.endereco,
        empresaCompleta.bairro,
        empresaCompleta.municipio && empresaCompleta.uf
          ? `${empresaCompleta.municipio}/${empresaCompleta.uf}`
          : empresaCompleta.municipio || empresaCompleta.uf,
      ]
        .filter(Boolean)
        .join(" — ");

      return {
        id: empresaCompleta.id,
        nomeFantasia: empresaCompleta.nomeFantasia,
        razaoSocial: empresaCompleta.razaoSocial,
        cnpj: empresaCompleta.cnpj,
        endereco: enderecoFormatado || empresaCompleta.endereco,
        municipio: empresaCompleta.municipio,
        uf: empresaCompleta.uf,
        telefone: empresaCompleta.telefone,
        email: empresaCompleta.email,
        site: empresaCompleta.site,
        logoUrl: empresaCompleta.logoUrl,
        bannerCor: empresaCompleta.bannerCor,
      };
    }
    if (!user) return null;
    const emp = user.empresas.find((e) => e.empresaId === user.empresaAtivaId);
    if (!emp) return null;
    return {
      id: emp.empresaId,
      nomeFantasia: emp.nomeFantasia,
      logoUrl: emp.logoUrl,
      bannerCor: emp.bannerCor,
    };
  }, [empresaCompleta, user]);

  const { data: cfg, isLoading: loadingCfg } = useQuery({
    queryKey: ["email", "configuracao"],
    queryFn: () => apiFetch<EmailConfiguracao>("/email/configuracao"),
  });

  const { data: modelos, isLoading: loadingModelos } = useQuery({
    queryKey: ["email", "modelos"],
    queryFn: () => apiFetch<EmailModelosConfiguracao>("/email/modelos"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">E-mail</h1>
        <p className="text-sm text-muted-foreground">
          Servidor de envio (SMTP), modelos de mensagens com live preview e identidade visual da empresa.
        </p>
      </div>

      <Tabs defaultValue="smtp" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="smtp" className="flex items-center gap-2">
            <Server className="size-4" />
            <span>Servidor & SMTP</span>
          </TabsTrigger>
          <TabsTrigger value="modelos" className="flex items-center gap-2">
            <Mail className="size-4" />
            <span>Modelos de E-mail</span>
          </TabsTrigger>
          <TabsTrigger value="identidade" className="flex items-center gap-2">
            <Palette className="size-4" />
            <span>Identidade Visual</span>
          </TabsTrigger>
        </TabsList>

        {/* 1. ABA SERVIDOR & SMTP */}
        <TabsContent value="smtp">
          {loadingCfg || !cfg ? (
            <Card>
              <CardContent>
                <Skeleton className="h-64 w-full" />
              </CardContent>
            </Card>
          ) : (
            <FormularioEmail key={JSON.stringify(cfg)} cfg={cfg} queryClient={queryClient} />
          )}
        </TabsContent>

        {/* 2. ABA MODELOS DE E-MAIL */}
        <TabsContent value="modelos">
          {loadingModelos || !modelos ? (
            <Card>
              <CardContent>
                <Skeleton className="h-64 w-full" />
              </CardContent>
            </Card>
          ) : (
            <FormularioModelos
              key={JSON.stringify(modelos)}
              modelos={modelos}
              empresaAtiva={empresaAtiva}
              queryClient={queryClient}
            />
          )}
        </TabsContent>

        {/* 3. ABA IDENTIDADE VISUAL */}
        <TabsContent value="identidade">
          {loadingModelos || !modelos ? (
            <Card>
              <CardContent>
                <Skeleton className="h-64 w-full" />
              </CardContent>
            </Card>
          ) : (
            <FormularioIdentidade
              key={JSON.stringify(modelos)}
              modelos={modelos}
              empresaAtiva={empresaAtiva}
              queryClient={queryClient}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================================
// 1. FORMULÁRIO SMTP
// ============================================================================

function FormularioEmail({
  cfg,
  queryClient,
}: {
  cfg: EmailConfiguracao;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [form, setForm] = useState<FormSMTP>(() => ({
    ativo: cfg.ativo,
    host: cfg.host,
    porta: cfg.porta ? String(cfg.porta) : "",
    seguro: cfg.seguro,
    usuario: cfg.usuario,
    senha: "",
    remetente: cfg.remetente,
    documentos: cfg.documentos,
    boleto: cfg.boleto,
    cobranca: cfg.cobranca,
    senhaProvisoria: cfg.senhaProvisoria,
  }));
  const muda = <K extends keyof FormSMTP>(chave: K, valor: FormSMTP[K]) =>
    setForm((f) => ({ ...f, [chave]: valor }));

  const salvar = useMutation({
    mutationFn: () =>
      apiFetch<EmailConfiguracao>("/email/configuracao", {
        method: "PUT",
        body: {
          ...form,
          porta: form.porta ? Number(form.porta) : null,
          senha: form.senha || undefined,
        },
      }),
    onSuccess: (atualizado) => {
      queryClient.setQueryData(["email", "configuracao"], atualizado);
      void queryClient.invalidateQueries({ queryKey: ["email", "disponivel"] });
      toast.success("Configuração de e-mail salva com sucesso");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar"),
  });

  const testar = useMutation({
    mutationFn: () => apiFetch<EmailTesteResultado>("/email/teste", { method: "POST" }),
    onSuccess: (r) => toast.success(`E-mail de teste enviado para ${r.enviadoPara}`),
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Falha no envio de teste", {
        duration: 15_000,
      }),
  });

  const avisoPorta =
    form.porta === "587" && form.seguro
      ? "Porta 587 trabalha com SSL/TLS direto desligado (a criptografia entra depois via STARTTLS)."
      : form.porta === "465" && !form.seguro
        ? "Porta 465 pede SSL/TLS direto ligado."
        : null;

  return (
    <Card>
      <CardContent className="pt-6">
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            salvar.mutate();
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">Status do Envio</p>
            <Badge variant={cfg.habilitado ? "default" : "secondary"}>
              {cfg.habilitado ? "Habilitado" : "Desabilitado"}
            </Badge>
            {cfg.usaServidorDoAmbiente && (
              <span className="text-xs text-muted-foreground">usando servidor padrão da plataforma</span>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div>
              <FieldLabel>Habilitar envio de e-mails</FieldLabel>
              <FieldDescription>
                Liga o envio de e-mails nesta empresa (EMAIL_ATIVO). As ações só aparecem com o envio ligado.
              </FieldDescription>
            </div>
            <Switch checked={form.ativo} onCheckedChange={(v) => muda("ativo", v)} />
          </div>

          <div className="space-y-3">
            <FieldLabel>Servidor SMTP</FieldLabel>
            <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
              <div className="space-y-1">
                <FieldLabel htmlFor="smtp-host" className="text-xs">Servidor</FieldLabel>
                <Input
                  id="smtp-host"
                  value={form.host}
                  placeholder="mail.suaempresa.com.br — vazio usa o padrão"
                  onChange={(e) => muda("host", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="smtp-porta" className="text-xs">Porta</FieldLabel>
                <Input
                  id="smtp-porta"
                  inputMode="numeric"
                  value={form.porta}
                  placeholder="587"
                  onChange={(e) => muda("porta", e.target.value.replace(/\D/g, ""))}
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div>
                <FieldLabel>SSL/TLS direto</FieldLabel>
                <FieldDescription>Ligado para porta 465; desligado para porta 587.</FieldDescription>
              </div>
              <Switch checked={form.seguro} onCheckedChange={(v) => muda("seguro", v)} />
            </div>
            {avisoPorta && <p className="text-xs text-amber-600 dark:text-amber-400">{avisoPorta}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <FieldLabel htmlFor="smtp-usuario" className="text-xs">Usuário</FieldLabel>
                <Input
                  id="smtp-usuario"
                  autoComplete="off"
                  value={form.usuario}
                  onChange={(e) => muda("usuario", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="smtp-senha" className="text-xs">Senha</FieldLabel>
                <Input
                  id="smtp-senha"
                  type="password"
                  autoComplete="new-password"
                  value={form.senha}
                  placeholder={cfg.senhaPreenchida ? "•••••••• (digite para trocar)" : ""}
                  onChange={(e) => muda("senha", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <FieldLabel htmlFor="smtp-remetente" className="text-xs">Remetente</FieldLabel>
              <Input
                id="smtp-remetente"
                value={form.remetente}
                placeholder="Empresa <naoresponda@suaempresa.com.br>"
                onChange={(e) => muda("remetente", e.target.value)}
              />
              <FieldDescription>
                Endereço exibido no campo 'De' ao cliente.
              </FieldDescription>
            </div>
          </div>

          <div className="space-y-2">
            <FieldLabel>Funcionalidades Liberadas</FieldLabel>
            <div className="grid gap-2 sm:grid-cols-2">
              {FUNCIONALIDADES.map((f) => (
                <label
                  key={f.chave}
                  className="flex items-start justify-between gap-3 rounded-lg border p-3 cursor-pointer"
                >
                  <span>
                    <span className="block text-sm font-medium">{f.rotulo}</span>
                    <span className="block text-xs text-muted-foreground">{f.detalhe}</span>
                  </span>
                  <Switch
                    checked={Boolean(form[f.chave])}
                    onCheckedChange={(v) => muda(f.chave, v as never)}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={testar.isPending}
              onClick={() => testar.mutate()}
            >
              {testar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Testar Conexão
            </Button>
            <Button type="submit" disabled={salvar.isPending}>
              {salvar.isPending && <Loader2 className="size-4 animate-spin" />}
              Salvar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// 2. FORMULÁRIO DE MODELOS DE E-MAIL COM LIVE PREVIEW
// ============================================================================

function FormularioModelos({
  modelos,
  empresaAtiva,
  queryClient,
}: {
  modelos: EmailModelosConfiguracao;
  empresaAtiva: EmpresaVisualEmail | null;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [tipoAtivo, setTipoAtivo] = useState<EmailModeloTipo>("cobranca");
  const [campoFocado, setCampoFocado] = useState<"assunto" | "texto">("texto");

  const [form, setForm] = useState<{
    cobrancaAssunto: string;
    cobrancaTexto: string;
    notaAssunto: string;
    notaTexto: string;
    boletoAssunto: string;
    boletoTexto: string;
  }>(() => ({
    cobrancaAssunto: modelos.cobrancaAssunto,
    cobrancaTexto: modelos.cobrancaTexto,
    notaAssunto: modelos.notaAssunto,
    notaTexto: modelos.notaTexto,
    boletoAssunto: modelos.boletoAssunto,
    boletoTexto: modelos.boletoTexto,
  }));

  const tags = EMAIL_TAGS_CATALOGO[tipoAtivo];

  const assuntoAtual =
    tipoAtivo === "cobranca"
      ? form.cobrancaAssunto
      : tipoAtivo === "nota"
        ? form.notaAssunto
        : form.boletoAssunto;

  const textoAtual =
    tipoAtivo === "cobranca"
      ? form.cobrancaTexto
      : tipoAtivo === "nota"
        ? form.notaTexto
        : form.boletoTexto;

  const padraoAssunto =
    tipoAtivo === "cobranca"
      ? EMAIL_MODELOS_PADRAO.cobrancaAssunto
      : tipoAtivo === "nota"
        ? EMAIL_MODELOS_PADRAO.notaAssunto
        : EMAIL_MODELOS_PADRAO.boletoAssunto;

  const padraoTexto =
    tipoAtivo === "cobranca"
      ? EMAIL_MODELOS_PADRAO.cobrancaTexto
      : tipoAtivo === "nota"
        ? EMAIL_MODELOS_PADRAO.notaTexto
        : EMAIL_MODELOS_PADRAO.boletoTexto;

  const isPersonalizado = assuntoAtual !== padraoAssunto || textoAtual !== padraoTexto;

  const mudaAssunto = (v: string) => {
    if (tipoAtivo === "cobranca") setForm((f) => ({ ...f, cobrancaAssunto: v }));
    else if (tipoAtivo === "nota") setForm((f) => ({ ...f, notaAssunto: v }));
    else setForm((f) => ({ ...f, boletoAssunto: v }));
  };

  const mudaTexto = (v: string) => {
    if (tipoAtivo === "cobranca") setForm((f) => ({ ...f, cobrancaTexto: v }));
    else if (tipoAtivo === "nota") setForm((f) => ({ ...f, notaTexto: v }));
    else setForm((f) => ({ ...f, boletoTexto: v }));
  };

  const inserirTag = (tag: string) => {
    if (campoFocado === "assunto") {
      mudaAssunto(assuntoAtual ? `${assuntoAtual} ${tag}` : tag);
    } else {
      mudaTexto(textoAtual ? `${textoAtual} ${tag}` : tag);
    }
    toast.info(`Tag ${tag} inserida`);
  };

  const copiarPadrao = () => {
    mudaAssunto(padraoAssunto);
    mudaTexto(padraoTexto);
    toast.success("Conteúdo padrão do sistema copiado para edição");
  };

  const salvar = useMutation({
    mutationFn: () =>
      apiFetch<EmailModelosConfiguracao>("/email/modelos", {
        method: "PUT",
        body: form,
      }),
    onSuccess: (atualizado) => {
      queryClient.setQueryData(["email", "modelos"], atualizado);
      toast.success("Modelos de e-mail salvos com sucesso");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Falha ao salvar modelos"),
  });

  const restaurar = useMutation({
    mutationFn: () =>
      apiFetch<EmailModelosConfiguracao>("/email/modelos/restaurar", {
        method: "POST",
        body: { tipo: tipoAtivo },
      }),
    onSuccess: (atualizado) => {
      queryClient.setQueryData(["email", "modelos"], atualizado);
      if (tipoAtivo === "cobranca") {
        setForm((f) => ({
          ...f,
          cobrancaAssunto: atualizado.cobrancaAssunto,
          cobrancaTexto: atualizado.cobrancaTexto,
        }));
      } else if (tipoAtivo === "nota") {
        setForm((f) => ({
          ...f,
          notaAssunto: atualizado.notaAssunto,
          notaTexto: atualizado.notaTexto,
        }));
      } else {
        setForm((f) => ({
          ...f,
          boletoAssunto: atualizado.boletoAssunto,
          boletoTexto: atualizado.boletoTexto,
        }));
      }
      toast.success(`Modelo de ${NOMES_MODELOS[tipoAtivo].titulo} restaurado para o padrão`);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Falha ao restaurar padrão"),
  });

  const testarModelo = useMutation({
    mutationFn: () =>
      apiFetch<EmailTesteResultado>("/email/modelos/teste", {
        method: "POST",
        body: { tipo: tipoAtivo },
      }),
    onSuccess: (r) => toast.success(`E-mail com o modelo enviado para ${r.enviadoPara}`),
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Falha ao disparar teste", {
        duration: 15_000,
      }),
  });

  return (
    <div className="space-y-4">
      {/* Seletor de Modelo */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {EMAIL_MODELOS_DISPONIVEIS.map((t) => {
            const item = NOMES_MODELOS[t];
            const Icon = item.icone;
            const ativo = tipoAtivo === t;
            return (
              <Button
                key={t}
                type="button"
                size="sm"
                variant={ativo ? "default" : "ghost"}
                className="gap-2 text-xs"
                onClick={() => setTipoAtivo(t)}
              >
                <Icon className="size-3.5" />
                <span>{item.titulo}</span>
              </Button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isPersonalizado ? "default" : "outline"} className="text-[11px]">
            {isPersonalizado ? "Personalizado da Empresa" : "Padrão do Sistema (Read-only)"}
          </Badge>
        </div>
      </div>

      {/* Grid: Editor à Esquerda e Live Preview à Direita */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* COLUNA ESQUERDA: EDITOR */}
        <Card className="h-fit">
          <CardContent className="space-y-4 pt-6">
            <div>
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="modelo-assunto">Assunto do E-mail</FieldLabel>
                <span className="text-[11px] text-muted-foreground">Suporta tags dinâmicas</span>
              </div>
              <Input
                id="modelo-assunto"
                value={assuntoAtual}
                placeholder="Ex.: Aviso de cobrança — {{empresa.nomeFantasia}}"
                onFocus={() => setCampoFocado("assunto")}
                onChange={(e) => mudaAssunto(e.target.value)}
              />
            </div>

            {/* Catálogo de Tags Clicáveis */}
            <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold flex items-center gap-1.5 text-foreground">
                  <Sparkles className="size-3.5 text-amber-500" />
                  Tags Disponíveis (clique para inserir)
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Inserindo em: <strong className="text-foreground uppercase">{campoFocado}</strong>
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t: EmailTagDef) => (
                  <button
                    key={t.tag}
                    type="button"
                    title={`${t.descricao} (Ex.: ${t.exemplo})`}
                    onClick={() => inserirTag(t.tag)}
                    className="inline-flex items-center gap-1 rounded border bg-background px-2 py-0.5 text-[11px] font-mono font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    <span>{t.tag}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="modelo-texto">Mensagem de Abertura</FieldLabel>
                <span className="text-[11px] text-muted-foreground">
                  O miolo com as tabelas/cards fiscais é formatado automaticamente abaixo deste texto
                </span>
              </div>
              <Textarea
                id="modelo-texto"
                rows={5}
                value={textoAtual}
                placeholder="Texto introdutório enviado antes da tabela..."
                onFocus={() => setCampoFocado("texto")}
                onChange={(e) => mudaTexto(e.target.value)}
              />
            </div>

            {/* Ações do Modelo */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copiarPadrao}
                  title="Copia a redação padrão do sistema para você editar"
                >
                  <Copy className="size-3.5 mr-1" />
                  Copiar Padrão
                </Button>
                {isPersonalizado && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={restaurar.isPending}
                    onClick={() => restaurar.mutate()}
                    title="Remove as customizações e volta ao padrão original"
                  >
                    {restaurar.isPending ? (
                      <Loader2 className="size-3.5 animate-spin mr-1" />
                    ) : (
                      <RotateCcw className="size-3.5 mr-1 text-destructive" />
                    )}
                    Restaurar Padrão
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={testarModelo.isPending}
                  onClick={() => testarModelo.mutate()}
                  title="Dispara um e-mail de teste com este modelo para a sua caixa"
                >
                  {testarModelo.isPending ? (
                    <Loader2 className="size-3.5 animate-spin mr-1" />
                  ) : (
                    <Send className="size-3.5 mr-1" />
                  )}
                  Disparar Teste
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={salvar.isPending}
                  onClick={() => salvar.mutate()}
                >
                  {salvar.isPending && <Loader2 className="size-3.5 animate-spin mr-1" />}
                  Salvar Modelos
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* COLUNA DIREITA: LIVE PREVIEW */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
            <span className="font-semibold flex items-center gap-1.5">
              <Eye className="size-3.5 text-blue-500" />
              Pré-visualização em Tempo Real (Outlook / Gmail)
            </span>
            <span className="text-[11px]">Dados simulados</span>
          </div>

          <PreviewEmailCard
            tipo={tipoAtivo}
            assunto={assuntoAtual}
            texto={textoAtual}
            modelos={modelos}
            empresaAtiva={empresaAtiva}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 3. FORMULÁRIO DE IDENTIDADE VISUAL
// ============================================================================

function FormularioIdentidade({
  modelos,
  empresaAtiva,
  queryClient,
}: {
  modelos: EmailModelosConfiguracao;
  empresaAtiva: EmpresaVisualEmail | null;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const setUser = useAuthStore((s) => s.setUser);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !empresaAtiva?.id) return;
    setUploadingLogo(true);
    try {
      await apiUpload<Empresa>(`/empresas/${empresaAtiva.id}/logo`, file);
      const me = await apiFetch<CurrentUser>("/auth/me");
      setUser(me);
      await queryClient.invalidateQueries({ queryKey: ["empresas", empresaAtiva.id] });
      toast.success("Logo da empresa atualizado com sucesso");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao enviar logo");
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleLogoRemover = async () => {
    if (!empresaAtiva?.id) return;
    setUploadingLogo(true);
    try {
      await apiFetch<Empresa>(`/empresas/${empresaAtiva.id}/logo`, { method: "DELETE" });
      const me = await apiFetch<CurrentUser>("/auth/me");
      setUser(me);
      await queryClient.invalidateQueries({ queryKey: ["empresas", empresaAtiva.id] });
      toast.success("Logo da empresa removido");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao remover logo");
    } finally {
      setUploadingLogo(false);
    }
  };

  const [corCabecalho, setCorCabecalho] = useState<string>(
    modelos.corCabecalho || empresaAtiva?.bannerCor || "#0f172a",
  );
  const [replyToUsuario, setReplyToUsuario] = useState<boolean>(modelos.replyToUsuario);
  const [incluirAssinaturaUsuario, setIncluirAssinaturaUsuario] = useState<boolean>(
    modelos.incluirAssinaturaUsuario,
  );
  const [incluirTelefoneUsuario, setIncluirTelefoneUsuario] = useState<boolean>(
    modelos.incluirTelefoneUsuario ?? true,
  );
  const [incluirEmailUsuario, setIncluirEmailUsuario] = useState<boolean>(
    modelos.incluirEmailUsuario ?? true,
  );

  const salvar = useMutation({
    mutationFn: () =>
      apiFetch<EmailModelosConfiguracao>("/email/modelos", {
        method: "PUT",
        body: {
          corCabecalho: corCabecalho || null,
          replyToUsuario,
          incluirAssinaturaUsuario,
          incluirTelefoneUsuario,
          incluirEmailUsuario,
        },
      }),
    onSuccess: (atualizado) => {
      queryClient.setQueryData(["email", "modelos"], atualizado);
      toast.success("Configuração de identidade visual salva com sucesso");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Falha ao salvar"),
  });

  const PRESETS_CORES = ["#0f172a", "#1e40af", "#0284c7", "#064e3b", "#7c2d12", "#581c87"];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardContent className="space-y-6 pt-6">
          {/* Seção de Logo da Empresa */}
          <div className="space-y-3 pb-5 border-b">
            <div>
              <FieldLabel className="text-base font-semibold">Logo da Empresa</FieldLabel>
              <FieldDescription className="text-xs">
                O logotipo oficial é anexado como imagem inline (sem bloqueios no Outlook/Gmail) no topo de todos os e-mails disparados.
              </FieldDescription>
            </div>

            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={handleLogoUpload}
            />

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 rounded-xl border bg-muted/20">
              <div
                className="h-16 px-4 rounded-lg flex items-center justify-center border border-white/20 shadow-sm shrink-0 transition-colors"
                style={{ backgroundColor: corCabecalho || "#0f172a" }}
              >
                {empresaAtiva?.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={assetUrl(empresaAtiva.logoUrl) ?? ""}
                    alt="Logo da empresa"
                    className="max-h-12 max-w-[160px] object-contain drop-shadow"
                  />
                ) : (
                  <div className="flex items-center gap-1.5 text-white/70 text-xs font-semibold">
                    <ImageIcon className="size-5" />
                    <span>Sem logo cadastrado</span>
                  </div>
                )}
              </div>

              <div className="space-y-2 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploadingLogo || !empresaAtiva?.id}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    {uploadingLogo ? (
                      <Loader2 className="size-3.5 animate-spin mr-1.5" />
                    ) : (
                      <Upload className="size-3.5 mr-1.5" />
                    )}
                    {empresaAtiva?.logoUrl ? "Trocar logo da empresa" : "Enviar logo da empresa"}
                  </Button>

                  {empresaAtiva?.logoUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={uploadingLogo}
                      onClick={handleLogoRemover}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="size-3.5 mr-1" />
                      Remover
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Recomendado formato PNG transparente (até 2 MB). Atualizar aqui sincroniza tanto os e-mails quanto o sistema.
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <FieldLabel>Faixa de Cabeçalho da Marca</FieldLabel>
            <FieldDescription>
              Cor de fundo aplicada na barra superior dos e-mails onde o logo da empresa é emoldurado.
            </FieldDescription>

            <div className="flex items-center gap-3">
              <input
                type="color"
                value={corCabecalho}
                onChange={(e) => setCorCabecalho(e.target.value)}
                className="size-10 cursor-pointer rounded border border-border p-0.5 bg-background"
              />
              <Input
                value={corCabecalho}
                onChange={(e) => setCorCabecalho(e.target.value)}
                placeholder="#0f172a"
                className="w-36 font-mono"
              />
              <div
                className="h-9 px-3 rounded flex items-center text-xs font-semibold text-white shadow-sm"
                style={{ backgroundColor: corCabecalho }}
              >
                Amostra
              </div>
            </div>

            <div className="flex items-center gap-1.5 pt-1">
              <span className="text-xs text-muted-foreground mr-1">Paleta sugerida:</span>
              {PRESETS_CORES.map((cor) => (
                <button
                  key={cor}
                  type="button"
                  onClick={() => setCorCabecalho(cor)}
                  className="size-6 rounded-full border border-black/20 transition-transform hover:scale-110"
                  style={{ backgroundColor: cor }}
                />
              ))}
            </div>
          </div>

          <div className="space-y-3 border-t pt-4">
            <FieldLabel>Assinatura e Resposta do Operador</FieldLabel>

            <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div>
                <FieldLabel className="text-sm">Assinatura do Colaborador no Rodapé</FieldLabel>
                <FieldDescription className="text-xs">
                  Renderiza um cartão com o nome, cargo, WhatsApp e e-mail direto do atendente/vendedor que efetuou o envio.
                </FieldDescription>
              </div>
              <Switch
                checked={incluirAssinaturaUsuario}
                onCheckedChange={setIncluirAssinaturaUsuario}
              />
            </div>

            {incluirAssinaturaUsuario && (
              <div className="ml-4 space-y-2.5 border-l-2 border-primary/25 pl-4">
                <div className="flex items-start justify-between gap-4 rounded-lg border p-2.5 bg-muted/20">
                  <div>
                    <FieldLabel className="text-xs">Exibir WhatsApp / Telefone</FieldLabel>
                    <FieldDescription className="text-[11px]">
                      Mostra o número do WhatsApp/telefone do colaborador na assinatura.
                    </FieldDescription>
                  </div>
                  <Switch
                    checked={incluirTelefoneUsuario}
                    onCheckedChange={setIncluirTelefoneUsuario}
                  />
                </div>

                <div className="flex items-start justify-between gap-4 rounded-lg border p-2.5 bg-muted/20">
                  <div>
                    <FieldLabel className="text-xs">Exibir E-mail do Colaborador</FieldLabel>
                    <FieldDescription className="text-[11px]">
                      Mostra o endereço de e-mail do colaborador na assinatura.
                    </FieldDescription>
                  </div>
                  <Switch
                    checked={incluirEmailUsuario}
                    onCheckedChange={setIncluirEmailUsuario}
                  />
                </div>
              </div>
            )}

            <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div>
                <FieldLabel className="text-sm">Roteamento de Respostas (Reply-To)</FieldLabel>
                <FieldDescription className="text-xs">
                  Quando o cliente clicar no botão "Responder" no seu leitor de e-mail, a resposta vai diretamente para o colaborador em vez da caixa de envio do sistema.
                </FieldDescription>
              </div>
              <Switch checked={replyToUsuario} onCheckedChange={setReplyToUsuario} />
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t">
            <Button disabled={salvar.isPending} onClick={() => salvar.mutate()}>
              {salvar.isPending && <Loader2 className="size-4 animate-spin mr-1" />}
              Salvar Identidade
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Mini Preview de Identidade */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-muted-foreground px-1">
          Aparência do Topo e Assinatura com estas configurações
        </span>
        <PreviewEmailCard
          tipo="cobranca"
          assunto="Demonstração da Identidade Visual"
          texto="Este é um exemplo de como o cabeçalho e a sua assinatura aparecerão para os clientes."
          modelos={{
            ...modelos,
            corCabecalho,
            incluirAssinaturaUsuario,
            incluirTelefoneUsuario,
            incluirEmailUsuario,
            replyToUsuario,
          }}
          empresaAtiva={empresaAtiva}
        />
      </div>
    </div>
  );
}

// ============================================================================
// 4. COMPONENTE DE LIVE PREVIEW REALISTA
// ============================================================================

function PreviewEmailCard({
  tipo,
  assunto,
  texto,
  modelos,
  empresaAtiva,
}: {
  tipo: EmailModeloTipo;
  assunto: string;
  texto: string;
  modelos: EmailModelosConfiguracao;
  empresaAtiva: EmpresaVisualEmail | null;
}) {
  const nomeEmpresa = empresaAtiva?.nomeFantasia || "RCG DISTRIBUIDORA";
  const corTopo = modelos.corCabecalho || empresaAtiva?.bannerCor || "#0f172a";

  // Substitui tags com dados de simulação
  const substituiSimulacao = (str: string) => {
    return str
      .replace(/\{\{\s*cliente\.nome\s*\}\}/g, "MERCADO CENTRAL LTDA")
      .replace(/\{\{\s*cliente\.razaoSocial\s*\}\}/g, "MERCADO CENTRAL LTDA")
      .replace(/\{\{\s*cliente\.cnpj\s*\}\}/g, "03.715.067/0001-09")
      .replace(/\{\{\s*empresa\.nomeFantasia\s*\}\}/g, nomeEmpresa)
      .replace(/\{\{\s*empresa\.telefone\s*\}\}/g, "(67) 3382-7328")
      .replace(/\{\{\s*colaborador\.nome\s*\}\}/g, "Ricardo Patay")
      .replace(/\{\{\s*colaborador\.cargo\s*\}\}/g, "Departamento Comercial")
      .replace(/\{\{\s*colaborador\.telefone\s*\}\}/g, "(67) 99988-7766")
      .replace(/\{\{\s*nota\.numero\s*\}\}/g, "117179")
      .replace(/\{\{\s*nota\.chave\s*\}\}/g, "5026 0903 7150 6700 0109 5500 1000 1171 7917 6411 5312")
      .replace(/\{\{\s*boleto\.numero\s*\}\}/g, "000117179")
      .replace(/\{\{\s*boleto\.valor\s*\}\}/g, "R$ 450,00")
      .replace(/\{\{\s*boleto\.vencimento\s*\}\}/g, "15/10/2026")
      .replace(/\{\{\s*cobranca\.quantidade\s*\}\}/g, "2")
      .replace(/\{\{\s*cobranca\.total\s*\}\}/g, "R$ 694,70");
  };

  const assuntoRenderizado = substituiSimulacao(assunto);
  const textoRenderizado = substituiSimulacao(texto);

  return (
    <div className="rounded-xl border border-slate-300 dark:border-slate-800 bg-white text-slate-800 shadow-lg overflow-hidden text-xs">
      {/* Barra de título do e-mail do cliente */}
      <div className="border-b bg-slate-100 px-4 py-2.5 flex items-center justify-between text-slate-600">
        <div className="truncate font-semibold text-slate-900 text-xs">
          {assuntoRenderizado || "(Sem assunto definido)"}
        </div>
        <span className="text-[10px] text-slate-500 font-mono">naoresponda@rcgdist.com.br</span>
      </div>

      {/* Header Corporativo com Cor e Logo */}
      <div
        className="p-5 flex items-center justify-between transition-colors"
        style={{ backgroundColor: corTopo }}
      >
        <div className="flex items-center gap-3">
          {empresaAtiva?.logoUrl ? (
            <div className="max-h-12 flex items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={assetUrl(empresaAtiva.logoUrl) ?? ""}
                alt={nomeEmpresa}
                className="max-h-11 max-w-[220px] object-contain drop-shadow"
              />
            </div>
          ) : (
            <div className="px-3 py-1.5 rounded bg-white/10 backdrop-blur border border-white/20 flex items-center">
              <span className="font-extrabold text-base tracking-tight text-white flex items-center gap-1.5">
                {nomeEmpresa}
              </span>
            </div>
          )}
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-white/90 bg-white/15 px-2.5 py-1 rounded-full border border-white/20">
          {NOMES_MODELOS[tipo].badge}
        </span>
      </div>

      {/* Corpo da Mensagem */}
      <div className="p-6 space-y-4">
        <div>
          <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
            {nomeEmpresa}
          </p>
          <h2 className="text-sm font-bold text-slate-900 mt-0.5">
            Prezado(a) MERCADO CENTRAL LTDA,
          </h2>
        </div>

        <p className="text-slate-700 leading-relaxed text-xs">
          {textoRenderizado}
        </p>

        {/* Tabela ou Box Condicional do Tipo de Modelo */}
        {tipo === "cobranca" && (
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-slate-100 font-semibold text-slate-700 border-b">
                <tr>
                  <th className="p-2">Título</th>
                  <th className="p-2">Vencimento</th>
                  <th className="p-2 text-center">Atraso</th>
                  <th className="p-2 text-right">Saldo</th>
                  <th className="p-2">Boleto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="p-2 font-bold text-slate-900">000114826</td>
                  <td className="p-2 text-slate-600">02/06/2026</td>
                  <td className="p-2 text-center"><span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold text-[9px]">121 dias</span></td>
                  <td className="p-2 text-right font-bold text-slate-900">R$ 143,00</td>
                  <td className="p-2 text-emerald-600 font-medium">Em anexo</td>
                </tr>
                <tr>
                  <td className="p-2 font-bold text-slate-900">000117179</td>
                  <td className="p-2 text-slate-600">14/09/2026</td>
                  <td className="p-2 text-center"><span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[9px]">17 dias</span></td>
                  <td className="p-2 text-right font-bold text-slate-900">R$ 551,70</td>
                  <td className="p-2 text-emerald-600 font-medium">Em anexo</td>
                </tr>
              </tbody>
              <tfoot className="bg-slate-50 border-t font-bold">
                <tr>
                  <td colSpan={3} className="p-2 text-right text-slate-500 uppercase text-[10px]">Total:</td>
                  <td className="p-2 text-right text-slate-900">R$ 694,70</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {tipo === "nota" && (
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 text-xs">Nota Fiscal Eletrônica nº 117179</span>
              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">SEFAZ Autorizada</span>
            </div>
            <div className="text-[11px] text-slate-600 font-mono break-all bg-white p-2 rounded border">
              Chave: 5026 0903 7150 6700 0109 5500 1000 1171 7917 6411 5312
            </div>
            <div className="text-[10px] text-slate-500">
              Anexos inclusos: <code>danfe-117179.pdf</code> e <code>nfe-117179.xml</code>.
            </div>
          </div>
        )}

        {tipo === "boleto" && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1.5">
            <div className="flex justify-between text-xs font-bold text-slate-900">
              <span>Boleto do Título: 000117179</span>
              <span className="text-blue-700">R$ 450,00</span>
            </div>
            <div className="text-[11px] text-slate-600">
              Vencimento: <strong>15/10/2026</strong>
            </div>
            <div className="text-[10px] font-mono bg-white p-1.5 rounded border text-slate-700">
              Linha digitável: 00190.00009 01171.790004 00000.000171 1 98760000045000
            </div>
          </div>
        )}

        {/* Card de Assinatura do Colaborador */}
        {modelos.incluirAssinaturaUsuario && (
          <div className="pt-4 border-t border-slate-200">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              Atenciosamente,
            </p>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200 border-l-4 border-l-blue-600">
              <div className="size-8 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs flex-shrink-0">
                RP
              </div>
              <div className="space-y-0.5 text-[11px]">
                <div className="font-bold text-slate-900">Ricardo Patay</div>
                <div className="text-slate-500">Departamento Comercial &bull; Atendimento</div>
                {(modelos.incluirTelefoneUsuario || modelos.incluirEmailUsuario) && (
                  <div className="text-slate-600 pt-0.5 flex flex-wrap items-center gap-1.5">
                    {modelos.incluirTelefoneUsuario && (
                      <span>
                        WhatsApp: <strong>(67) 99988-7766</strong>
                      </span>
                    )}
                    {modelos.incluirTelefoneUsuario && modelos.incluirEmailUsuario && (
                      <span>&bull;</span>
                    )}
                    {modelos.incluirEmailUsuario && (
                      <span>ricardo@rcgdist.com.br</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Rodapé Corporativo */}
      <div className="bg-slate-900 text-slate-400 p-4 text-[10px] space-y-1.5">
        <div className="font-bold text-white text-[11px]">{empresaAtiva?.nomeFantasia || nomeEmpresa}</div>
        <div>
          {empresaAtiva?.cnpj ? `CNPJ ${empresaAtiva.cnpj}` : "CNPJ 03.715.067/0001-09"}
          {empresaAtiva?.endereco ? ` • ${empresaAtiva.endereco}` : " • Treze de Maio, 1472 — Centro — Campo Grande/MS"}
        </div>
        <div>
          {[
            empresaAtiva?.telefone ? `Tel.: ${empresaAtiva.telefone}` : "Tel.: (67) 3382-7328",
            empresaAtiva?.email || "pedidos@rcgdist.com.br",
            empresaAtiva?.site || null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
        <div className="text-slate-400 pt-2 border-t border-slate-800 flex justify-between items-center text-[10px]">
          <span>
            Enviado via CRM por{" "}
            <a
              href="https://www.bjsoft.com.br"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline font-semibold"
            >
              BJSoft
            </a>
            {modelos.incluirAssinaturaUsuario ? " (Ricardo Patay)" : ""}
          </span>
          <span className="text-slate-500">Ambiente Seguro</span>
        </div>
      </div>
    </div>
  );
}

