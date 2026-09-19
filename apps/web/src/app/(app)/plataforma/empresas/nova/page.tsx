"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  SITUACAO_EMPRESA_LABEL,
  plataformaEmpresaCreateSchema,
  type ConsultaCnpjResultado,
  type SituacaoEmpresa,
} from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Building2,
  Building,
  Search,
  ShieldCheck,
  UserCheck,
  MapPin,
} from "lucide-react";
import { PlataformaGuard } from "../../plataforma-guard";
import { dataEmDias, paraIsoFimDoDia } from "@/lib/data-avaliacao";

const CAMPOS_EMPRESA = [
  ["inscricaoEstadual", "Inscrição estadual", 20],
  ["inscricaoMunicipal", "Inscrição municipal", 20],
  ["cep", "CEP", 10],
  ["endereco", "Endereço e número", 150],
  ["complemento", "Complemento", 100],
  ["bairro", "Bairro", 100],
  ["municipio", "Município", 100],
  ["uf", "UF", 2],
  ["telefone", "Telefone", 20],
  ["telefone2", "Segundo telefone", 20],
  ["email", "E-mail da empresa", 120],
  ["email2", "Segundo e-mail", 120],
  ["site", "Site", 150],
  ["segmentos", "Segmentos de atuação", 300],
] as const;
type CampoEmpresa = (typeof CAMPOS_EMPRESA)[number][0];

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
  const [dadosEmpresa, setDadosEmpresa] = useState<
    Partial<Record<CampoEmpresa, string>>
  >({});
  const [fundadaEm, setFundadaEm] = useState("");
  const [historia, setHistoria] = useState("");
  const [consultandoCnpj, setConsultandoCnpj] = useState(false);
  const cnpjAtual = useRef("");

  const [razaoSocial, setRazaoSocial] = useState("");
  const [nomeFantasia, setNomeFantasia] = useState("");
  const [tipoPessoa, setTipoPessoa] = useState<"fisica" | "juridica">("juridica");
  const [cnpj, setCnpj] = useState("");
  const [alias, setAlias] = useState("");
  const [aliasTocado, setAliasTocado] = useState(false);
  const [situacao, setSituacao] = useState<SituacaoEmpresa>("teste");
  const [testeExpiraEm, setTesteExpiraEm] = useState(dataEmDias(30));
  const [limiteUsuarios, setLimiteUsuarios] = useState("");

  const [adminNome, setAdminNome] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminSenha, setAdminSenha] = useState("");

  /**
   * `null` enquanto não se sabe (e-mail incompleto ou consulta em voo).
   * A tela pede nome e senha só quando a resposta é `false`.
   */
  const [contaExistente, setContaExistente] = useState<boolean | null>(null);

  const emailValido = /.+@.+\..+/.test(adminEmail);

  // Consulta com atraso: sem isso, cada tecla do e-mail viraria uma requisição.
  useEffect(() => {
    if (!emailValido) {
      return;
    }
    let cancelado = false;
    const timer = setTimeout(async () => {
      try {
        const r = await apiFetch<{ existe: boolean; nome?: string }>(
          "/plataforma/contas",
          { query: { email: adminEmail.trim().toLowerCase() } },
        );
        if (cancelado) return;
        setContaExistente(r.existe);
        if (r.existe && r.nome) setAdminNome(r.nome);
      } catch {
        if (!cancelado) setContaExistente(null);
      }
    }, 400);
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [adminEmail, emailValido]);

  const cnpjValido = cnpj.length === (tipoPessoa === "fisica" ? 11 : 14);
  const podeSalvar =
    razaoSocial.trim().length >= 2 &&
    nomeFantasia.trim().length >= 2 &&
    cnpjValido &&
    emailValido &&
    (contaExistente === true ||
      (adminNome.trim().length >= 2 && adminSenha.length >= 8));

  const consultarCnpj = async () => {
    if (tipoPessoa !== "juridica" || !cnpjValido || consultandoCnpj) return;
    const consultado = cnpj;
    setConsultandoCnpj(true);
    try {
      const dados = await apiFetch<ConsultaCnpjResultado>(
        "/plataforma/consulta-cnpj/" + consultado,
      );
      if (cnpjAtual.current !== consultado) return;
      setRazaoSocial(dados.razaoSocial ?? "");
      const fantasia = dados.nomeFantasia || dados.razaoSocial || "";
      setNomeFantasia(fantasia);
      if (!aliasTocado) setAlias(sugerirAlias(fantasia));
      setDadosEmpresa((anterior) => ({
        ...anterior,
        ...Object.fromEntries(
          (
            [
              "endereco",
              "complemento",
              "bairro",
              "municipio",
              "uf",
              "cep",
              "telefone",
              "telefone2",
              "email",
            ] as const
          )
            .filter((campo) => dados[campo] != null)
            .map((campo) => [campo, dados[campo]]),
        ),
      }));
      toast.success("Dados do CNPJ preenchidos. Confira antes de salvar.");
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Não foi possível consultar o CNPJ",
      );
    } finally {
      setConsultandoCnpj(false);
    }
  };

  const salvar = async () => {
    if (!podeSalvar) return;
    setSalvando(true);
    try {
      await apiFetch("/plataforma/empresas", {
        method: "POST",
        body: plataformaEmpresaCreateSchema.parse({
          ...dadosEmpresa,
          fundadaEm: fundadaEm
            ? new Date(fundadaEm + "T12:00:00Z").toISOString()
            : null,
          historia,
          razaoSocial: razaoSocial.trim(),
          nomeFantasia: nomeFantasia.trim(),
          cnpj,
          tipoPessoa,
          alias: alias.trim() || null,
          situacao,
          testeExpiraEm:
            situacao === "teste" ? paraIsoFimDoDia(testeExpiraEm) : null,
          limiteUsuarios:
            limiteUsuarios.trim() === "" ? null : Number(limiteUsuarios),
          admin: {
            email: adminEmail.trim().toLowerCase(),
            ...(contaExistente
              ? {}
              : { nome: adminNome.trim(), senha: adminSenha }),
          },
        }),
      });
      toast.success(
        contaExistente
          ? "Empresa criada e vinculada ao administrador existente"
          : "Empresa criada com o administrador dela",
      );
      router.push("/plataforma/empresas");
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Confira os dados informados: e-mails, alias, datas e limite de usuários",
      );
    } finally {
      setSalvando(false);
    }
  };

  return (
    <PlataformaGuard>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push("/plataforma/empresas")}
            className="size-9 shadow-xs"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Nova Empresa Tenant</h1>
            <p className="text-xs text-muted-foreground">
              Cadastre uma nova empresa cliente na plataforma SaaS com usuário administrador inicial.
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="shadow-xs border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="size-4 text-primary" /> Cadastro da Empresa
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nomeFantasia">Nome fantasia</Label>
                <Input
                  id="nomeFantasia"
                  placeholder="ex.: Cuiabá Distribuidora"
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
                  placeholder="ex.: Cuiabá Distribuidora de Bebidas Ltda"
                  value={razaoSocial}
                  onChange={(e) => setRazaoSocial(e.target.value)}
                />
              </div>

              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="tipoPessoa">Tipo de pessoa</Label>
                    <Select
                      value={tipoPessoa}
                      onValueChange={(v) => {
                        setTipoPessoa(v as "fisica" | "juridica");
                        setCnpj("");
                        cnpjAtual.current = "";
                      }}
                    >
                      <SelectTrigger id="tipoPessoa">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="juridica">Pessoa Jurídica (CNPJ)</SelectItem>
                        <SelectItem value="fisica">Pessoa Física (CPF)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cnpj">{tipoPessoa === "fisica" ? "CPF" : "CNPJ"}</Label>
                    <Input
                      id="cnpj"
                      inputMode="numeric"
                      placeholder="somente números"
                      value={cnpj}
                      onChange={(e) => {
                        const valor = somenteDigitos(e.target.value).slice(
                          0,
                          tipoPessoa === "fisica" ? 11 : 14,
                        );
                        cnpjAtual.current = valor;
                        setCnpj(valor);
                      }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={consultarCnpj}
                    disabled={tipoPessoa !== "juridica" || !cnpjValido || consultandoCnpj || salvando}
                    className="gap-2 text-xs"
                  >
                    <Search className="size-3.5" />
                    {consultandoCnpj ? "Consultando Receita..." : "Consultar CNPJ"}
                  </Button>

                  {cnpj.length > 0 && !cnpjValido && (
                    <p className="text-xs text-destructive font-medium">
                      {tipoPessoa === "fisica" ? "CPF exige 11 dígitos." : "CNPJ exige 14 dígitos."}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t">
                <Label htmlFor="alias">Alias / Identificador de Login</Label>
                <Input
                  id="alias"
                  placeholder="ex.: cuiaba-distribuidora"
                  value={alias}
                  onChange={(e) => {
                    setAliasTocado(true);
                    setAlias(e.target.value.toLowerCase());
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Identifica a empresa na URL do login (`?empresa={alias || "..."}`).
                </p>
              </div>

              <div className="border-t pt-4 space-y-4">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <MapPin className="size-4 text-primary" /> Dados Fiscais, Endereço e Contato
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {CAMPOS_EMPRESA.map(([campo, label, maxLength]) => (
                    <div key={campo} className="space-y-1.5">
                      <Label htmlFor={campo} className="text-xs">{label}</Label>
                      <Input
                        id={campo}
                        maxLength={maxLength}
                        type={
                          campo === "email" || campo === "email2"
                            ? "email"
                            : "text"
                        }
                        value={dadosEmpresa[campo] ?? ""}
                        onChange={(e) =>
                          setDadosEmpresa((dados) => ({
                            ...dados,
                            [campo]:
                              campo === "uf"
                                ? e.target.value.toUpperCase()
                                : e.target.value,
                          }))
                        }
                      />
                    </div>
                  ))}
                  <div className="space-y-1.5">
                    <Label htmlFor="fundadaEm" className="text-xs">Data de fundação</Label>
                    <Input
                      id="fundadaEm"
                      type="date"
                      value={fundadaEm}
                      onChange={(e) => setFundadaEm(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="historia" className="text-xs">História da empresa</Label>
                  <Textarea
                    id="historia"
                    maxLength={4000}
                    rows={3}
                    value={historia}
                    onChange={(e) => setHistoria(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="shadow-xs border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="size-4 text-primary" /> Condições de Licença e Acesso
                </CardTitle>
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
                    <div className="flex gap-1.5">
                      {[15, 30, 60].map((dias) => (
                        <Button
                          key={dias}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setTesteExpiraEm(dataEmDias(dias))}
                          className="h-7 text-xs"
                        >
                          {dias} dias
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="limite">Limite de usuários contratados</Label>
                  <Input
                    id="limite"
                    type="number"
                    min={1}
                    placeholder="Deixe em branco para ilimitado"
                    value={limiteUsuarios}
                    onChange={(e) => setLimiteUsuarios(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-xs border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <UserCheck className="size-4 text-primary" /> Administrador da Empresa
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Conta principal para primeiro acesso. Recebe o perfil de Administrador da Empresa.
                </p>

                <div className="space-y-2">
                  <Label htmlFor="adminEmail">E-mail corporativo do Administrador</Label>
                  <Input
                    id="adminEmail"
                    type="email"
                    placeholder="admin@empresa.com.br"
                    value={adminEmail}
                    onChange={(e) => {
                      setContaExistente(null);
                      setAdminEmail(e.target.value);
                    }}
                  />
                </div>

                {contaExistente === true ? (
                  <div className="rounded-lg bg-sky-50 p-3 text-xs text-sky-900 dark:bg-sky-950/60 dark:text-sky-200 border border-sky-200 dark:border-sky-800">
                    <p className="font-semibold flex items-center gap-1.5">
                      <UserCheck className="size-4 text-sky-600 dark:text-sky-400" />
                      Esta conta de usuário já existe na plataforma.
                    </p>
                    <p className="mt-1 leading-relaxed">
                      Ela será vinculada como administradora desta nova empresa mantendo sua credencial e senha atuais.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="adminNome">Nome completo</Label>
                      <Input
                        id="adminNome"
                        placeholder="Nome do responsável"
                        value={adminNome}
                        onChange={(e) => setAdminNome(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="adminSenha">Senha provisória de acesso</Label>
                      <PasswordInput
                        id="adminSenha"
                        value={adminSenha}
                        onChange={(e) => setAdminSenha(e.target.value)}
                      />
                      {adminSenha.length > 0 && adminSenha.length < 8 && (
                        <p className="text-xs text-destructive font-medium">
                          Exige no mínimo 8 caracteres.
                        </p>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            variant="outline"
            onClick={() => router.push("/plataforma/empresas")}
            disabled={salvando}
          >
            Cancelar
          </Button>
          <Button
            onClick={salvar}
            disabled={!podeSalvar || salvando || consultandoCnpj}
            className="gap-2 shadow-xs"
          >
            {salvando ? "Criando Empresa..." : "Criar Empresa Tenant"}
          </Button>
        </div>
      </div>
    </PlataformaGuard>
  );
}

