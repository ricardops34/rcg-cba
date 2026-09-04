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
import { UserMinus, UserPlus } from "lucide-react";

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
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Administradores desta empresa {admins.length > 0 && `(${admins.length})`}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-64 flex-1 space-y-2">
            <Label htmlFor="novoAdmin">Vincular conta existente</Label>
            <Input
              id="novoAdmin"
              type="email"
              placeholder="pessoa@empresa.com.br"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void vincular()}
            />
          </div>
          <Button onClick={vincular} disabled={ocupado || !email.trim()}>
            <UserPlus className="size-4" /> Vincular
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          A conta precisa existir e passa a administrar esta empresa também,
          mantendo a senha que já usa. Ocupa uma vaga do limite de usuários
          daqui.
        </p>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead className="w-32">Administra</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && admins.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  Nenhum administrador nesta empresa.
                </TableCell>
              </TableRow>
            )}
            {admins.map((a) => (
              <TableRow key={a.usuarioId}>
                <TableCell className="font-medium">
                  {a.nome}
                  {!a.ativo && (
                    <Badge variant="outline" className="ml-2">
                      inativo
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{a.email}</TableCell>
                <TableCell>
                  {a.empresasQueAdministra > 1 ? (
                    <Badge variant="secondary">
                      {a.empresasQueAdministra} empresas
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">só esta</span>
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={ocupado || ultimo}
                    title={
                      ultimo
                        ? "É o único administrador — vincule outro antes"
                        : undefined
                    }
                    onClick={() => desvincular(a)}
                  >
                    <UserMinus className="size-4" /> Remover
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
