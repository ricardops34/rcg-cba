"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { PlataformaEmpresaAdmin } from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserMinus, UserPlus, Users } from "lucide-react";


/**
 * Quem administra esta empresa.
 *
 * A regra do negócio: todo cadastro nasce com um administrador, e a **mesma
 * conta pode administrar várias empresas** — em cada uma ela ocupa uma vaga do
 * limite de usuários, porque a vaga é do vínculo, não da pessoa.
 *
 * Por isso a coluna "Administra": deixa claro que remover alguém daqui não
 * apaga a conta, que segue respondendo pelas outras empresas dela.
 */
export function AdministradoresSection({ empresaId }: { empresaId: string }) {
  const [email, setEmail] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["plataforma", "empresas", empresaId, "administradores"],
    queryFn: () =>
      apiFetch<PlataformaEmpresaAdmin[]>(
        `/plataforma/empresas/${empresaId}/administradores`,
      ),
  });

  const admins = data ?? [];
  const ultimo = admins.length <= 1;

  const vincular = async () => {
    const alvo = email.trim().toLowerCase();
    if (!alvo) return;
    setOcupado(true);
    try {
      await apiFetch(`/plataforma/empresas/${empresaId}/administradores`, {
        method: "POST",
        body: { email: alvo },
      });
      toast.success("Conta vinculada como administradora desta empresa");
      setEmail("");
      void refetch();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Não foi possível vincular",
      );
    } finally {
      setOcupado(false);
    }
  };

  const desvincular = async (admin: PlataformaEmpresaAdmin) => {
    const aviso =
      admin.empresasQueAdministra > 1
        ? `Remover ${admin.nome} da administração desta empresa? A conta continua administrando as outras ${admin.empresasQueAdministra - 1}.`
        : `Remover ${admin.nome} da administração desta empresa?`;
    if (!confirm(aviso)) return;
    setOcupado(true);
    try {
      await apiFetch(
        `/plataforma/empresas/${empresaId}/administradores/${admin.usuarioId}`,
        { method: "DELETE" },
      );
      toast.success("Conta removida da administração desta empresa");
      void refetch();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Não foi possível remover",
      );
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Card className="shadow-xs border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Users className="size-4 text-primary" /> Administradores desta Empresa
          </span>
          {admins.length > 0 && (
            <Badge variant="secondary" className="font-normal">
              {admins.length} administrador(es)
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1 space-y-1.5">
            <Label htmlFor="novoAdmin" className="text-xs font-medium">Vincular conta existente</Label>
            <Input
              id="novoAdmin"
              type="email"
              placeholder="pessoa@empresa.com.br"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void vincular()}
            />
          </div>
          <Button onClick={vincular} disabled={ocupado || !email.trim()} className="gap-2 shadow-xs">
            <UserPlus className="size-4" /> Vincular
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          A conta precisa já existir na plataforma. Ao vincular, ela assume a administração desta empresa mantendo a mesma senha.
        </p>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead className="w-36">Empresas Gerenciadas</TableHead>
              <TableHead className="w-28 text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                  Carregando administradores...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && admins.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                  Nenhum administrador vinculado a esta empresa.
                </TableCell>
              </TableRow>
            )}
            {admins.map((a) => (
              <TableRow key={a.usuarioId}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-xs shrink-0">
                      {a.nome?.charAt(0).toUpperCase() ?? "U"}
                    </div>
                    <div>
                      <span>{a.nome}</span>
                      {!a.ativo && (
                        <Badge variant="outline" className="ml-2 text-[10px] border-amber-500/50 text-amber-600">
                          inativo
                        </Badge>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs font-mono">{a.email}</TableCell>
                <TableCell>
                  {a.empresasQueAdministra > 1 ? (
                    <Badge variant="secondary" className="text-xs">
                      {a.empresasQueAdministra} empresas
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">Somente esta</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={ocupado || ultimo}
                    title={
                      ultimo
                        ? "É o único administrador desta empresa — vincule outro antes de remover"
                        : undefined
                    }
                    onClick={() => desvincular(a)}
                    className="gap-1.5 text-xs hover:text-destructive"
                  >
                    <UserMinus className="size-3.5" /> Remover
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

