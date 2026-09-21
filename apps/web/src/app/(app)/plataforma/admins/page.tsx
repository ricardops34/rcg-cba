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
import {
  ShieldCheck,
  ShieldPlus,
  ShieldMinus,
  Users,
  UserCheck,
  Shield,
  Info,
} from "lucide-react";
import { PlataformaGuard } from "../plataforma-guard";

const formatarData = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR") : "Nunca acessou";

export default function PlataformaAdminsPage() {
  const meuId = useAuthStore((s) => s.user?.id);
  const [emailNovo, setEmailNovo] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["plataforma", "admins"],
    queryFn: () => apiFetch<PlataformaAdmin[]>("/plataforma/admins"),
  });

  const admins = data ?? [];
  const totalAdmins = admins.length;
  const totalAtivos = admins.filter((a) => a.ativo).length;
  const ultimo = totalAtivos <= 1;

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

  const promover = async () => {
    const email = emailNovo.trim().toLowerCase();
    if (!email) return;
    setOcupado(true);
    try {
      await apiFetch("/plataforma/admins", {
        method: "POST",
        body: { email },
      });
      toast.success("Administrador promovido com sucesso");
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
      <div className="space-y-6">
        {/* Superior Header */}
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-xs">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">
                Administradores da Plataforma
              </h1>
              <Badge variant="outline" className="text-xs">Superadmin Global</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Gerenciamento de acesso ao módulo de administração global do SaaS e supervisão de empresas.
            </p>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="shadow-xs border-border/60">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Administradores Globais</p>
                <p className="text-2xl font-bold tracking-tight mt-1">{totalAdmins}</p>
              </div>
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Shield className="size-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-xs border-border/60">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Contas Ativas</p>
                <p className="text-2xl font-bold tracking-tight mt-1 text-emerald-600 dark:text-emerald-400">
                  {totalAtivos}
                </p>
              </div>
              <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                <UserCheck className="size-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-xs border-border/60">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Seu Perfil Atual</p>
                <p className="text-sm font-semibold tracking-tight mt-1 text-primary">
                  Administrador Plataforma
                </p>
              </div>
              <div className="flex size-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
                <Users className="size-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Promover Admin Card */}
        <Card className="shadow-xs border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldPlus className="size-4 text-primary" /> Promover Novo Administrador
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-64 flex-1 space-y-1.5">
                <Label htmlFor="email" className="text-xs font-medium">E-mail do usuário</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="usuario@empresa.com.br"
                  value={emailNovo}
                  onChange={(e) => setEmailNovo(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void promover()}
                />
              </div>
              <Button
                onClick={promover}
                disabled={ocupado || !emailNovo.trim()}
                className="gap-2 shadow-xs"
              >
                <ShieldPlus className="size-4" /> Promover para Admin
              </Button>
            </div>
            <div className="flex items-start gap-2 rounded-md bg-muted/60 p-2.5 text-xs text-muted-foreground">
              <Info className="size-4 text-primary shrink-0 mt-0.5" />
              <p>
                A conta precisa já existir na plataforma. A busca é realizada globalmente em todas as empresas tenants.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Lista de Admins Card */}
        <Card className="shadow-xs border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Users className="size-4 text-primary" /> Administradores Atuais
              </span>
              {admins.length > 0 && (
                <Badge variant="secondary" className="font-normal">
                  {admins.length} registrado(s)
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Administrador</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Último Acesso</TableHead>
                  <TableHead className="w-36 text-right">Ação</TableHead>
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
                      Nenhum administrador da plataforma encontrado.
                    </TableCell>
                  </TableRow>
                )}
                {admins.map((a) => {
                  const souEu = a.id === meuId;
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2.5">
                          <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-xs">
                            {a.nome?.charAt(0).toUpperCase() ?? "U"}
                          </div>
                          <div>
                            <span className="font-medium">{a.nome}</span>
                            {souEu && (
                              <Badge variant="secondary" className="ml-2 text-[10px]">
                                você
                              </Badge>
                            )}
                            {!a.ativo && (
                              <Badge variant="outline" className="ml-2 text-[10px] border-amber-500/50 text-amber-600">
                                inativo
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs font-mono">
                        {a.email}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {formatarData(a.ultimoLogin)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={ocupado || souEu || ultimo}
                          title={
                            souEu
                              ? "Você não pode remover seu próprio acesso"
                              : ultimo
                                ? "Único administrador ativo da plataforma"
                                : undefined
                          }
                          onClick={() => alterar(a.id, false)}
                          className="gap-1.5 text-xs hover:text-destructive"
                        >
                          <ShieldMinus className="size-3.5" /> Remover
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

