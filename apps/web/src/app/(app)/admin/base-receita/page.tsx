"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Database, Library, Loader2, MapPin, Play, RefreshCw } from "lucide-react";
import {
  PROSPECCAO_FONTE_LABEL,
  RECEITA_CARGA_ETAPA_LABEL,
  RECEITA_SITUACOES,
  UFS_BRASIL,
  type ProspeccaoFonte,
  type ReceitaBaseConfig,
  type ReceitaBaseConfigSalvar,
  type ReceitaBaseEstado,
  type ReceitaCepsResultado,
  type ReceitaReferenciasResultado,
} from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Administração > Base da Receita (docs/planos/2026-11-20-prospeccao-leads-receita.md).
 *
 * Os parâmetros RECEITA_* (estados e situações que esta empresa quer na base
 * própria, e como chegar nela) e PROSPECCAO_* (de onde a coleta de leads busca
 * e os limites dela), o estado da base e a carga. A base é uma só para a
 * instalação: a carga grava a união dos estados de todas as empresas.
 */

const erroDe = (err: unknown, padrao: string) => (err instanceof ApiError ? err.message : padrao);
const numero = (v: number) => v.toLocaleString("pt-BR");

function tamanho(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB`;
  return `${(bytes / 1024 ** 2).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} MB`;
}

function dataHora(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("pt-BR") : "—";
}

const rotuloSituacao = (codigo: string) =>
  RECEITA_SITUACOES.find((s) => s.codigo === codigo)?.rotulo ?? codigo;

export default function BaseReceitaPage() {
  const { data: cfg, isLoading } = useQuery({
    queryKey: ["receita-base", "configuracao"],
    queryFn: () => apiFetch<ReceitaBaseConfig>("/receita-base/configuracao"),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Database className="size-5" /> Base da Receita
        </h1>
        <p className="text-sm text-muted-foreground">
          Base própria com o cadastro de empresas da Receita, usada pela prospecção de leads. Só
          entram os estados e situações escolhidos aqui, para caber no disco; a coleta de leads
          busca nela ou na base pública, conforme o parâmetro.
        </p>
      </div>

      <Estado />

      <Referencias />

      {isLoading || !cfg ? (
        <Card>
          <CardContent>
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
      ) : (
        // A chave refaz o formulário quando a configuração gravada muda.
        <Configuracao key={JSON.stringify(cfg)} cfg={cfg} />
      )}
    </div>
  );
}

function Estado() {
  const queryClient = useQueryClient();
  const podeEditar = useAuthStore((s) => s.hasPermission("base-receita", "editar"));
  const [mes, setMes] = useState("");

  const { data: e, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["receita-base", "estado"],
    queryFn: () => apiFetch<ReceitaBaseEstado>("/receita-base/estado"),
    // Com carga rodando, a tela acompanha.
    refetchInterval: (q) => (q.state.data?.carga?.rodando ? 5000 : false),
  });

  const carregar = useMutation({
    mutationFn: () =>
      apiFetch<{ mes: string }>("/receita-base/carga", {
        method: "POST",
        body: mes.trim() ? { mes: mes.trim() } : {},
      }),
    onSuccess: (r) => {
      toast.success(`Carga de ${r.mes} iniciada. Leva horas; acompanhe aqui.`);
      void queryClient.invalidateQueries({ queryKey: ["receita-base", "estado"] });
    },
    onError: (err) => toast.error(erroDe(err, "Não foi possível iniciar a carga")),
  });

  if (isLoading || !e) {
    return (
      <Card>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  const carga = e.carga;
  const desatualizada = !!(e.base?.mes && e.mesMaisRecente && e.base.mes < e.mesMaisRecente);

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">Base própria</p>
          <Badge variant={e.disponivel ? "default" : "secondary"}>
            {e.disponivel ? "No ar" : "Fora do ar"}
          </Badge>
          {carga?.rodando && (
            <Badge variant="outline" className="gap-1">
              <Loader2 className="size-3 animate-spin" /> {RECEITA_CARGA_ETAPA_LABEL[carga.etapa]}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>

        {!e.disponivel ? (
          <p className="text-sm text-muted-foreground">{e.erro}</p>
        ) : (
          <>
            <dl className="grid gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Mês carregado</dt>
                <dd className="font-medium">
                  {e.base?.mes || "—"}
                  {desatualizada && (
                    <span className="ml-1 text-xs text-amber-600">(há {e.mesMaisRecente})</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Mais recente na Receita</dt>
                <dd className="font-medium">{e.mesMaisRecente ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Empresas na base</dt>
                <dd className="font-medium">{numero(e.base?.empresas ?? 0)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Tamanho do banco</dt>
                <dd className="font-medium">{tamanho(e.base?.tamanhoBytes ?? 0)}</dd>
              </div>
            </dl>

            {carga && carga.etapa && (
              <div className="space-y-2 rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="font-medium">Última carga: {RECEITA_CARGA_ETAPA_LABEL[carga.etapa]}</span>
                  <span className="text-xs text-muted-foreground">
                    {carga.mes} · {(carga.ufs ?? []).join(", ") || "todos os estados"} ·{" "}
                    {(carga.situacoes ?? []).map(rotuloSituacao).join(", ") || "todas as situações"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    início {dataHora(carga.iniciadaEm)}
                    {carga.concluidaEm && ` · fim ${dataHora(carga.concluidaEm)}`}
                  </span>
                </div>
                {carga.erro && <p className="text-xs text-destructive">{carga.erro}</p>}
                {carga.rodando && (carga.log ?? []).length > 0 && (
                  <pre className="max-h-32 overflow-auto rounded bg-muted p-2 text-[11px] leading-snug whitespace-pre-wrap">
                    {(carga.log ?? []).slice(-6).join("\n")}
                  </pre>
                )}
              </div>
            )}
          </>
        )}

        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-sm font-medium">Próxima carga</p>
          {e.proximaCarga.ufs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma empresa marcou estados ainda — marque abaixo e salve.
            </p>
          ) : (
            <>
              <p className="text-sm">
                <span className="font-medium">{e.proximaCarga.ufs.join(", ")}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {e.proximaCarga.situacoes.map(rotuloSituacao).join(", ")}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                União das empresas:{" "}
                {e.proximaCarga.empresas.map((x) => `${x.nome} (${x.ufs.join(", ")})`).join(" · ")}
              </p>
            </>
          )}
          {podeEditar && (
            <div className="flex flex-wrap items-end gap-2 pt-1">
              <div className="space-y-1">
                <FieldLabel htmlFor="receita-mes">Mês (AAAA-MM)</FieldLabel>
                <Input
                  id="receita-mes"
                  className="w-32"
                  placeholder={e.mesMaisRecente ?? "mais recente"}
                  value={mes}
                  onChange={(ev) => setMes(ev.target.value)}
                />
              </div>
              <Button
                onClick={() => {
                  if (
                    window.confirm(
                      "Carregar a base agora? Leva horas, apaga a base atual antes de gravar a nova e, durante a carga, a coleta pela base própria fica parada.",
                    )
                  )
                    carregar.mutate();
                }}
                disabled={
                  carregar.isPending ||
                  !e.disponivel ||
                  !!carga?.rodando ||
                  e.proximaCarga.ufs.length === 0
                }
              >
                {carregar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                Carregar
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Tabelas de referência compartilhadas com a Receita
 * (docs/planos/2026-11-21-tabelas-referencia-compartilhadas.md): a plataforma
 * guarda o código da Receita nos municípios, as naturezas jurídicas e os CNAEs
 * que faltam, e os CEPs da base própria. Globais: valem para todas as empresas.
 */
function Referencias() {
  const queryClient = useQueryClient();
  const podeEditar = useAuthStore((s) => s.hasPermission("base-receita", "editar"));
  const { data: e } = useQuery({
    queryKey: ["receita-base", "estado"],
    queryFn: () => apiFetch<ReceitaBaseEstado>("/receita-base/estado"),
  });
  const [refs, setRefs] = useState<ReceitaReferenciasResultado | null>(null);
  const [ceps, setCeps] = useState<ReceitaCepsResultado | null>(null);

  const atualizarRefs = useMutation({
    mutationFn: () =>
      apiFetch<ReceitaReferenciasResultado>("/receita-base/referencias", { method: "POST" }),
    onSuccess: (r) => {
      setRefs(r);
      toast.success("Referências atualizadas.");
      void queryClient.invalidateQueries({ queryKey: ["receita-base", "estado"] });
    },
    onError: (err) => toast.error(erroDe(err, "Não foi possível atualizar as referências")),
  });
  const atualizarCeps = useMutation({
    mutationFn: () => apiFetch<ReceitaCepsResultado>("/receita-base/ceps", { method: "POST" }),
    onSuccess: (r) => {
      setCeps(r);
      toast.success(`${numero(r.novos)} CEPs novos gravados.`);
      void queryClient.invalidateQueries({ queryKey: ["receita-base", "estado"] });
    },
    onError: (err) => toast.error(erroDe(err, "Não foi possível atualizar os CEPs")),
  });

  const r = e?.referencias;
  const rodando = !!e?.carga?.rodando;

  return (
    <Card>
      <CardContent className="space-y-4">
        <div>
          <p className="font-medium">Tabelas de referência</p>
          <p className="text-sm text-muted-foreground">
            Os cadastros da plataforma guardam os códigos da Receita, para a base própria e os
            leads apontarem para eles em vez de repetir texto. Valem para todas as empresas.
          </p>
        </div>

        <dl className="grid gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Municípios com código da Receita</dt>
            <dd className="font-medium">
              {r ? `${numero(r.municipiosComCodigoReceita)} de ${numero(r.municipios)}` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Naturezas jurídicas</dt>
            <dd className="font-medium">{r ? numero(r.naturezas) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">CNAEs</dt>
            <dd className="font-medium">{r ? numero(r.cnaes) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">CEPs vindos da base própria</dt>
            <dd className="font-medium">{r ? numero(r.cepsReceita) : "—"}</dd>
          </div>
        </dl>

        {podeEditar && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => atualizarRefs.mutate()}
              disabled={atualizarRefs.isPending || !e?.disponivel || rodando}
            >
              {atualizarRefs.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Library className="size-4" />
              )}
              Atualizar referências
            </Button>
            <Button
              variant="outline"
              onClick={() => atualizarCeps.mutate()}
              disabled={atualizarCeps.isPending || !e?.disponivel || rodando || !e?.base?.empresas}
            >
              {atualizarCeps.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <MapPin className="size-4" />
              )}
              Atualizar CEPs
            </Button>
          </div>
        )}
        <FieldDescription>
          Referências: baixa a tabela do Tesouro e as da Receita (segundos). Rode antes da carga,
          para município novo sair com IBGE. CEPs: grava os CEPs da base própria que a tabela ainda
          não tem (pouco mais de 2 minutos para MS e MT); os do ViaCEP não são alterados.
        </FieldDescription>

        {refs && (
          <div className="space-y-1 rounded-lg border p-3 text-sm">
            <p className="font-medium">Referências de {refs.mes}</p>
            <p className="text-muted-foreground">
              {numero(refs.municipiosAtualizados)} municípios atualizados (
              {numero(refs.municipiosPeloTesouro)} pela tabela do Tesouro
              {refs.municipiosPeloNome.length > 0 &&
                `, ${refs.municipiosPeloNome.length} pelo nome: ${refs.municipiosPeloNome
                  .map((m) => `${m.nome}-${m.uf ?? "?"} (${m.codigoReceita})`)
                  .join(", ")}`}
              ) · naturezas: {numero(refs.naturezasNovas)} novas, {numero(refs.naturezasAtualizadas)}{" "}
              atualizadas · CNAEs novos: {numero(refs.cnaesNovos.length)}
            </p>
            {refs.municipiosSemCodigo.length > 0 && (
              <p className="text-xs text-amber-600">
                Sem código da Receita ({refs.municipiosSemCodigo.length}):{" "}
                {refs.municipiosSemCodigo
                  .slice(0, 20)
                  .map((m) => `${m.nome}-${m.uf ?? "?"}`)
                  .join(", ")}
                {refs.municipiosSemCodigo.length > 20 && "…"}
              </p>
            )}
          </div>
        )}
        {ceps && (
          <p className="rounded-lg border p-3 text-sm text-muted-foreground">
            CEPs: {numero(ceps.lidos)} na base própria · {numero(ceps.novos)} novos ·{" "}
            {numero(ceps.jaExistiam)} já estavam na tabela
            {ceps.semMunicipio > 0 && ` · ${numero(ceps.semMunicipio)} sem município da plataforma`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

type CamposNumero =
  | "maxCombinacoes"
  | "maxEmpresas"
  | "pausaMs"
  | "downloadConexoes"
  | "downloadRetentativas"
  | "downloadEsperaS";
type Form = Omit<ReceitaBaseConfigSalvar, "controleToken" | CamposNumero> & {
  controleToken: string;
} & Record<CamposNumero, string>;

function Configuracao({ cfg }: { cfg: ReceitaBaseConfig }) {
  const queryClient = useQueryClient();
  const podeEditar = useAuthStore((s) => s.hasPermission("base-receita", "editar"));
  const [form, setForm] = useState<Form>(() => ({
    ufs: cfg.ufs,
    situacoes: cfg.situacoes,
    propriaUrl: cfg.propriaUrl,
    controleUrl: cfg.controleUrl,
    controleToken: "",
    fonte: cfg.fonte,
    maxCombinacoes: String(cfg.maxCombinacoes),
    maxEmpresas: String(cfg.maxEmpresas),
    pausaMs: String(cfg.pausaMs),
    downloadConexoes: String(cfg.downloadConexoes),
    downloadRetentativas: String(cfg.downloadRetentativas),
    downloadEsperaS: String(cfg.downloadEsperaS),
  }));
  const muda = <K extends keyof Form>(chave: K, valor: Form[K]) => setForm((f) => ({ ...f, [chave]: valor }));
  const alternar = <T extends string>(lista: T[], item: T) =>
    lista.includes(item) ? lista.filter((x) => x !== item) : [...lista, item];

  const salvar = useMutation({
    mutationFn: (dados: Form) =>
      apiFetch<ReceitaBaseConfig>("/receita-base/configuracao", {
        method: "PUT",
        body: {
          ...dados,
          controleToken: dados.controleToken.trim() || undefined,
          maxCombinacoes: Number(dados.maxCombinacoes),
          maxEmpresas: Number(dados.maxEmpresas),
          pausaMs: Number(dados.pausaMs),
          downloadConexoes: Number(dados.downloadConexoes),
          downloadRetentativas: Number(dados.downloadRetentativas),
          downloadEsperaS: Number(dados.downloadEsperaS),
        },
      }),
    onSuccess: (atualizado) => {
      queryClient.setQueryData(["receita-base", "configuracao"], atualizado);
      void queryClient.invalidateQueries({ queryKey: ["receita-base", "estado"] });
      toast.success("Parâmetros salvos");
    },
    onError: (err) => toast.error(erroDe(err, "Não foi possível salvar")),
  });

  return (
    <Card>
      <CardContent>
        <form
          className="space-y-6"
          onSubmit={(ev) => {
            ev.preventDefault();
            salvar.mutate(form);
          }}
        >
          <div className="space-y-3">
            <p className="font-medium">O que entra na base própria</p>
            <div className="space-y-1.5">
              <FieldLabel>Estados desta empresa (RECEITA_UFS)</FieldLabel>
              <div className="grid grid-cols-5 gap-2 sm:grid-cols-9 lg:grid-cols-14">
                {UFS_BRASIL.map((uf) => (
                  <label key={uf} className="flex items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={form.ufs.includes(uf)}
                      onCheckedChange={() => muda("ufs", alternar(form.ufs, uf))}
                      disabled={!podeEditar}
                    />
                    {uf}
                  </label>
                ))}
              </div>
              <FieldDescription>
                A carga grava a união dos estados de todas as empresas. Cada estado a mais aumenta o
                tamanho da base.
              </FieldDescription>
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Situações cadastrais mantidas (RECEITA_SITUACOES)</FieldLabel>
              <div className="flex flex-wrap gap-4">
                {RECEITA_SITUACOES.map((s) => (
                  <label key={s.codigo} className="flex items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={form.situacoes.includes(s.codigo)}
                      onCheckedChange={() => muda("situacoes", alternar(form.situacoes, s.codigo))}
                      disabled={!podeEditar}
                    />
                    {s.rotulo}
                  </label>
                ))}
              </div>
              <FieldDescription>
                A prospecção só usa as ativas; manter baixadas e inativas ocupa espaço sem uso.
                Vale na próxima carga.
              </FieldDescription>
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Download da carga</FieldLabel>
              <div className="grid gap-4 sm:grid-cols-3">
                {(
                  [
                    ["downloadConexoes", "Conexões simultâneas (RECEITA_DOWNLOAD_CONEXOES)", "1 a 32. Menos conexões incomodam menos o servidor da Receita."],
                    ["downloadRetentativas", "Tentativas por parte (RECEITA_DOWNLOAD_RETENTATIVAS)", "1 a 1.000. A Receita recusa conexão de vez em quando."],
                    ["downloadEsperaS", "Espera entre tentativas, s (RECEITA_DOWNLOAD_ESPERA_S)", "0 a 600 segundos."],
                  ] as const
                ).map(([campo, rotulo, ajuda]) => (
                  <div key={campo} className="space-y-1.5">
                    <FieldLabel htmlFor={`receita-${campo}`}>{rotulo}</FieldLabel>
                    <Input
                      id={`receita-${campo}`}
                      inputMode="numeric"
                      value={form[campo]}
                      onChange={(ev) => muda(campo, ev.target.value.replace(/D/g, ""))}
                      disabled={!podeEditar}
                    />
                    <FieldDescription>{ajuda}</FieldDescription>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <p className="font-medium">Coleta de leads</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <FieldLabel htmlFor="receita-fonte">Fonte (PROSPECCAO_FONTE)</FieldLabel>
                <Select
                  value={form.fonte}
                  onValueChange={(v) => muda("fonte", v as ProspeccaoFonte)}
                  disabled={!podeEditar}
                >
                  <SelectTrigger id="receita-fonte" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PROSPECCAO_FONTE_LABEL) as ProspeccaoFonte[]).map((f) => (
                      <SelectItem key={f} value={f}>
                        {PROSPECCAO_FONTE_LABEL[f]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  A pública limita as buscas; a própria não tem trava, mas só tem o que foi carregado.
                </FieldDescription>
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="receita-max-empresas">Empresas por coleta (PROSPECCAO_MAX_EMPRESAS)</FieldLabel>
                <Input
                  id="receita-max-empresas"
                  inputMode="numeric"
                  value={form.maxEmpresas}
                  onChange={(ev) => muda("maxEmpresas", ev.target.value.replace(/\D/g, ""))}
                  disabled={!podeEditar}
                />
                <FieldDescription>Lidas, em todas as situações. 100 a 500.000.</FieldDescription>
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="receita-max-comb">Buscas por coleta, pública (PROSPECCAO_MAX_COMBINACOES)</FieldLabel>
                <Input
                  id="receita-max-comb"
                  inputMode="numeric"
                  value={form.maxCombinacoes}
                  onChange={(ev) => muda("maxCombinacoes", ev.target.value.replace(/\D/g, ""))}
                  disabled={!podeEditar}
                />
                <FieldDescription>Municípios × atividades. A própria faz uma busca só.</FieldDescription>
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="receita-pausa">Pausa entre buscas, pública (PROSPECCAO_PAUSA_MS)</FieldLabel>
                <Input
                  id="receita-pausa"
                  inputMode="numeric"
                  value={form.pausaMs}
                  onChange={(ev) => muda("pausaMs", ev.target.value.replace(/\D/g, ""))}
                  disabled={!podeEditar}
                />
                <FieldDescription>Em milissegundos. Menos que ~1000 provoca recusas da pública.</FieldDescription>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <p className="font-medium">Conexão com a base própria</p>
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-1.5">
                <FieldLabel htmlFor="receita-propria-url">API de consulta (RECEITA_PROPRIA_URL)</FieldLabel>
                <Input
                  id="receita-propria-url"
                  placeholder={cfg.padroes.propriaUrl ?? "http://receita_api:8000"}
                  value={form.propriaUrl}
                  onChange={(ev) => muda("propriaUrl", ev.target.value)}
                  disabled={!podeEditar}
                />
                <FieldDescription>Vazio usa a do ambiente{cfg.padroes.propriaUrl ? ` (${cfg.padroes.propriaUrl})` : ""}.</FieldDescription>
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="receita-controle-url">Controle (RECEITA_CONTROLE_URL)</FieldLabel>
                <Input
                  id="receita-controle-url"
                  placeholder={cfg.padroes.controleUrl ?? "http://receita_controle:8001"}
                  value={form.controleUrl}
                  onChange={(ev) => muda("controleUrl", ev.target.value)}
                  disabled={!podeEditar}
                />
                <FieldDescription>Vazio usa a do ambiente{cfg.padroes.controleUrl ? ` (${cfg.padroes.controleUrl})` : ""}.</FieldDescription>
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="receita-token">Token do controle (RECEITA_CONTROLE_TOKEN)</FieldLabel>
                <Input
                  id="receita-token"
                  type="password"
                  autoComplete="new-password"
                  placeholder={cfg.temControleToken ? "•••••••• (gravado)" : cfg.padroes.temControleToken ? "do ambiente" : "não informado"}
                  value={form.controleToken}
                  onChange={(ev) => muda("controleToken", ev.target.value)}
                  disabled={!podeEditar}
                />
                <FieldDescription>O mesmo da stack. Só troca quando preenchido; gravado cifrado.</FieldDescription>
              </div>
            </div>
          </div>

          {podeEditar && (
            <Button type="submit" disabled={salvar.isPending}>
              {salvar.isPending && <Loader2 className="size-4 animate-spin" />}
              Salvar
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
