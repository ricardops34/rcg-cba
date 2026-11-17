"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Lead } from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

type Form = {
  endereco: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  latitude: string;
  longitude: string;
};

const numeroOuNull = (v: string) => {
  const t = v.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
};

/**
 * Endereço do lead (decisão de 16/11/2026): é o que põe o lead no mapa da
 * Posição de Cliente. Com a geolocalização habilitada, as coordenadas vêm do
 * Google ao salvar; digitadas aqui, valem as digitadas.
 */
export function LeadEnderecoDialog({
  lead,
  onOpenChange,
}: {
  lead: Lead | null;
  onOpenChange: (aberto: boolean) => void;
}) {
  return (
    <Dialog open={!!lead} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {lead && (
          <Formulario key={lead.id} lead={lead} fechar={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Formulario({ lead, fechar }: { lead: Lead; fechar: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form>(() => ({
    endereco: lead.endereco ?? "",
    bairro: lead.bairro ?? "",
    municipio: lead.municipio ?? "",
    uf: lead.uf ?? "",
    cep: lead.cep ?? "",
    latitude: lead.latitude != null ? String(lead.latitude) : "",
    longitude: lead.longitude != null ? String(lead.longitude) : "",
  }));
  const muda = (campo: keyof Form, valor: string) =>
    setForm((f) => ({ ...f, [campo]: valor }));

  const salvar = useMutation({
    mutationFn: () =>
      apiFetch<Lead>(`/leads/${lead.id}`, {
        method: "PATCH",
        body: {
          endereco: form.endereco.trim() || null,
          bairro: form.bairro.trim() || null,
          municipio: form.municipio.trim() || null,
          uf: form.uf.trim().toUpperCase() || null,
          cep: form.cep.trim() || null,
          latitude: numeroOuNull(form.latitude),
          longitude: numeroOuNull(form.longitude),
        },
      }),
    onSuccess: (salvo) => {
      void queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success(
        salvo.latitude != null
          ? "Endereço salvo, com coordenadas"
          : "Endereço salvo (sem coordenadas)",
      );
      fechar();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Não foi possível salvar"),
  });

  const campo = (id: keyof Form, rotulo: string, extra?: { className?: string; maxLength?: number }) => (
    <div className={`space-y-1 ${extra?.className ?? ""}`}>
      <FieldLabel htmlFor={`lead-${id}`}>{rotulo}</FieldLabel>
      <Input
        id={`lead-${id}`}
        value={form[id]}
        maxLength={extra?.maxLength}
        onChange={(e) => muda(id, e.target.value)}
      />
    </div>
  );

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        salvar.mutate();
      }}
    >
      <DialogTitle>
        Endereço de {lead.empresaInformada || lead.nome || "lead sem nome"}
      </DialogTitle>
      <div className="grid gap-3 sm:grid-cols-6">
        {campo("endereco", "Endereço (rua e número)", { className: "sm:col-span-6", maxLength: 200 })}
        {campo("bairro", "Bairro", { className: "sm:col-span-3", maxLength: 100 })}
        {campo("cep", "CEP", { className: "sm:col-span-3", maxLength: 9 })}
        {campo("municipio", "Município", { className: "sm:col-span-4", maxLength: 100 })}
        {campo("uf", "UF", { className: "sm:col-span-2", maxLength: 2 })}
        {campo("latitude", "Latitude", { className: "sm:col-span-3" })}
        {campo("longitude", "Longitude", { className: "sm:col-span-3" })}
      </div>
      <FieldDescription>
        Deixe latitude e longitude vazias para o Google preencher ao salvar (quando a
        geolocalização está habilitada). Ao mudar o endereço, elas são buscadas de novo.
      </FieldDescription>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={fechar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={salvar.isPending}>
          {salvar.isPending && <Loader2 className="size-4 animate-spin" />}
          Salvar
        </Button>
      </DialogFooter>
    </form>
  );
}
