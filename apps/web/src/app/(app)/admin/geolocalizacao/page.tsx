"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  GEOCODIFICACAO_PRECISAO_ROTULO,
  type GeocodificacaoConfiguracao,
  type GeocodificacaoConfiguracaoUpdate,
  type GeocodificacaoLoteSituacao,
  type GeocodificacaoTesteResultado,
} from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Loader2, MapPin, Play, Search } from "lucide-react";

const numero = (v: number | null | undefined) => (v ?? 0).toLocaleString("pt-BR");

const erroDe = (err: unknown, padrao: string) =>
  err instanceof ApiError ? err.message : padrao;

type Form = Omit<GeocodificacaoConfiguracaoUpdate, "chave" | "loteLimite"> & {
  chave: string;
  loteLimite: string;
};

/**
 * Administração > Geolocalização (docs/planos/geocodificacao-clientes.md):
 * os parâmetros GEO_* da Geocoding API do Google, um teste de endereço e o
 * lote dos clientes sem coordenadas. A chave não volta da API; o campo só
 * troca a atual quando é preenchido.
 */
export default function GeolocalizacaoPage() {
  const { data: cfg, isLoading } = useQuery({
    queryKey: ["geocodificacao", "configuracao"],
    queryFn: () => apiFetch<GeocodificacaoConfiguracao>("/geocodificacao/configuracao"),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Geolocalização</h1>
        <p className="text-sm text-muted-foreground">
          Coordenadas dos clientes pela Geocoding API do Google. Elas entram no cadastro e vão
          ao ERP como qualquer alteração.
        </p>
      </div>

      {isLoading || !cfg ? (
        <Card>
          <CardContent>
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* A chave refaz o formulário quando a configuração gravada muda. */}
          <Configuracao
            key={JSON.stringify({ ...cfg, pendentes: 0, naoEncontrados: 0 })}
            cfg={cfg}
          />
          <Teste habilitado={cfg.chavePreenchida} />
          <Lote cfg={cfg} />
        </>
      )}
    </div>
  );
}

function Configuracao({ cfg }: { cfg: GeocodificacaoConfiguracao }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form>(() => ({
    ativo: cfg.ativo,
    url: cfg.url,
    chave: "",
    aoSalvar: cfg.aoSalvar,
    loteLimite: String(cfg.loteLimite),
  }));
  const muda = <K extends keyof Form>(chave: K, valor: Form[K]) =>
    setForm((f) => ({ ...f, [chave]: valor }));

  const salvar = useMutation({
    mutationFn: (dados: Form) =>
      apiFetch<GeocodificacaoConfiguracao>("/geocodificacao/configuracao", {
        method: "PUT",
        body: {
          ...dados,
          chave: dados.chave.trim() || undefined,
          loteLimite: Number(dados.loteLimite),
        },
      }),
    onSuccess: (atualizado) => {
      queryClient.setQueryData(["geocodificacao", "configuracao"], atualizado);
      toast.success("Configuração salva");
    },
    onError: (err) => toast.error(erroDe(err, "Não foi possível salvar")),
  });

  return (
    <Card>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-2">
          <p className="font-medium">Geocoding API do Google</p>
          <Badge variant={cfg.habilitado ? "default" : "secondary"}>
            {cfg.habilitado ? "Habilitado" : "Desabilitado"}
          </Badge>
        </div>

        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            salvar.mutate(form);
          }}
        >
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div>
              <FieldLabel>Habilitado</FieldLabel>
              <FieldDescription>
                Liga a busca de coordenadas nesta empresa (GEO_ATIVO). Cada consulta é cobrada
                pelo Google na conta da chave.
              </FieldDescription>
            </div>
            <Switch checked={form.ativo} onCheckedChange={(v) => muda("ativo", v)} />
          </div>

          <div className="space-y-1.5">
            <FieldLabel htmlFor="geo-url">URL da API (GEO_URL)</FieldLabel>
            <Input
              id="geo-url"
              value={form.url}
              onChange={(e) => muda("url", e.target.value)}
              className="font-mono text-xs"
            />
            <FieldDescription>
              Normalmente https://maps.googleapis.com/maps/api/geocode/json.
            </FieldDescription>
          </div>

          <div className="space-y-1.5">
            <FieldLabel htmlFor="geo-chave">Chave da API (GEO_CHAVE)</FieldLabel>
            <Input
              id="geo-chave"
              type="password"
              autoComplete="off"
              value={form.chave}
              placeholder={
                cfg.chavePreenchida ? "•••••••• (preenchida — digite só para trocar)" : "AIza..."
              }
              onChange={(e) => muda("chave", e.target.value)}
            />
            <FieldDescription>
              Google Cloud &gt; APIs e serviços &gt; Credenciais, com a Geocoding API ativada no
              projeto. Restrinja a chave a essa API.
            </FieldDescription>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div>
              <FieldLabel>Buscar ao salvar o cliente</FieldLabel>
              <FieldDescription>
                Ao incluir ou alterar um cliente, busca as coordenadas quando o endereço muda ou
                elas estão vazias. Coordenada digitada na tela não é trocada (GEO_AO_SALVAR).
              </FieldDescription>
            </div>
            <Switch checked={form.aoSalvar} onCheckedChange={(v) => muda("aoSalvar", v)} />
          </div>

          <div className="space-y-1.5 sm:max-w-xs">
            <FieldLabel htmlFor="geo-limite">Clientes por execução do lote (GEO_LOTE_LIMITE)</FieldLabel>
            <Input
              id="geo-limite"
              type="number"
              min={1}
              max={5000}
              value={form.loteLimite}
              onChange={(e) => muda("loteLimite", e.target.value)}
            />
          </div>

          <div className="flex justify-end">
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

