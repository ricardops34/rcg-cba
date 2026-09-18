"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import type { ObjetivoVendedorMes, ObjetivoVendedorMesCreate, ObjetivoVendedorMesUpdate } from "@plataforma/contracts";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useResourceMutations } from "@/hooks/use-resource";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type CampoMeta = "valor" | "numeroCliente";

interface Props {
  vendedorId: string;
  nome: string;
  mes: number;
  ano: number;
  campo: CampoMeta;
  children: React.ReactNode;
}

/** Só consulta o cadastro quando o editor abre; salva apenas o campo alterado. */
export function DashboardMetaEditor(props: Props) {
  const [aberto, setAberto] = useState(false);
  const podeVisualizar = useAuthStore((s) => s.hasPermission("objetivos", "visualizar"));
  const podeEditar = useAuthStore((s) => s.hasPermission("objetivos", "editar"));
  const podeCadastrar = useAuthStore((s) => s.hasPermission("objetivos", "cadastrar"));
  if (!podeVisualizar || (!podeEditar && !podeCadastrar)) return props.children;

  const titulo = props.campo === "valor" ? "Objetivo (R$)" : "Positivação (clientes)";
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Editar ${titulo} de ${props.nome}`}
          title={`Editar ${titulo}`}
          onClick={(event) => event.stopPropagation()}
        >
          {props.children}
          <Pencil className="size-3 text-muted-foreground" aria-hidden />
        </button>
      </DialogTrigger>
      <DialogContent onClick={(event) => event.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Editar {titulo}</DialogTitle>
          <DialogDescription>
            {props.nome} · {String(props.mes).padStart(2, "0")}/{props.ano}
          </DialogDescription>
        </DialogHeader>
        {aberto && (
          <CarregarMeta {...props} podeEditar={podeEditar} podeCadastrar={podeCadastrar} fechar={() => setAberto(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

type EditorProps = Props & { podeEditar: boolean; podeCadastrar: boolean; fechar: () => void };

function CarregarMeta(props: EditorProps) {
  const consulta = useQuery({
    queryKey: ["objetivos", "edicao-dashboard", props.vendedorId, props.mes, props.ano],
    queryFn: () => apiFetch<{ data: ObjetivoVendedorMes[] }>("/objetivos", {
      query: { vendedorId: props.vendedorId, mes: props.mes, ano: props.ano, pageSize: 1 },
    }),
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  if (consulta.isPending || consulta.isFetching) return <p role="status">Carregando objetivo…</p>;
  if (consulta.isError) return (
    <div className="space-y-3">
      <p role="alert">Não foi possível carregar o objetivo.</p>
      <Button variant="outline" onClick={() => consulta.refetch()}>Tentar novamente</Button>
    </div>
  );
  const objetivo = consulta.data.data[0];
  if (objetivo && !props.podeEditar) return <p>Você não tem permissão para editar objetivos.</p>;
  if (!objetivo && !props.podeCadastrar) return <p>Não há objetivo neste período. É necessária permissão para cadastrar objetivos.</p>;
  if (objetivo && !objetivo.ativo) return (
    <p>O objetivo deste período está inativo. Ative-o no cadastro de Objetivos antes de editar pelo dashboard.</p>
  );
  return <FormularioMeta {...props} objetivo={objetivo} />;
}

function FormularioMeta({ objetivo, campo, vendedorId, mes, ano, fechar }: EditorProps & { objetivo?: ObjetivoVendedorMes }) {
  const [valor, setValor] = useState(String(objetivo?.[campo] ?? 0));
  const [erro, setErro] = useState<string | null>(null);
  const { create, update } = useResourceMutations<ObjetivoVendedorMesCreate, ObjetivoVendedorMesUpdate>("objetivos");
  const salvando = create.isPending || update.isPending;
  return (
    <form className="space-y-4" onSubmit={async (event) => {
      event.preventDefault();
      if (salvando) return;
      const numero = Number(valor);
      if (!valor.trim() || !Number.isFinite(numero) || numero < 0 || (campo === "numeroCliente" && !Number.isSafeInteger(numero))) {
        setErro(campo === "numeroCliente" ? "Informe uma quantidade inteira igual ou maior que zero." : "Informe um valor igual ou maior que zero.");
        return;
      }
      setErro(null);
      try {
        if (objetivo) {
          await update.mutateAsync({ id: objetivo.id, input: { [campo]: numero } });
        } else {
          await create.mutateAsync({ vendedorId, mes, ano, valor: 0, numeroCliente: 0, ativo: true, categorias: [], [campo]: numero });
        }
        toast.success("Meta atualizada");
        fechar();
      } catch (error) {
        setErro(error instanceof ApiError ? error.message : "Não foi possível salvar a meta. Tente novamente.");
      }
    }}>
      <div className="space-y-2">
        <Label htmlFor="dashboard-meta">{campo === "valor" ? "Objetivo (R$)" : "Positivação (clientes)"}</Label>
        <Input id="dashboard-meta" type="number" min={0} step={campo === "valor" ? "0.01" : "1"}
          required autoFocus value={valor} disabled={salvando}
          aria-invalid={!!erro} aria-describedby={erro ? "dashboard-meta-erro" : undefined}
          onChange={(event) => setValor(event.target.value)} />
        {!objetivo && <p className="text-xs text-muted-foreground">Será criado um objetivo para este vendedor no período selecionado.</p>}
        {erro && <p id="dashboard-meta-erro" role="alert" className="text-sm text-destructive">{erro}</p>}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={salvando} onClick={fechar}>Cancelar</Button>
        <Button type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button>
      </div>
    </form>
  );
}
