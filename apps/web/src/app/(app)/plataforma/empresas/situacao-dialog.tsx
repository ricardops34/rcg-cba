"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  SITUACAO_EMPRESA_LABEL,
  type PlataformaEmpresa,
  type SituacaoEmpresa,
} from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { paraCampoData, paraIsoFimDoDia } from "@/lib/data-avaliacao";

const SITUACOES: SituacaoEmpresa[] = ["teste", "ativa", "suspensa", "cancelada"];

export function SituacaoDialog({
  empresa,
  onClose,
  onSaved,
}: {
  empresa: PlataformaEmpresa | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [situacao, setSituacao] = useState<SituacaoEmpresa>("ativa");
  const [testeExpiraEm, setTesteExpiraEm] = useState("");
  const [limiteUsuarios, setLimiteUsuarios] = useState("");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Recarrega os campos a cada empresa aberta; sem isto o diálogo mostraria os
  // valores da empresa anterior no instante em que abre.
  useEffect(() => {
    if (!empresa) return;
    setSituacao(empresa.situacao);
    setTesteExpiraEm(paraCampoData(empresa.testeExpiraEm));
    setLimiteUsuarios(
      empresa.limiteUsuarios === null ? "" : String(empresa.limiteUsuarios),
    );
    setMotivo("");
  }, [empresa]);

  if (!empresa) return null;

  const limiteNumero = limiteUsuarios.trim() === "" ? null : Number(limiteUsuarios);
  const limiteInvalido =
    limiteNumero !== null && (!Number.isInteger(limiteNumero) || limiteNumero < 1);
  const limiteAbaixoDoUso =
    limiteNumero !== null && limiteNumero < empresa.usuariosAtivos;

  const salvar = async () => {
    if (limiteInvalido) return;
    setSalvando(true);
    try {
      await apiFetch(`/plataforma/empresas/${empresa.id}/situacao`, {
        method: "PATCH",
        body: {
          situacao,
          testeExpiraEm: situacao === "teste" ? paraIsoFimDoDia(testeExpiraEm) : null,
          limiteUsuarios: limiteNumero,
          ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
        },
      });
      onSaved();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Erro ao atualizar a empresa",
      );
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{empresa.nomeFantasia}</DialogTitle>
          <DialogDescription>
            Situação, prazo de avaliação e teto de usuários desta empresa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="situacao">Situação</Label>
            <Select
              value={situacao}
              onValueChange={(v) => setSituacao(v as SituacaoEmpresa)}
            >
              <SelectTrigger id="situacao">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SITUACOES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {SITUACAO_EMPRESA_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(situacao === "suspensa" || situacao === "cancelada") && (
              <p className="text-xs text-muted-foreground">
                Ninguém desta empresa conseguirá entrar enquanto ela estiver
                {situacao === "suspensa" ? " suspensa" : " cancelada"}.
              </p>
            )}
          </div>

          {situacao === "teste" && (
            <div className="space-y-2">
              <Label htmlFor="teste">Teste até</Label>
              <Input
                id="teste"
                type="date"
                value={testeExpiraEm}
                onChange={(e) => setTesteExpiraEm(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Vale o dia inteiro. Em branco, a avaliação segue sem prazo até
                alguém encerrar.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="limite">Limite de usuários</Label>
            <Input
              id="limite"
              type="number"
              min={1}
              placeholder="sem limite"
              value={limiteUsuarios}
              onChange={(e) => setLimiteUsuarios(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Em uso hoje: {empresa.usuariosAtivos}. Em branco, sem limite.
            </p>
            {limiteInvalido && (
              <p className="text-xs text-destructive">
                Informe um número inteiro maior que zero, ou deixe em branco.
              </p>
            )}
            {limiteAbaixoDoUso && !limiteInvalido && (
              // Não bloqueia: reduzir o teto abaixo do uso é legítimo (quem
              // reduziu o contrato), e o efeito é impedir novos cadastros, não
              // desativar quem já está lá.
              <p className="text-xs text-amber-600 dark:text-amber-500">
                Abaixo dos {empresa.usuariosAtivos} em uso. Ninguém é desativado,
                mas nenhum usuário novo poderá ser cadastrado.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="motivo">Motivo (opcional)</Label>
            <Input
              id="motivo"
              placeholder="ex.: renovação de contrato"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">
              Fica registrado no log, junto de quem alterou.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando || limiteInvalido}>
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
