"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  GEOCODIFICACAO_PRECISAO_ROTULO,
  GEOCODIFICACAO_PROVEDORES,
  GEOCODIFICACAO_PROVEDOR_ROTULO,
  type GeocodificacaoProvedor,
  type GeocodificacaoConfiguracao,
  type GeocodificacaoEmpresaLocal,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Loader2, MapPin, Play, Search } from "lucide-react";
import { MapaLocal } from "@/components/mapa/mapa-local";
import { useAuthStore } from "@/stores/auth-store";

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
          Coordenadas dos clientes pelo Google ou pelo OpenStreetMap (Nominatim). Elas entram no
          cadastro e vão ao ERP como qualquer alteração.
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
            key={JSON.stringify({
              ...cfg,
              pendentes: 0,
              naoEncontrados: 0,
              leadsPendentes: 0,
              leadsNaoEncontrados: 0,
            })}
            cfg={cfg}
          />
          <LocalEmpresa />
          <Teste habilitado={cfg.habilitado} />
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
    provedor: cfg.provedor,
    nominatimUrl: cfg.nominatimUrl,
    url: cfg.url,
    chave: "",
    aoSalvar: cfg.aoSalvar,
    rotasGoogle: cfg.rotasGoogle,
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
          <p className="font-medium">Serviço de coordenadas</p>
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
                Liga a busca de coordenadas nesta empresa (GEO_ATIVO). Os mapas funcionam sem
                isso: mostram quem já tem coordenada.
              </FieldDescription>
            </div>
            <Switch checked={form.ativo} onCheckedChange={(v) => muda("ativo", v)} />
          </div>

          <div className="space-y-1.5 sm:max-w-sm">
            <FieldLabel htmlFor="geo-provedor">Serviço (GEO_PROVEDOR)</FieldLabel>
            <Select
              value={form.provedor}
              onValueChange={(v) => muda("provedor", v as GeocodificacaoProvedor)}
            >
              <SelectTrigger id="geo-provedor" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GEOCODIFICACAO_PROVEDORES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {GEOCODIFICACAO_PROVEDOR_ROTULO[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              {form.provedor === "google"
                ? "Mais preciso (acha o número do imóvel). Pago por consulta, na conta da chave."
                : "Gratuito e sem chave, mas acha menos números de rua no Brasil e consulta no máximo 1 endereço por segundo (o lote anda mais devagar)."}
            </FieldDescription>
          </div>

          {form.provedor === "nominatim" && (
            <div className="space-y-1.5">
              <FieldLabel htmlFor="geo-nominatim-url">URL do Nominatim (GEO_NOMINATIM_URL)</FieldLabel>
              <Input
                id="geo-nominatim-url"
                value={form.nominatimUrl}
                onChange={(e) => muda("nominatimUrl", e.target.value)}
                className="font-mono text-xs"
              />
              <FieldDescription>
                Normalmente https://nominatim.openstreetmap.org/search (serviço público). Troque
                só se tiver um servidor Nominatim próprio.
              </FieldDescription>
            </div>
          )}

          <div className={form.provedor === "google" ? "space-y-1.5" : "hidden"}>
            <FieldLabel htmlFor="geo-url">URL da API do Google (GEO_URL)</FieldLabel>
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

          <div className={form.provedor === "google" ? "space-y-1.5" : "hidden"}>
            <FieldLabel htmlFor="geo-chave">Chave da API do Google (GEO_CHAVE)</FieldLabel>
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

          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div>
              <FieldLabel>Calcular rotas de visita pelo Google</FieldLabel>
              <FieldDescription>
                Gerencial &gt; Mapa e Rotas: ordem otimizada e caminho pelas ruas (até 25 paradas),
                pela Routes API com a chave do Google acima — ative a Routes API no projeto e na
                chave. Desligado, a ordem é por proximidade, sem custo (GEO_ROTAS_GOOGLE).
              </FieldDescription>
            </div>
            <Switch checked={form.rotasGoogle} onCheckedChange={(v) => muda("rotasGoogle", v)} />
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

/**
 * O ponto da empresa ativa nos mapas (aba Mapa do cliente, rotas). Busca pelo
 * endereço do cadastro da empresa ou pin manual.
 */
function LocalEmpresa() {
  const queryClient = useQueryClient();
  const podeEditar = useAuthStore((s) => s.hasPermission("geolocalizacao", "editar"));
  const { data: empresa } = useQuery({
    queryKey: ["geocodificacao", "empresa"],
    queryFn: () => apiFetch<GeocodificacaoEmpresaLocal>("/geocodificacao/empresa"),
  });
  if (!empresa) return null;

  const gravar = async (p: { latitude: number; longitude: number }) => {
    const atualizada = await apiFetch<GeocodificacaoEmpresaLocal>("/geocodificacao/empresa", {
      method: "PUT",
      body: p,
    });
    queryClient.setQueryData(["geocodificacao", "empresa"], atualizada);
    toast.success("Localização da empresa gravada");
  };

  return (
    <Card>
      <CardContent className="space-y-3">
        <div>
          <p className="font-medium">Localização da empresa</p>
          <p className="text-xs text-muted-foreground">
            {empresa.nome}
            {empresa.municipio ? ` — ${empresa.municipio}${empresa.uf ? ` - ${empresa.uf}` : ""}` : ""}
            . Aparece como referência nos mapas dos clientes.
          </p>
        </div>
        <MapaLocal
          rotulo={empresa.nome}
          latitude={empresa.latitude}
          longitude={empresa.longitude}
          endereco={{
            endereco: empresa.endereco ?? "",
            bairro: empresa.bairro,
            municipio: empresa.municipio ?? "",
            uf: empresa.uf ?? "",
            cep: empresa.cep,
          }}
          podeEditar={podeEditar}
          onGravar={gravar}
          mostrarEmpresa={false}
          permitirRota={false}
          altura="h-[320px]"
        />
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
            Usa a configuração salva e não grava nada. Serve para conferir o serviço e a chave.
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
          <p className="text-xs text-muted-foreground">
            Habilite e salve a configuração para testar.
          </p>
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
              <p className="text-xs text-muted-foreground">O serviço entendeu: {r.enderecoFormatado}</p>
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

  const aConsultar =
    cfg.pendentes +
    cfg.leadsPendentes +
    (incluirNaoEncontrados ? cfg.naoEncontrados + cfg.leadsNaoEncontrados : 0);
  const nestaExecucao = Math.min(aConsultar, cfg.loteLimite);
  const progresso = lote?.total ? Math.round((lote.processados / lote.total) * 100) : 0;

  return (
    <Card>
      <CardContent className="space-y-4">
        <div>
          <p className="font-medium">Clientes e leads sem coordenadas</p>
          <p className="text-xs text-muted-foreground">
            Clientes ativos com rua, cidade e UF e sem latitude/longitude. A coordenada achada entra
            no cadastro (histórico com origem &quot;Coordenadas (busca automática)&quot;) e vai ao ERP. Depois
            dos clientes, o lote completa o limite com os leads abertos que têm endereço.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Ainda não consultados</p>
            <p className="text-2xl font-semibold tabular-nums">{numero(cfg.pendentes)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Não encontrados</p>
            <p className="text-2xl font-semibold tabular-nums">{numero(cfg.naoEncontrados)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Leads não consultados</p>
            <p className="text-2xl font-semibold tabular-nums">{numero(cfg.leadsPendentes)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Leads não encontrados</p>
            <p className="text-2xl font-semibold tabular-nums">
              {numero(cfg.leadsNaoEncontrados)}
            </p>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={incluirNaoEncontrados}
            onCheckedChange={(v) => setIncluirNaoEncontrados(v === true)}
          />
          Consultar de novo os não encontrados (útil depois de corrigir endereços ou trocar de
          serviço)
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
              <span className={lote.erro ? "font-medium text-destructive" : "font-medium"}>
                {lote.rodando ? "Consultando…" : lote.erro ? "Interrompido" : "Última execução"}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {numero(lote.processados)} de {numero(lote.total)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded bg-muted">
              <div
                className={lote.erro ? "h-full rounded bg-destructive" : "h-full rounded bg-primary"}
                style={{ width: `${progresso}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Encontrados: {numero(lote.encontrados)} · Não encontrados:{" "}
              {numero(lote.naoEncontrados)} · Erros: {numero(lote.erros)}
            </p>
            {lote.erro && (
              <div className="space-y-1 text-xs">
                <p className="text-destructive">{lote.erro}</p>
                <p className="text-muted-foreground">
                  O lote parou aqui. Os que não foram consultados continuam pendentes e entram na
                  próxima execução.
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
