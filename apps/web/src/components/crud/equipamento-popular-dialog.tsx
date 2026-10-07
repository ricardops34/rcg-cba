"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  EquipamentoPopular,
  EquipamentoPopularCategoria,
  EquipamentoPopularResultado,
} from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { FilterMultiSelect } from "@/components/crud/filter-multi-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const RECURSO = "equipamentos-comodato";

/**
 * "Popular pelas notas" com filtro de categoria e de período da remessa.
 * Montado só com o diálogo aberto, então cada abertura começa do padrão:
 * as categorias marcadas como de equipamento já vêm selecionadas.
 */
export function EquipamentoPopularDialog({
  open,
  onOpenChange,
  onPopulado,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPopulado: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open && (
          <Formulario onCancelar={() => onOpenChange(false)} onPopulado={onPopulado} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Formulario({
  onCancelar,
  onPopulado,
}: {
  onCancelar: () => void;
  onPopulado: () => void;
}) {
  // null = ainda não escolheu: usa as marcadas como equipamento.
  const [escolhidas, setEscolhidas] = useState<string[] | null>(null);
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  const { data: categorias, isLoading } = useQuery({
    queryKey: [RECURSO, "popular", "categorias"],
    queryFn: () =>
      apiFetch<EquipamentoPopularCategoria[]>(`/${RECURSO}/popular/categorias`),
  });

  const categoriaIds =
    escolhidas ?? (categorias ?? []).filter((c) => c.equipamento).map((c) => c.id);
  const periodoInvalido = !!dataInicio && !!dataFim && dataInicio > dataFim;

  const popular = useMutation({
    mutationFn: () => {
      const body: EquipamentoPopular = {
        ...(categoriaIds.length ? { categoriaIds } : {}),
        ...(dataInicio ? { dataInicio } : {}),
        ...(dataFim ? { dataFim } : {}),
      };
      return apiFetch<EquipamentoPopularResultado>(`/${RECURSO}/popular`, {
        method: "POST",
        body,
      });
    },
    onSuccess: (r) => {
      const partes = [
        r.criados > 0 && `${r.criados} cadastrado(s)`,
        r.existentes > 0 && `${r.existentes} já estava(m) no cadastro`,
      ].filter(Boolean);
      const mensagem = partes.length
        ? `${partes.join(" · ")}.`
        : "Nenhuma remessa de comodato com produto ativo nesse filtro.";
      if (r.criados > 0) toast.success(mensagem);
      else toast.info(mensagem);
      onPopulado();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Não foi possível popular"),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Popular pelas notas de comodato</DialogTitle>
        <DialogDescription>
          Cadastra como equipamento os produtos que saíram em remessa de comodato (CFOP
          5908/6908) e ainda não estão no cadastro — o que foi excluído é gerado de novo.
          Produto bloqueado não entra, e o que já está no cadastro não muda. Os produtos
          aplicáveis não são gravados aqui: cada equipamento mostra sugestões no detalhe,
          para você confirmar.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Categorias</Label>
          {isLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <FilterMultiSelect
              value={categoriaIds}
              onChange={setEscolhidas}
              placeholder="Todas as categorias"
              searchPlaceholder="Buscar categoria..."
              emptyMessage="Nenhuma remessa de comodato encontrada."
              options={(categorias ?? []).map((c) => ({
                value: c.id,
                label: `${c.descricao} (${c.produtos})${c.equipamento ? " · equipamento" : ""}`,
                searchText: `${c.codigoErp ?? ""} ${c.descricao}`,
              }))}
            />
          )}
          <p className="text-xs text-muted-foreground">
            Vêm marcadas as categorias de equipamento. Entre parênteses, quantos produtos
            ativos de cada uma já saíram em comodato.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="popular-inicio">Remessas de</Label>
            <Input
              id="popular-inicio"
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="popular-fim">até</Label>
            <Input
              id="popular-fim"
              type="date"
              value={dataFim}
              aria-invalid={periodoInvalido || undefined}
              onChange={(e) => setDataFim(e.target.value)}
            />
          </div>
        </div>
        {periodoInvalido ? (
          <p className="text-xs text-destructive">A data inicial não pode ser depois da final.</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Pela emissão da nota. Em branco, todo o histórico.
          </p>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button
          disabled={popular.isPending || isLoading || periodoInvalido}
          onClick={() => popular.mutate()}
        >
          {popular.isPending ? "Populando..." : "Popular"}
        </Button>
      </DialogFooter>
    </>
  );
}
