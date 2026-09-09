"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InstitucionalConfig } from "@/components/whatsapp/institucional-config";

/**
 * Conectar o WhatsApp institucional de uma empresa específica, a partir da
 * lista de Administração > Empresas — sem precisar trocar a sessão para
 * aquela empresa primeiro. Reaproveita `InstitucionalConfig` com `empresaId`,
 * que passa a usar as rotas `.../config/empresas/:id/...` (só alcançáveis por
 * administrador da plataforma — mesma trava de `GET /empresas`, a própria
 * listagem que abre este diálogo).
 */
export function ConectarWhatsappDialog({
  aberto,
  onOpenChange,
  empresaId,
  empresaNome,
}: {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  empresaId: string;
  empresaNome: string;
}) {
  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>WhatsApp — {empresaNome}</DialogTitle>
          <DialogDescription>
            Pareamento do número institucional desta empresa.
          </DialogDescription>
        </DialogHeader>
        <InstitucionalConfig empresaId={empresaId} />
      </DialogContent>
    </Dialog>
  );
}
