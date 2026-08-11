"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  TIPO_PARAMETRO_LABEL,
  tipoParametroSchema,
  type ParametroEmpresa,
  type ParametroEmpresaCreate,
  type TipoParametro,
} from "@plataforma/contracts";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Cadastro/edição de um parâmetro. O campo de conteúdo muda conforme o tipo:
 * número, sim/não, data ou senha — a validação equivalente é refeita no
 * servidor, que é quem garante a consistência.
 */
export function ParametroFormDialog({
  parametro,
  aberto,
  onOpenChange,
  onSalvo,
}: {
  /** Ausente = novo parâmetro. */
  parametro?: ParametroEmpresa | null;
  aberto: boolean;
  onOpenChange: (open: boolean) => void;
  onSalvo: () => void;
}) {
  const editando = !!parametro;
  const [chave, setChave] = useState(parametro?.parametro ?? "");
  const [tipo, setTipo] = useState<TipoParametro>(parametro?.tipo ?? "texto");
  const [tamanho, setTamanho] = useState(parametro?.tamanho?.toString() ?? "");
  const [conteudo, setConteudo] = useState(parametro?.conteudo ?? "");
  const [descricao, setDescricao] = useState(parametro?.descricao ?? "");
  const [ativo, setAtivo] = useState(parametro?.ativo ?? true);

  const salvar = useMutation({
    mutationFn: (input: Partial<ParametroEmpresaCreate>) =>
      editando
        ? apiFetch(`/parametros/${parametro.id}`, { method: "PATCH", body: input })
        : apiFetch("/parametros", { method: "POST", body: input }),
    onSuccess: () => {
      toast.success(editando ? "Parâmetro atualizado" : "Parâmetro cadastrado");
      onSalvo();
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar parâmetro"),
  });

  const onConfirmar = () =>
    salvar.mutate({
      parametro: chave.trim().toUpperCase(),
      tipo,
      tamanho: tamanho ? Number(tamanho) : null,
      conteudo: conteudo === "" ? null : conteudo,
      descricao: descricao.trim() || null,
      ativo,
    });

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editando ? `Parâmetro ${parametro.parametro}` : "Novo parâmetro"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!editando && (
            <Field>
              <FieldLabel htmlFor="parametro">Parâmetro</FieldLabel>
              <Input
                id="parametro"
                value={chave}
                maxLength={60}
                placeholder="ORCAMENTO_DIAS_VALIDADE"
                onChange={(e) => setChave(e.target.value.toUpperCase())}
              />
              <FieldDescription>Letras maiúsculas, números e _ ; única por empresa.</FieldDescription>
            </Field>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="tipo">Tipo</FieldLabel>
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoParametro)}>
                <SelectTrigger id="tipo" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tipoParametroSchema.options.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_PARAMETRO_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="tamanho">Tamanho</FieldLabel>
              <Input
                id="tamanho"
                type="number"
                min={1}
                value={tamanho}
                onChange={(e) => setTamanho(e.target.value)}
              />
              <FieldDescription>Limite de caracteres. Em branco = sem limite.</FieldDescription>
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="conteudo">Conteúdo</FieldLabel>
            {tipo === "booleano" ? (
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={conteudo === "true"}
                  onCheckedChange={(v) => setConteudo(v === true ? "true" : "false")}
                />
                {conteudo === "true" ? "Sim" : "Não"}
              </label>
            ) : tipo === "senha" ? (
              <>
                <PasswordInput
                  id="conteudo"
                  value={conteudo}
                  onChange={(e) => setConteudo(e.target.value)}
                />
                {editando && parametro.preenchido && (
                  <FieldDescription>
                    Já existe uma senha gravada. Deixe em branco para mantê-la.
                  </FieldDescription>
                )}
              </>
            ) : (
              <Input
                id="conteudo"
                type={tipo === "numero" ? "number" : tipo === "data" ? "date" : "text"}
                value={conteudo}
                maxLength={tamanho ? Number(tamanho) : undefined}
                onChange={(e) => setConteudo(e.target.value)}
              />
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="descricao">Descrição</FieldLabel>
            <Input
              id="descricao"
              value={descricao}
              maxLength={255}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </Field>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={ativo} onCheckedChange={(v) => setAtivo(v === true)} />
            Ativo
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onConfirmar} disabled={salvar.isPending || (!editando && !chave.trim())}>
            {salvar.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
