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
import { ArrowLeft } from "lucide-react";
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
        // Preenche o nome só para exibição; o servidor ignora nome de conta
        // que já existe.
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
    // Conta que já existe dispensa nome e senha — é vinculada, não criada.
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
            // Conta que ja existe e vinculada: mandar nome e senha aqui daria a
            // entender que a conta dela seria alterada, e o servidor ignora.
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
                <Label htmlFor="tipoPessoa">Tipo de pessoa</Label>
                <select id="tipoPessoa" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={tipoPessoa}
                  onChange={(e) => { setTipoPessoa(e.target.value as "fisica" | "juridica"); setCnpj(""); cnpjAtual.current = ""; }}>
                  <option value="juridica">Pessoa Jurídica</option>
                  <option value="fisica">Pessoa Física</option>
                </select>
                <Label htmlFor="cnpj">{tipoPessoa === "fisica" ? "CPF" : "CNPJ"}</Label>
                <Input
                  id="cnpj"
                  inputMode="numeric"
                  placeholder="somente números"
                  value={cnpj}
                  onChange={(e) => {
                    const valor = somenteDigitos(e.target.value).slice(0, tipoPessoa === "fisica" ? 11 : 14);
                    cnpjAtual.current = valor;
                    setCnpj(valor);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={consultarCnpj}
                  disabled={tipoPessoa !== "juridica" || !cnpjValido || consultandoCnpj || salvando}
                >
                  {consultandoCnpj ? "Consultando..." : "Consultar CNPJ"}
                </Button>
                {cnpj.length > 0 && !cnpjValido && (
                  <p className="text-xs text-destructive">
                    {tipoPessoa === "fisica" ? "CPF deve ter 11 dígitos." : "CNPJ deve ter 14 dígitos."}
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
                  Identifica a empresa na tela de login (?empresa=
                  {alias || "..."}). Só letras minúsculas, números e hífen.
                </p>
              </div>
              <div className="border-t pt-4">
                <h2 className="mb-4 text-sm font-semibold">
                  Dados fiscais, endereço e contato
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {CAMPOS_EMPRESA.map(([campo, label, maxLength]) => (
                    <div key={campo} className="space-y-2">
                      <Label htmlFor={campo}>{label}</Label>
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
                  <div className="space-y-2">
                    <Label htmlFor="fundadaEm">Data de fundação</Label>
                    <Input
                      id="fundadaEm"
                      type="date"
                      value={fundadaEm}
                      onChange={(e) => setFundadaEm(e.target.value)}
                    />
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <Label htmlFor="historia">História da empresa</Label>
                  <Textarea
                    id="historia"
                    maxLength={4000}
                    value={historia}
                    onChange={(e) => setHistoria(e.target.value)}
                  />
                </div>
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
                  Recebe o perfil Administrador Empresa e conta como um dos
                  usuários desta empresa.
                </p>

                <div className="space-y-2">
                  <Label htmlFor="adminEmail">E-mail</Label>
                  <Input
                    id="adminEmail"
                    type="email"
                    value={adminEmail}
                    onChange={(e) => {
                      setContaExistente(null);
                      setAdminEmail(e.target.value);
                    }}
                  />
                </div>

                {/* Se a conta já existe, ela é reaproveitada: a mesma pessoa
                    pode administrar várias empresas, e pedir nome e senha de
                    novo sugeriria (errado) que uma segunda conta nasceria. */}
                {contaExistente === true ? (
                  <div className="rounded-md bg-sky-50 p-3 text-xs text-sky-900 dark:bg-sky-950 dark:text-sky-100">
                    <p className="font-medium">Esta conta já existe.</p>
                    <p className="mt-1">
                      Ela será vinculada a esta empresa como Administradora,
                      mantendo a senha que já usa. Nome e senha não são pedidos
                      — é a mesma pessoa, administrando mais uma empresa.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="adminNome">Nome</Label>
                      <Input
                        id="adminNome"
                        value={adminNome}
                        onChange={(e) => setAdminNome(e.target.value)}
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
                  </>
                )}
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
          <Button
            onClick={salvar}
            disabled={!podeSalvar || salvando || consultandoCnpj}
          >
            {salvando ? "Criando..." : "Criar empresa"}
          </Button>
        </div>
      </div>
    </PlataformaGuard>
  );
}
