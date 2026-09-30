"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { GrupoContexto, GrupoEconomico, GrupoEmpresa, Perfil } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";

export default function GruposPage() {
  const user = useAuthStore((s) => s.user);
  const [selecao, setGrupoId] = useState<string | null | undefined>();
  const { data, error, isLoading } = useQuery({
    queryKey: ["grupos-economicos", user?.id, user?.empresaAtivaId],
    queryFn: () => apiFetch<GrupoContexto>("/grupos-economicos"),
  });
  const grupoId = selecao === undefined ? data?.grupos[0]?.id ?? null : selecao;
  const grupo = data?.grupos.find((g) => g.id === grupoId);
  // Hierarquia Grupo econômico → Empresa: o grupo é criado em Plataforma >
  // Grupos econômicos. Aqui o administrador de uma empresa do grupo edita a
  // descrição, inclui (só empresas que ele administra) e exclui empresas, e
  // cuida dos usuários.
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-xl font-semibold">Grupo econômico</h1><p className="text-sm text-muted-foreground">As empresas que compõem o grupo. O acesso de cada usuário às empresas é marcado no cadastro do usuário.</p></div>
    </div>
    {error && <p role="alert" className="text-destructive">{error.message}</p>}
    {isLoading && <p>Carregando grupo…</p>}
    {data && !grupo && <Card><CardContent className="py-6 text-sm text-muted-foreground">
      Esta empresa não pertence a um grupo econômico. O grupo é criado pela administração da plataforma; depois disso, o administrador de uma empresa do grupo pode editá-lo.
    </CardContent></Card>}
    {data && grupo && <>
      {data.grupos.length > 1 && <div className="flex flex-wrap gap-2" aria-label="Escolher grupo">
        {data.grupos.map((g) => <Button key={g.id} variant={grupoId === g.id ? "default" : "outline"} onClick={() => setGrupoId(g.id)}>{g.descricao} ({g.empresas.length})</Button>)}
      </div>}
      <GrupoForm key={grupo.id} grupo={grupo} disponiveis={data.empresasDisponiveis} onSaved={setGrupoId} rotaEmpresa={(id) => `/admin/empresas/${id}`} rotaVolta="/admin/grupo-economico" />
    </>}
  </div>;
}

/**
 * Mestre/detalhe: o grupo (ID e Descrição) e, abaixo, as empresas dele com
 * Editar e Excluir, mais "Adicionar empresa". Hierarquia Grupo → Empresa e
 * toda empresa tem grupo, então:
 * - **Excluir** tira a empresa do grupo (ela ganha um grupo próprio); não apaga
 *   a empresa, que tem notas, títulos e usuários;
 * - **Adicionar** traz uma empresa de outro grupo (move) ou abre o cadastro de
 *   uma nova, que já nasce neste grupo.
 * Quem pode o quê fica na API (GruposEconomicosService.salvar).
 */
