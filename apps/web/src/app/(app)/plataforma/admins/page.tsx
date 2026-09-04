"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { PlataformaAdmin } from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
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
import { ShieldMinus, ShieldPlus } from "lucide-react";
import { PlataformaGuard } from "../plataforma-guard";

const formatarData = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR") : "nunca entrou";

export default function PlataformaAdminsPage() {
  const meuId = useAuthStore((s) => s.user?.id);
  const [emailNovo, setEmailNovo] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["plataforma", "admins"],
    queryFn: () => apiFetch<PlataformaAdmin[]>("/plataforma/admins"),
  });

  const admins = data ?? [];
  const ultimo = admins.filter((a) => a.ativo).length <= 1;

  const alterar = async (usuarioId: string, virar: boolean) => {
    setOcupado(true);
    try {
      await apiFetch(`/plataforma/admins/${usuarioId}`, {
        method: "PATCH",
        body: { administradorPlataforma: virar },
      });
      toast.success(virar ? "Administrador promovido" : "Acesso removido");
      void refetch();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Não foi possível alterar",
      );
    } finally {
      setOcupado(false);
    }
  };

  /**
   * Promove pelo e-mail, e a busca acontece no servidor.
   *
   * A tela não procura o usuário em `/usuarios`: aquela rota é do tenant —
   * exige `usuarios.visualizar` e enxerga só a empresa da sessão. Quem
   * administra a plataforma promove gente de qualquer empresa e pode não ter
   * permissão de usuários em lugar nenhum.
   */
  const promover = async () => {
    const email = emailNovo.trim().toLowerCase();
    if (!email) return;
    setOcupado(true);
    try {
      await apiFetch("/plataforma/admins", {
        method: "POST",
        body: { email },
      });
      toast.success("Administrador promovido");
      setEmailNovo("");
      void refetch();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Não foi possível promover",
      );
    } finally {
      setOcupado(false);
    }
  };

  return (
    <PlataformaGuard>
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold">Administradores da plataforma</h1>
          <p className="text-sm text-muted-foreground">
            Quem enxerga e opera este módulo. É um atributo da conta, não um
            perfil — administrar uma empresa não dá este acesso.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Promover alguém</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-64 flex-1 space-y-2">
                <Label htmlFor="email">E-mail do usuário</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="pessoa@empresa.com.br"
                  value={emailNovo}
                  onChange={(e) => setEmailNovo(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void promover()}
                />
              </div>
              <Button onClick={promover} disabled={ocupado || !emailNovo.trim()}>
                <ShieldPlus className="size-4" /> Promover
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              A conta precisa existir. A busca é feita em toda a base, não só na
              empresa da sua sessão.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Administradores atuais {admins.length > 0 && `(${admins.length})`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Último acesso</TableHead>
                  <TableHead className="w-32" />
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
                      Nenhum administrador da plataforma.
                    </TableCell>
                  </TableRow>
                )}
                {admins.map((a) => {
                  const souEu = a.id === meuId;
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">
                        {a.nome}
                        {souEu && (
                          <Badge variant="secondary" className="ml-2">
                            você
                          </Badge>
                        )}
                        {!a.ativo && (
                          <Badge variant="outline" className="ml-2">
                            inativo
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {a.email}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatarData(a.ultimoLogin)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={ocupado || souEu || ultimo}
                          title={
                            souEu
                              ? "Você não pode remover a si mesmo"
                              : ultimo
                                ? "É o único administrador — promova outro antes"
                                : undefined
                          }
                          onClick={() => alterar(a.id, false)}
                        >
                          <ShieldMinus className="size-4" /> Remover
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </PlataformaGuard>
  );
}
