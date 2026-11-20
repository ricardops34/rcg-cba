"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Building2,
  Check,
  Loader2,
  MapPinned,
  Pencil,
  PenTool,
  Shapes,
  Trash2,
  X,
} from "lucide-react";
import type {
  GeocodificacaoEmpresaLocal,
  GeometriaRegiao,
  VendedorRegiao,
  VendedorRegiaoCreate,
  VendedorRegiaoMunicipioOpcao,
  VendedorRegiaoUpdate,
  VendedorRegioesInvasoes,
} from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useVendedoresEscopo } from "@/hooks/use-vendedores-escopo";
import { useAuthStore } from "@/stores/auth-store";
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
import { FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { coordenadaVazia } from "@/components/mapa/mapa-local";
import type { ModoMapaRegioes } from "@/components/gerencial/regioes-mapa-leaflet";

const RegioesMapaLeaflet = dynamic(() => import("@/components/gerencial/regioes-mapa-leaflet"), {
  ssr: false,
  loading: () => <Skeleton className="size-full" />,
});

const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
  "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
];

/** Cores bem distintas por vendedor; livre em cinza tracejado. */
const PALETA = [
  "#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2",
  "#db2777", "#65a30d", "#92400e", "#4f46e5", "#0f766e", "#be123c",
];
const COR_LIVRE = "#64748b";

const erro = (e: unknown, padrao: string) => (e instanceof ApiError ? e.message : padrao);

/** Retângulo que contém a geometria, no formato do Leaflet ([lat, lng]). */
function limites(g: GeometriaRegiao): [[number, number], [number, number]] {
  const pontos: Array<[number, number]> =
    g.type === "Polygon"
      ? (g.coordinates as Array<Array<[number, number]>>).flat()
      : (g.coordinates as Array<Array<Array<[number, number]>>>).flat(2);
  const lats = pontos.map((p) => p[1]);
  const lngs = pontos.map((p) => p[0]);
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];
}

type FormRegiao = { nome: string; vendedorId: string };

/**
 * Gerencial > Vendedores > Regiões de atuação (20/11/2026,
 * docs/planos/2026-11-20-mapas-clientes-rotas.md): desenhar áreas ou escolher
 * municípios inteiros, atribuir a vendedores (ou deixar livres) e ver as
 * invasões — clientes da carteira de um vendedor dentro da região de outro.
 */