export function GrupoForm({ grupo, disponiveis, onSaved, rotaEmpresa, rotaVolta }: {
  grupo?: GrupoEconomico;
  disponiveis: GrupoEmpresa[];
  onSaved: (id: string) => void;
  /** Onde abre o cadastro completo da empresa (admin ou plataforma). */
  rotaEmpresa: (empresaId: string) => string;
  /** Para onde o cadastro de empresa nova volta ao salvar. */
  rotaVolta: string;
}) {
  const qc = useQueryClient();
  const router = useRouter();
  const [descricao, setDescricao] = useState(grupo?.descricao ?? "");
  const [novasSelecionadas, setNovasSelecionadas] = useState<string[]>([]);
  const [adicionando, setAdicionando] = useState(false);
  const [trazer, setTrazer] = useState("");
  const empresasDoGrupo = grupo?.empresas.map((e) => e.id) ?? [];
  const deOutrosGrupos = disponiveis.filter((e) => !empresasDoGrupo.includes(e.id));

  const salvar = useMutation({
    mutationFn: (body: { descricao: string; empresaIds: string[] }) =>
      apiFetch<{ id: string }>(grupo ? `/grupos-economicos/${grupo.id}` : "/grupos-economicos", {
        method: grupo ? "PUT" : "POST", body,
      }),
    onSuccess: async (g) => {
      await qc.invalidateQueries({ queryKey: ["grupos-economicos"] });
      onSaved(g.id);
      toast.success("Grupo salvo");
    },
    onError: (e) => toast.error(e.message),
  });

  // Grupo novo (só a Plataforma): descrição e as empresas iniciais.
  if (!grupo) {
    return <Card><CardHeader><CardTitle>Cadastrar grupo econômico</CardTitle></CardHeader><CardContent>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); salvar.mutate({ descricao, empresaIds: novasSelecionadas }); }}>
        <Field><FieldLabel htmlFor="grupo-descricao">Descrição</FieldLabel><Input id="grupo-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={120} required minLength={2} /></Field>
        <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Empresas</legend>
          {deOutrosGrupos.map((e) => <label key={e.id} className="flex items-center gap-3 rounded-md border p-3 text-sm">
            <input type="checkbox" checked={novasSelecionadas.includes(e.id)} onChange={(ev) => setNovasSelecionadas(ev.target.checked ? [...novasSelecionadas, e.id] : novasSelecionadas.filter((id) => id !== e.id))} />
            <span>{e.nomeFantasia} <span className="text-muted-foreground">· {e.cnpj} · sai do grupo em que está hoje</span></span>
          </label>)}
        </fieldset>
        <Button type="submit" disabled={salvar.isPending || !novasSelecionadas.length || descricao.trim().length < 2}>{salvar.isPending ? "Salvando…" : "Cadastrar grupo"}</Button>
      </form>
    </CardContent></Card>;
  }

  const excluir = (empresa: GrupoEmpresa) => {
    if (!confirm(`Tirar ${empresa.nomeFantasia} do grupo ${grupo.descricao}? A empresa não é apagada: ela passa a ter um grupo próprio, e os usuários mantêm os vínculos.`)) return;
    salvar.mutate({ descricao: grupo.descricao, empresaIds: empresasDoGrupo.filter((id) => id !== empresa.id) });
  };

  return <div className="space-y-4">
    <Card><CardHeader><CardTitle>Grupo econômico</CardTitle></CardHeader><CardContent>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); salvar.mutate({ descricao, empresaIds: empresasDoGrupo }); }}>
        <Field><FieldLabel>ID</FieldLabel><p className="text-sm text-muted-foreground">{grupo.id}</p></Field>
        <Field><FieldLabel htmlFor="grupo-descricao">Descrição</FieldLabel>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id="grupo-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={120} required minLength={2} />
            <Button type="submit" disabled={salvar.isPending || descricao.trim().length < 2 || descricao.trim() === grupo.descricao}>Salvar</Button>
          </div>
        </Field>
      </form>
    </CardContent></Card>

    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Empresas</CardTitle>
        <Button size="sm" onClick={() => setAdicionando(true)}><Plus className="size-4" /> Adicionar empresa</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Empresa</TableHead><TableHead className="hidden sm:table-cell">CNPJ</TableHead><TableHead className="w-28 text-right">Ações</TableHead></TableRow></TableHeader>
          <TableBody>
            {grupo.empresas.map((e) => <TableRow key={e.id}>
              <TableCell className="font-medium">{e.nomeFantasia}</TableCell>
              <TableCell className="hidden text-muted-foreground sm:table-cell">{e.cnpj}</TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="icon" className="size-8" asChild aria-label={`Editar ${e.nomeFantasia}`}>
                  <Link href={rotaEmpresa(e.id)}><Pencil className="size-4" /></Link>
                </Button>
                <Button variant="ghost" size="icon" className="size-8" aria-label={`Excluir ${e.nomeFantasia} do grupo`}
                  title={grupo.empresas.length === 1 ? "O grupo precisa de ao menos uma empresa" : "Tirar do grupo"}
                  disabled={salvar.isPending || grupo.empresas.length === 1} onClick={() => excluir(e)}>
                  <Trash2 className="size-4" />
                </Button>
              </TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <Dialog open={adicionando} onOpenChange={(v) => { setAdicionando(v); setTrazer(""); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Adicionar empresa ao grupo</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Field><FieldLabel>Empresa já cadastrada</FieldLabel>
            {deOutrosGrupos.length ? <>
              <Select value={trazer} onValueChange={setTrazer}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
                <SelectContent>{deOutrosGrupos.map((e) => <SelectItem key={e.id} value={e.id}>{e.nomeFantasia} · {e.cnpj}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Ela sai do grupo em que está hoje e entra neste, com os usuários dela.</p>
              <Button disabled={!trazer || salvar.isPending} onClick={() => salvar.mutate({ descricao: grupo.descricao, empresaIds: [...empresasDoGrupo, trazer] }, { onSuccess: () => { setAdicionando(false); setTrazer(""); } })}>Incluir no grupo</Button>
            </> : <p className="text-sm text-muted-foreground">Nenhuma outra empresa disponível para você trazer.</p>}
          </Field>
          <div className="border-t pt-4">
            <Button variant="outline" className="w-full" onClick={() => router.push(`/admin/empresas/novo?grupo=${grupo.id}&volta=${encodeURIComponent(rotaVolta)}`)}>
              <Plus className="size-4" /> Cadastrar nova empresa neste grupo
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </div>;
}

/**
 * Cadastro de um usuário novo por quem administra uma empresa de grupo. O
 * perfil é do usuário no grupo inteiro (decisão de 30/09/2026): um só perfil,
 * aplicado a todas as empresas marcadas. Usuário existente tem o acesso
 * editado no próprio cadastro (bloco "Grupo econômico").
 */
export function NovoUsuarioDoGrupo({ grupo }: { grupo: GrupoEconomico }) {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [perfilId, setPerfilId] = useState("");
  const [empresas, setEmpresas] = useState<string[]>([]);
  const { data: perfis } = useQuery({ queryKey: ["perfis", "grupo", user?.empresaAtivaId], queryFn: () => apiFetch<{ data: Perfil[] }>("/perfis", { query: { pageSize: 100, ativo: true } }) });
  const salvar = useMutation({
    mutationFn: () => apiFetch<{ id: string }>(`/grupos-economicos/${grupo.id}/usuarios`, { method: "POST", body: {
      novo: { nome, email, senha },
      vinculos: empresas.map((empresaId) => ({ empresaId, perfilId })),
    } }),
    onSuccess: async (u) => {
      await Promise.all([qc.invalidateQueries({ queryKey: ["grupo-usuarios"] }), qc.invalidateQueries({ queryKey: ["usuarios"] })]);
      toast.success("Usuário criado");
      router.push(`/admin/usuarios/${u.id}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const perfisPermitidos = perfis?.data.filter((p) => !p.administraPlataforma || user?.administradorPlataforma);
  return <Card><CardHeader><CardTitle>Novo usuário</CardTitle></CardHeader><CardContent>
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); salvar.mutate(); }}>
      <div className="grid gap-3 md:grid-cols-3">
        <Field><FieldLabel htmlFor="grupo-usuario-nome">Nome</FieldLabel><Input id="grupo-usuario-nome" value={nome} onChange={(e) => setNome(e.target.value)} required minLength={2} maxLength={120} /></Field>
        <Field><FieldLabel htmlFor="grupo-usuario-email">E-mail de login</FieldLabel><Input id="grupo-usuario-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Field><FieldLabel htmlFor="grupo-usuario-senha">Senha inicial</FieldLabel><PasswordInput id="grupo-usuario-senha" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} required maxLength={128} /></Field>
      </div>
      <Field><FieldLabel htmlFor="grupo-usuario-perfil">Perfil</FieldLabel>
        <Select value={perfilId} onValueChange={setPerfilId}><SelectTrigger id="grupo-usuario-perfil" className="w-full sm:w-72"><SelectValue placeholder="Selecione o perfil" /></SelectTrigger>
          <SelectContent>{perfisPermitidos?.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent></Select>
        <p className="text-xs text-muted-foreground">Vale em todas as empresas marcadas abaixo.</p>
      </Field>
      <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Empresas com acesso</legend>
        {grupo.empresas.map((e) => <label key={e.id} className="flex items-center gap-3 rounded-md border p-3 text-sm">
          <input type="checkbox" checked={empresas.includes(e.id)} onChange={(ev) => setEmpresas(ev.target.checked ? [...empresas, e.id] : empresas.filter((id) => id !== e.id))} />
          {e.nomeFantasia}
        </label>)}
      </fieldset>
      <Button type="submit" disabled={salvar.isPending || !empresas.length || !perfilId}>{salvar.isPending ? "Salvando…" : "Criar usuário"}</Button>
    </form>
  </CardContent></Card>;
}
