"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  SITUACAO_EMPRESA_LABEL,
  type SituacaoEmpresa,
} from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { PlataformaGuard } from "../../plataforma-guard";

/** Dias somados a hoje para o fim do teste, com o dia inteiro contando. */
function dataEmDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function paraIso(valor: string): string | null {
  if (!valor) return null;
  const [ano, mes, dia] = valor.split("-").map(Number);
  return new Date(ano, mes - 1, dia, 23, 59, 59, 999).toISOString();
}

const somenteDigitos = (v: string) => v.replace(/\D/g, "");

/** Sugere o alias a partir do nome fantasia, sem impedir a edição manual. */
const sugerirAlias = (nome: string) =>
  nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

export default function NovaEmpresaPage() {
  const router = useRouter();
  const [salvando, setSalvando] = useState(false);

  const [razaoSocial, setRazaoSocial] = useState("");
  const [nomeFantasia, setNomeFantasia] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [alias, setAlias] = useState("");
  const [aliasTocado, setAliasTocado] = useState(false);
  const [situacao, setSituacao] = useState<SituacaoEmpresa>("teste");
  const [testeExpiraEm, setTesteExpiraEm] = useState(dataEmDias(30));
  const [limiteUsuarios, setLimiteUsuarios] = useState("");

  const [adminNome, setAdminNome] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminSenha, setAdminSenha] = useState("");

  const cnpjValido = cnpj.length === 14;
  const podeSalvar =
    razaoSocial.trim().length >= 2 &&
    nomeFantasia.trim().length >= 2 &&
    cnpjValido &&
    adminNome.trim().length >= 2 &&
    /.+@.+\..+/.test(adminEmail) &&
    adminSenha.length >= 8;

  const salvar = async () => {
    if (!podeSalvar) return;
    setSalvando(true);
    try {
      await apiFetch("/plataforma/empresas", {
        method: "POST",
        body: {
          razaoSocial: razaoSocial.trim(),
          nomeFantasia: nomeFantasia.trim(),
          cnpj,
          alias: alias.trim() || null,
          situacao,
          testeExpiraEm: situacao === "teste" ? paraIso(testeExpiraEm) : null,
          limiteUsuarios:
            limiteUsuarios.trim() === "" ? null : Number(limiteUsuarios),
          admin: {
            nome: adminNome.trim(),
            email: adminEmail.trim().toLowerCase(),
            senha: adminSenha,
          },
        },
      });
      toast.success("Empresa criada com o administrador dela");
      router.push("/plataforma/empresas");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Erro ao criar a empresa",
      );
    } finally {
      setSalvando(false);
    }
  };

  return (
    <PlataformaGuard>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/plataforma/empresas")}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <h1 className="text-lg font-semibold">Nova empresa</h1>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Empresa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nomeFantasia">Nome fantasia</Label>
                <Input
                  id="nomeFantasia"
                  value={nomeFantasia}
                  onChange={(e) => {
                    setNomeFantasia(e.target.value);
                    if (!aliasTocado) setAlias(sugerirAlias(e.target.value));
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="razaoSocial">Razão social</Label>
                <Input
                  id="razaoSocial"
                  value={razaoSocial}
                  onChange={(e) => setRazaoSocial(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cnpj">CNPJ</Label>
                <Input
                  id="cnpj"
                  inputMode="numeric"
                  placeholder="somente números"
                  value={cnpj}
                  onChange={(e) => setCnpj(somenteDigitos(e.target.value).slice(0, 14))}
                />
                {cnpj.length > 0 && !cnpjValido && (
                  <p className="text-xs text-destructive">
                    O CNPJ tem 14 dígitos — faltam {14 - cnpj.length}.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="alias">Alias</Label>
                <Input
                  id="alias"
                  value={alias}
                  onChange={(e) => {
                    setAliasTocado(true);
                    setAlias(e.target.value.toLowerCase());
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Identifica a empresa na tela de login (?empresa={alias || "..."}).
                  Só letras minúsculas, números e hífen.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Acesso</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="situacao">Situação inicial</Label>
                  <Select
                    value={situacao}
                    onValueChange={(v) => setSituacao(v as SituacaoEmpresa)}
                  >
                    <SelectTrigger id="situacao">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["teste", "ativa"] as const).map((s) => (
                        <SelectItem key={s} value={s}>
                          {SITUACAO_EMPRESA_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                    <div className="flex gap-1">
                      {[15, 30, 60].map((dias) => (
                        <Button
                          key={dias}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setTesteExpiraEm(dataEmDias(dias))}
                        >
                          {dias} dias
                        </Button>
                      ))}
                    </div>
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
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Administrador desta empresa
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Criado junto com a empresa: sem ele, ninguém consegue entrar.
                  Recebe o perfil Administrador e troca a senha no primeiro
                  acesso.
                </p>

                <div className="space-y-2">
                  <Label htmlFor="adminNome">Nome</Label>
                  <Input
                    id="adminNome"
                    value={adminNome}
                    onChange={(e) => setAdminNome(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="adminEmail">E-mail</Label>
                  <Input
                    id="adminEmail"
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="adminSenha">Senha provisória</Label>
                  <PasswordInput
                    id="adminSenha"
                    value={adminSenha}
                    onChange={(e) => setAdminSenha(e.target.value)}
                  />
                  {adminSenha.length > 0 && adminSenha.length < 8 && (
                    <p className="text-xs text-destructive">
                      Mínimo de 8 caracteres.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => router.push("/plataforma/empresas")}
            disabled={salvando}
          >
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={!podeSalvar || salvando}>
            {salvando ? "Criando..." : "Criar empresa"}
          </Button>
        </div>
      </div>
    </PlataformaGuard>
  );
}