export default function RegioesVendedoresPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const podeEditar = useAuthStore((s) => s.hasPermission("vendedores", "editar"));

  const { data: regioes = [], isLoading } = useQuery({
    queryKey: ["vendedor-regioes"],
    queryFn: () => apiFetch<VendedorRegiao[]>("/vendedor-regioes"),
  });
  const { data: invasoes } = useQuery({
    queryKey: ["vendedor-regioes", "invasoes"],
    queryFn: () => apiFetch<VendedorRegioesInvasoes>("/vendedor-regioes/invasoes"),
  });
  const { data: empresa } = useQuery({
    queryKey: ["geocodificacao", "empresa"],
    queryFn: () => apiFetch<GeocodificacaoEmpresaLocal>("/geocodificacao/empresa"),
    staleTime: 5 * 60_000,
  });
  const vendedoresQuery = useVendedoresEscopo();
  const vendedores = useMemo(
    () =>
      (vendedoresQuery.data?.data ?? [])
        .filter((v) => v.ativo)
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    [vendedoresQuery.data],
  );

  // Cor estável por vendedor: a ordem alfabética dos que têm região ou invasão.
  const corPorVendedor = useMemo(() => {
    const ids = new Set<string>();
    regioes.forEach((r) => r.vendedorId && ids.add(r.vendedorId));
    invasoes?.invasoes.forEach((i) => ids.add(i.vendedorId));
    const nome = new Map(vendedores.map((v) => [v.id, v.nome]));
    const ordenados = [...ids].sort((a, b) => (nome.get(a) ?? a).localeCompare(nome.get(b) ?? b));
    return new Map(ordenados.map((id, i) => [id, PALETA[i % PALETA.length]]));
  }, [regioes, invasoes, vendedores]);
  const corDe = useCallback(
    (vendedorId: string | null) => (vendedorId ? (corPorVendedor.get(vendedorId) ?? COR_LIVRE) : COR_LIVRE),
    [corPorVendedor],
  );

  const [modo, setModo] = useState<ModoMapaRegioes>({ tipo: "normal" });
  const [foco, setFoco] = useState<{ chave: number; bounds: [[number, number], [number, number]] } | null>(null);
  const focar = (bounds: [[number, number], [number, number]]) =>
    setFoco((f) => ({ chave: (f?.chave ?? 0) + 1, bounds }));
  const editadoRef = useRef<(() => GeometriaRegiao | null) | null>(null);

  const [desenho, setDesenho] = useState<GeometriaRegiao | null>(null);
  const [formNovo, setFormNovo] = useState<FormRegiao>({ nome: "", vendedorId: "livre" });
  const [municipioAberto, setMunicipioAberto] = useState(false);
  const [editando, setEditando] = useState<VendedorRegiao | null>(null);
  const [formEdicao, setFormEdicao] = useState<FormRegiao>({ nome: "", vendedorId: "livre" });
  const [selecionada, setSelecionada] = useState<string | null>(null);

  const invalidar = () => {
    void queryClient.invalidateQueries({ queryKey: ["vendedor-regioes"] });
  };

  const criar = useMutation({
    mutationFn: (body: VendedorRegiaoCreate) =>
      apiFetch<VendedorRegiao>("/vendedor-regioes", { method: "POST", body }),
    onSuccess: (r) => {
      toast.success(
        r.tipo === "municipio" && !r.geometria
          ? "Região criada. O IBGE não devolveu a divisa: o município vale pelo nome no cadastro do cliente."
          : "Região criada",
      );
      setDesenho(null);
      setMunicipioAberto(false);
      invalidar();
      if (r.geometria) focar(limites(r.geometria));
    },
    onError: (e) => toast.error(erro(e, "Não foi possível criar a região")),
  });

  const atualizar = useMutation({
    mutationFn: ({ id, body }: { id: string; body: VendedorRegiaoUpdate }) =>
      apiFetch<VendedorRegiao>(`/vendedor-regioes/${id}`, { method: "PATCH", body }),
    onSuccess: () => {
      toast.success("Região atualizada");
      setEditando(null);
      setModo({ tipo: "normal" });
      invalidar();
    },
    onError: (e) => toast.error(erro(e, "Não foi possível salvar a região")),
  });

  const remover = useMutation({
    mutationFn: (id: string) => apiFetch(`/vendedor-regioes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Região excluída");
      invalidar();
    },
    onError: (e) => toast.error(erro(e, "Não foi possível excluir")),
  });

  const salvarDesenho = () => {
    if (modo.tipo !== "editar") return;
    const g = editadoRef.current?.();
    if (!g) {
      toast.error("Não foi possível ler o desenho");
      return;
    }
    atualizar.mutate({ id: modo.regiaoId, body: { geometria: g } });
  };

  const centroInicial = useMemo<[number, number] | null>(
    () =>
      empresa && !coordenadaVazia(empresa.latitude, empresa.longitude)
        ? [empresa.latitude!, empresa.longitude!]
        : null,
    [empresa],
  );

  const vendedorDoForm = (v: string) => (v === "livre" ? null : v);

  return (
    <div className="flex h-[calc(100svh-6rem)] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.push("/gerencial/vendedores")}>
          <ArrowLeft className="size-4" />
          Vendedores
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">Regiões de atuação</h1>
        {modo.tipo === "desenhar" && (
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              Clique no mapa para marcar os pontos; clique no primeiro ponto (ou dois cliques) para fechar.
            </span>
            <Button size="sm" variant="ghost" onClick={() => setModo({ tipo: "normal" })}>
              <X className="size-4" />
              Cancelar
            </Button>
          </div>
        )}
        {modo.tipo === "editar" && (
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Arraste os pontos para ajustar a área.</span>
            <Button size="sm" variant="ghost" onClick={() => setModo({ tipo: "normal" })}>
              <X className="size-4" />
              Cancelar
            </Button>
            <Button size="sm" onClick={salvarDesenho} disabled={atualizar.isPending}>
              {atualizar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Salvar desenho
            </Button>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
        <Card className="flex min-h-0 flex-col md:w-96 md:shrink-0">
          <CardContent className="flex min-h-0 flex-1 flex-col">
            <Tabs defaultValue="regioes" className="flex min-h-0 flex-1 flex-col">
              <TabsList>
                <TabsTrigger value="regioes">Regiões ({regioes.length})</TabsTrigger>
                <TabsTrigger value="invasoes">
                  Invasões ({invasoes?.invasoes.length ?? 0})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="regioes" className="flex min-h-0 flex-1 flex-col gap-3">
                {podeEditar && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => setModo({ tipo: "desenhar" })}
                      disabled={modo.tipo !== "normal"}
                    >
                      <PenTool className="size-4" />
                      Desenhar área
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setMunicipioAberto(true)}
                      disabled={modo.tipo !== "normal"}
                    >
                      <Building2 className="size-4" />
                      Município inteiro
                    </Button>
                  </div>
                )}
                <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
                  {isLoading ? (
                    <Skeleton className="h-24 w-full" />
                  ) : regioes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma região ainda. Desenhe uma área no mapa ou escolha um município.
                    </p>
                  ) : (
                    regioes.map((r) => (
                      <div
                        key={r.id}
                        className={`flex items-center gap-2 rounded-md border p-2 text-sm ${
                          selecionada === r.id ? "border-primary bg-muted" : ""
                        }`}
                      >
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          onClick={() => {
                            setSelecionada(r.id);
                            if (r.geometria) focar(limites(r.geometria));
                          }}
                        >
                          <span
                            className="size-3 shrink-0 rounded-sm"
                            style={{ background: corDe(r.vendedorId) }}
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{r.nome}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {r.vendedorNome ?? "Região livre"} ·{" "}
                              {r.tipo === "municipio" ? `Município ${r.municipioNome ?? ""} - ${r.uf ?? ""}` : "Área desenhada"}
                            </span>
                          </span>
                        </button>
                        {podeEditar && (
                          <div className="flex shrink-0 gap-0.5">
                            {r.tipo === "area" && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-7"
                                title="Editar desenho"
                                disabled={modo.tipo !== "normal"}
                                onClick={() => {
                                  if (r.geometria) focar(limites(r.geometria));
                                  setModo({ tipo: "editar", regiaoId: r.id });
                                }}
                              >
                                <Shapes className="size-3.5" />
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7"
                              title="Nome e vendedor"
                              onClick={() => {
                                setEditando(r);
                                setFormEdicao({ nome: r.nome, vendedorId: r.vendedorId ?? "livre" });
                              }}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7"
                              title="Excluir"
                              onClick={() => {
                                if (confirm(`Excluir a região "${r.nome}"?`)) remover.mutate(r.id);
                              }}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>

              <TabsContent value="invasoes" className="flex min-h-0 flex-1 flex-col gap-3">
                <p className="text-xs text-muted-foreground">
                  Clientes ativos da carteira de um vendedor que estão dentro da região de outro.
                  {invasoes ? ` ${invasoes.avaliados.toLocaleString("pt-BR")} clientes avaliados.` : ""}
                </p>
                {invasoes && invasoes.porVendedor.length > 0 && (
                  <div className="rounded-md border text-xs">
                    <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 border-b px-2 py-1 font-medium">
                      <span>Vendedor</span>
                      <span title="Clientes dele em região de outro">Fora</span>
                      <span title="Clientes de outros na região dele">Dentro</span>
                    </div>
                    {invasoes.porVendedor.map((v) => (
                      <div key={v.vendedorId} className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-2 py-1">
                        <span className="flex items-center gap-1.5 truncate">
                          <span className="size-2.5 shrink-0 rounded-sm" style={{ background: corDe(v.vendedorId) }} />
                          {v.vendedorNome}
                        </span>
                        <span className="text-right tabular-nums">{v.invadindo}</span>
                        <span className="text-right tabular-nums">{v.invadido}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
                  {!invasoes ? (
                    <Skeleton className="h-24 w-full" />
                  ) : invasoes.invasoes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {regioes.some((r) => r.vendedorId)
                        ? "Nenhuma invasão: todos os clientes estão em regiões do próprio vendedor ou livres."
                        : "Atribua regiões a vendedores para apurar as invasões."}
                    </p>
                  ) : (
                    invasoes.invasoes.map((i) => (
                      <button
                        key={i.clienteId}
                        type="button"
                        className="block w-full rounded-md border p-2 text-left text-xs hover:bg-muted"
                        onClick={() => {
                          if (i.latitude != null && i.longitude != null) {
                            focar([
                              [i.latitude - 0.004, i.longitude - 0.004],
                              [i.latitude + 0.004, i.longitude + 0.004],
                            ]);
                          }
                        }}
                      >
                        <span className="block truncate text-sm font-medium">{i.razaoSocial}</span>
                        <span className="block text-muted-foreground">
                          {i.municipio}
                          {i.uf ? ` - ${i.uf}` : ""}
                          {i.porMunicipio && (
                            <Badge variant="outline" className="ml-1 px-1 py-0 text-[10px]">
                              pelo município
                            </Badge>
                          )}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1">
                          <span className="font-medium" style={{ color: corDe(i.vendedorId) }}>
                            {i.vendedorNome}
                          </span>
                          <span className="text-muted-foreground">na região de</span>
                          {i.regioes.map((r) => (
                            <span key={r.id} className="font-medium" style={{ color: corDe(r.vendedorId) }}>
                              {r.vendedorNome} ({r.nome})
                            </span>
                          ))}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* isolate: os z-index do Leaflet (400–1000) não passam por cima do menu. */}
        <div className="relative isolate min-h-[420px] flex-1 overflow-hidden rounded-lg border">
          <RegioesMapaLeaflet
            regioes={regioes}
            invasoes={invasoes?.invasoes ?? []}
            corDe={corDe}
            modo={modo}
            foco={foco}
            centroInicial={centroInicial}
            editadoRef={editadoRef}
            onDesenhado={(g) => {
              setModo({ tipo: "normal" });
              setFormNovo({ nome: "", vendedorId: "livre" });
              setDesenho(g);
            }}
            onSelecionar={setSelecionada}
          />
        </div>
      </div>

      {/* Área desenhada: nome e dono. */}
      <Dialog open={!!desenho} onOpenChange={(a) => !a && setDesenho(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova área</DialogTitle>
          </DialogHeader>
          <CamposRegiao form={formNovo} onChange={setFormNovo} vendedores={vendedores} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDesenho(null)}>
              Descartar
            </Button>
            <Button
              disabled={!formNovo.nome.trim() || criar.isPending}
              onClick={() =>
                desenho &&
                criar.mutate({
                  nome: formNovo.nome.trim(),
                  vendedorId: vendedorDoForm(formNovo.vendedorId),
                  tipo: "area",
                  geometria: desenho,
                })
              }
            >
              {criar.isPending && <Loader2 className="size-4 animate-spin" />}
              Criar região
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DialogMunicipio
        aberto={municipioAberto}
        onOpenChange={setMunicipioAberto}
        vendedores={vendedores}
        salvando={criar.isPending}
        onCriar={(municipio, form) =>
          criar.mutate({
            nome: form.nome.trim() || `${municipio.nome} - ${municipio.uf}`,
            vendedorId: vendedorDoForm(form.vendedorId),
            tipo: "municipio",
            municipioId: municipio.id,
          })
        }
      />

      {/* Nome e dono de uma região existente. */}
      <Dialog open={!!editando} onOpenChange={(a) => !a && setEditando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar região</DialogTitle>
          </DialogHeader>
          <CamposRegiao form={formEdicao} onChange={setFormEdicao} vendedores={vendedores} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button
              disabled={!formEdicao.nome.trim() || atualizar.isPending}
              onClick={() =>
                editando &&
                atualizar.mutate({
                  id: editando.id,
                  body: {
                    nome: formEdicao.nome.trim(),
                    vendedorId: vendedorDoForm(formEdicao.vendedorId),
                  },
                })
              }
            >
              {atualizar.isPending && <Loader2 className="size-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CamposRegiao({
  form,
  onChange,
  vendedores,
  nomeOpcional = false,
}: {
  form: FormRegiao;
  onChange: (f: FormRegiao) => void;
  vendedores: Array<{ id: string; nome: string }>;
  nomeOpcional?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <FieldLabel htmlFor="regiao-nome">Nome{nomeOpcional ? " (opcional)" : ""}</FieldLabel>
        <Input
          id="regiao-nome"
          value={form.nome}
          maxLength={100}
          placeholder={nomeOpcional ? "Usa o nome do município" : "Ex.: Centro, Zona Norte"}
          onChange={(e) => onChange({ ...form, nome: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel>Vendedor</FieldLabel>
        <Select value={form.vendedorId} onValueChange={(v) => onChange({ ...form, vendedorId: v })}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="livre">Região livre (sem vendedor)</SelectItem>
            {vendedores.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function DialogMunicipio({
  aberto,
  onOpenChange,
  vendedores,
  salvando,
  onCriar,
}: {
  aberto: boolean;
  onOpenChange: (a: boolean) => void;
  vendedores: Array<{ id: string; nome: string }>;
  salvando: boolean;
  onCriar: (m: VendedorRegiaoMunicipioOpcao, form: FormRegiao) => void;
}) {
  const [uf, setUf] = useState("MS");
  const [busca, setBusca] = useState("");
  const [escolhido, setEscolhido] = useState<VendedorRegiaoMunicipioOpcao | null>(null);
  const [form, setForm] = useState<FormRegiao>({ nome: "", vendedorId: "livre" });
  const { data: opcoes = [], isFetching } = useQuery({
    queryKey: ["vendedor-regioes", "municipios", uf, busca],
    queryFn: () =>
      apiFetch<VendedorRegiaoMunicipioOpcao[]>("/vendedor-regioes/municipios", {
        query: { uf, busca: busca || undefined },
      }),
    enabled: aberto,
  });

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Município inteiro como região</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-[6rem_1fr] gap-2">
          <Select
            value={uf}
            onValueChange={(v) => {
              setUf(v);
              setEscolhido(null);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UFS.map((u) => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={busca}
            placeholder="Buscar município"
            onChange={(e) => {
              setBusca(e.target.value);
              setEscolhido(null);
            }}
          />
        </div>
        <div className="max-h-48 overflow-y-auto rounded-md border text-sm">
          {isFetching && opcoes.length === 0 ? (
            <p className="p-2 text-muted-foreground">Buscando…</p>
          ) : opcoes.length === 0 ? (
            <p className="p-2 text-muted-foreground">Nenhum município encontrado.</p>
          ) : (
            opcoes.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setEscolhido(m)}
                className={`flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-muted ${
                  escolhido?.id === m.id ? "bg-muted font-medium" : ""
                }`}
              >
                <MapPinned className="size-3.5 text-muted-foreground" />
                {m.nome} - {m.uf}
              </button>
            ))
          )}
        </div>
        <CamposRegiao form={form} onChange={setForm} vendedores={vendedores} nomeOpcional />
        <p className="text-xs text-muted-foreground">
          A divisa do município vem do IBGE. Cliente sem coordenada entra pelo município do cadastro.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!escolhido || salvando} onClick={() => escolhido && onCriar(escolhido, form)}>
            {salvando && <Loader2 className="size-4 animate-spin" />}
            Criar região
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