function Teste({ habilitado }: { habilitado: boolean }) {
  const [endereco, setEndereco] = useState("");
  const testar = useMutation({
    mutationFn: () =>
      apiFetch<GeocodificacaoTesteResultado>("/geocodificacao/testar", {
        method: "POST",
        body: { endereco },
      }),
    onError: (err) => toast.error(erroDe(err, "Não foi possível consultar")),
  });
  const r = testar.data;

  return (
    <Card>
      <CardContent className="space-y-3">
        <div>
          <p className="font-medium">Testar um endereço</p>
          <p className="text-xs text-muted-foreground">
            Usa a configuração salva e não grava nada. Serve para conferir a chave.
          </p>
        </div>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            testar.mutate();
          }}
        >
          <Input
            value={endereco}
            placeholder="Rua, número, bairro, cidade - UF"
            onChange={(e) => setEndereco(e.target.value)}
          />
          <Button
            type="submit"
            variant="outline"
            disabled={!habilitado || endereco.trim().length < 5 || testar.isPending}
          >
            {testar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            Consultar
          </Button>
        </form>
        {!habilitado && (
          <p className="text-xs text-muted-foreground">Salve a chave da API para testar.</p>
        )}
        {r && (
          <div className="space-y-1 rounded-lg border p-3 text-sm">
            {r.encontrado ? (
              <p className="flex items-center gap-1.5 font-medium">
                <MapPin className="size-4" />
                <span className="tabular-nums">
                  {r.latitude}, {r.longitude}
                </span>
                <a
                  className="ml-2 text-xs font-normal text-primary hover:underline"
                  href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ver no mapa
                </a>
              </p>
            ) : (
              <p className="font-medium">Não encontrado com precisão suficiente</p>
            )}
            {r.enderecoFormatado && (
              <p className="text-xs text-muted-foreground">Google entendeu: {r.enderecoFormatado}</p>
            )}
            {r.precisao && (
              <p className="text-xs text-muted-foreground">
                Precisão: {GEOCODIFICACAO_PRECISAO_ROTULO[r.precisao] ?? r.precisao}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Lote({ cfg }: { cfg: GeocodificacaoConfiguracao }) {
  const queryClient = useQueryClient();
  const [incluirNaoEncontrados, setIncluirNaoEncontrados] = useState(false);

  const { data: lote } = useQuery({
    queryKey: ["geocodificacao", "lote"],
    queryFn: () => apiFetch<GeocodificacaoLoteSituacao>("/geocodificacao/lote"),
    // Acompanha enquanto roda; parado, não precisa consultar.
    refetchInterval: (q) => (q.state.data?.rodando ? 2000 : false),
  });

  const [rodavaAntes, setRodavaAntes] = useState(false);
  if (lote && lote.rodando !== rodavaAntes) {
    setRodavaAntes(lote.rodando);
    // Terminou: as contagens de pendentes mudaram.
    if (!lote.rodando) {
      void queryClient.invalidateQueries({ queryKey: ["geocodificacao", "configuracao"] });
    }
  }

  const iniciar = useMutation({
    mutationFn: () =>
      apiFetch<GeocodificacaoLoteSituacao>("/geocodificacao/lote", {
        method: "POST",
        body: { incluirNaoEncontrados },
      }),
    onSuccess: (situacao) => {
      queryClient.setQueryData(["geocodificacao", "lote"], situacao);
      if (situacao.total === 0) toast.info("Nenhum cliente para consultar");
    },
    onError: (err) => toast.error(erroDe(err, "Não foi possível iniciar o lote")),
  });

  const aConsultar = cfg.pendentes + (incluirNaoEncontrados ? cfg.naoEncontrados : 0);
  const nestaExecucao = Math.min(aConsultar, cfg.loteLimite);
  const progresso = lote?.total ? Math.round((lote.processados / lote.total) * 100) : 0;

  return (
    <Card>
      <CardContent className="space-y-4">
        <div>
          <p className="font-medium">Clientes sem coordenadas</p>
          <p className="text-xs text-muted-foreground">
            Clientes ativos com rua, cidade e UF e sem latitude/longitude. A coordenada achada entra
            no cadastro (histórico com origem &quot;Coordenadas (Google)&quot;) e vai ao ERP.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Ainda não consultados</p>
            <p className="text-2xl font-semibold tabular-nums">{numero(cfg.pendentes)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Google não achou</p>
            <p className="text-2xl font-semibold tabular-nums">{numero(cfg.naoEncontrados)}</p>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={incluirNaoEncontrados}
            onCheckedChange={(v) => setIncluirNaoEncontrados(v === true)}
          />
          Consultar de novo os que o Google não achou (útil depois de corrigir endereços)
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => iniciar.mutate()}
            disabled={!cfg.habilitado || lote?.rodando || iniciar.isPending || aConsultar === 0}
          >
            {lote?.rodando || iniciar.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            Buscar coordenadas
          </Button>
          <span className="text-xs text-muted-foreground">
            {cfg.habilitado
              ? `${numero(nestaExecucao)} cliente(s) nesta execução — no máximo ${numero(cfg.loteLimite)}.`
              : "Habilite e salve a chave para rodar."}
          </span>
        </div>

        {lote && lote.iniciadoEm && (
          <div className="space-y-2 rounded-lg border p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">
                {lote.rodando ? "Consultando…" : "Última execução"}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {numero(lote.processados)} de {numero(lote.total)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded bg-muted">
              <div className="h-full rounded bg-primary" style={{ width: `${progresso}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">
              Encontrados: {numero(lote.encontrados)} · Não encontrados:{" "}
              {numero(lote.naoEncontrados)} · Erros: {numero(lote.erros)}
            </p>
            {lote.erro && <p className="text-xs text-destructive">Parou: {lote.erro}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
