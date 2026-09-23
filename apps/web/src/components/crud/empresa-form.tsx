"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  empresaCreateSchema,
  SITUACAO_EMPRESA_LABEL,
  type CurrentUser,
  type Empresa,
  type EmpresaCreate,
  type ConsultaCnpjResultado,
} from "@plataforma/contracts";
import { useResourceMutations } from "@/hooks/use-resource";
import { ApiError, apiFetch, apiUpload, assetUrl } from "@/lib/api-client";
import { paraCampoData, paraIsoFimDoDia } from "@/lib/data-avaliacao";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Building2, ImageIcon, MapPin, Sparkles, Upload } from "lucide-react";

const LIST_ROUTE = "/admin/empresas";

export function EmpresaForm({
  empresa,
  listRoute = LIST_ROUTE,
}: {
  empresa?: Empresa;
  listRoute?: string;
}) {
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);
  const administradorPlataforma = useAuthStore(
    (state) => state.user?.administradorPlataforma,
  );
  const { create, update } = useResourceMutations<EmpresaCreate, Partial<EmpresaCreate>>("empresas");
  const [current, setCurrent] = useState<Empresa | undefined>(empresa);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [consultandoCnpj, setConsultandoCnpj] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<EmpresaCreate>({
    resolver: zodResolver(empresaCreateSchema),
    defaultValues: empresa
      ? {
          razaoSocial: empresa.razaoSocial,
          nomeFantasia: empresa.nomeFantasia,
          cnpj: empresa.cnpj,
          tipoPessoa: empresa.tipoPessoa ?? 'juridica',
          alias: empresa.alias ?? null,
          situacao: empresa.situacao,
          testeExpiraEm: empresa.testeExpiraEm ?? null,
          limiteUsuarios: empresa.limiteUsuarios ?? null,
          inscricaoEstadual: empresa.inscricaoEstadual ?? "",
          inscricaoMunicipal: empresa.inscricaoMunicipal ?? "",
          endereco: empresa.endereco ?? "",
          complemento: empresa.complemento ?? "",
          bairro: empresa.bairro ?? "",
          municipio: empresa.municipio ?? "",
          uf: empresa.uf ?? "",
          cep: empresa.cep ?? "",
          telefone: empresa.telefone ?? "",
          email: empresa.email ?? "",
          site: empresa.site ?? "",
          telefone2: empresa.telefone2 ?? "",
          email2: empresa.email2 ?? "",
          fundadaEm: empresa.fundadaEm ?? null,
          segmentos: empresa.segmentos ?? "",
          historia: empresa.historia ?? "",
          bannerAtivo: empresa.bannerAtivo,
          bannerCor: empresa.bannerCor ?? "",
          bannerImagemUrl: empresa.bannerImagemUrl ?? null,
        }
      : {
          razaoSocial: "",
          nomeFantasia: "",
          cnpj: "",
          tipoPessoa: 'juridica',
          alias: null,
          situacao: "ativa",
          bannerAtivo: false,
          bannerCor: "",
        },
  });

  const tipoPessoa = form.watch('tipoPessoa') ?? 'juridica';
  const consultarCnpj = async () => {
    const documento = form.getValues('cnpj');
    if (tipoPessoa !== 'juridica' || !/^\d{14}$/.test(documento)) {
      toast.error('Informe um CNPJ com 14 dígitos');
      return;
    }
    setConsultandoCnpj(true);
    try {
      const dados = await apiFetch<ConsultaCnpjResultado>(
        `${administradorPlataforma ? '/plataforma' : '/empresas'}/consulta-cnpj/${documento}`,
      );
      if (form.getValues('cnpj') !== documento || form.getValues('tipoPessoa') !== 'juridica') return;
      for (const campo of ['razaoSocial', 'nomeFantasia', 'endereco', 'complemento', 'bairro', 'municipio', 'uf', 'cep', 'telefone', 'telefone2', 'email'] as const) {
        const valor = dados[campo];
        if (valor) form.setValue(campo, valor, { shouldDirty: true, shouldValidate: true });
      }
      toast.success('Dados do CNPJ preenchidos. Confira e salve o cadastro.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao consultar CNPJ');
    } finally {
      setConsultandoCnpj(false);
    }
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !current) return;
    setUploadingLogo(true);
    try {
      const updated = await apiUpload<Empresa>(`/empresas/${current.id}/logo`, file);
      setCurrent(updated);
      const me = await apiFetch<CurrentUser>("/auth/me");
      setUser(me);
      toast.success("Logo atualizado");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao enviar logo");
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleBannerUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !current) return;
    setUploadingBanner(true);
    try {
      const updated = await apiUpload<Empresa>(`/empresas/${current.id}/banner`, file);
      setCurrent(updated);
      const me = await apiFetch<CurrentUser>("/auth/me");
      setUser(me);
      toast.success("Imagem da faixa atualizada");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao enviar a imagem");
    } finally {
      setUploadingBanner(false);
    }
  };

  const onSubmit = async (values: EmpresaCreate) => {
    if (values.cnpj.length !== (tipoPessoa === 'fisica' ? 11 : 14)) {
      form.setError('cnpj', { message: tipoPessoa === 'fisica' ? 'CPF deve conter 11 dígitos' : 'CNPJ deve conter 14 dígitos' });
      return;
    }
    try {
      if (empresa) {
        await update.mutateAsync({ id: empresa.id, input: values });
        toast.success("Empresa atualizada");
      } else {
        await create.mutateAsync(values);
        toast.success("Empresa cadastrada");
      }
      router.push(listRoute);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar empresa");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(listRoute)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">
          {empresa ? "Editar empresa" : "Nova empresa"}
        </h1>
      </div>

      <Card>
        <form id="empresa-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <CardContent className="pt-6">
            <Tabs defaultValue="geral" className="w-full">
              <TabsList className="grid grid-cols-2 md:grid-cols-4 mb-6">
                <TabsTrigger value="geral" className="gap-2">
                  <Building2 className="w-4 h-4" />
                  Dados Gerais
                </TabsTrigger>
                <TabsTrigger value="endereco" className="gap-2">
                  <MapPin className="w-4 h-4" />
                  Endereço & Contato
                </TabsTrigger>
                <TabsTrigger value="branding" className="gap-2">
                  <ImageIcon className="w-4 h-4" />
                  Marca & Faixa
                </TabsTrigger>
                <TabsTrigger value="ia" className="gap-2">
                  <Sparkles className="w-4 h-4" />
                  Atendimento IA
                </TabsTrigger>
              </TabsList>

              {/* ABA 1: DADOS GERAIS */}
              <TabsContent value="geral" className="space-y-4">
                {administradorPlataforma && (
                  <div className="rounded-lg border border-dashed p-4 bg-muted/20">
                    <p className="mb-3 text-sm font-semibold flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-primary" />
                      Status & Teto de Usuários (SaaS)
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <Field>
                        <FieldLabel htmlFor="situacao">Situação</FieldLabel>
                        <select
                          id="situacao"
                          className="h-9 rounded-md border bg-background px-3 text-sm shadow-xs"
                          value={form.watch("situacao") ?? "ativa"}
                          onChange={(e) =>
                            form.setValue(
                              "situacao",
                              e.target.value as EmpresaCreate["situacao"],
                              { shouldDirty: true },
                            )
                          }
                        >
                          {(
                            ["teste", "ativa", "suspensa", "cancelada"] as const
                          ).map((s) => (
                            <option key={s} value={s}>
                              {SITUACAO_EMPRESA_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      </Field>

                      <Field>
                        <FieldLabel htmlFor="testeExpiraEm">Teste até</FieldLabel>
                        <Input
                          id="testeExpiraEm"
                          type="date"
                          disabled={form.watch("situacao") !== "teste"}
                          value={paraCampoData(form.watch("testeExpiraEm"))}
                          onChange={(e) =>
                            form.setValue("testeExpiraEm", paraIsoFimDoDia(e.target.value), {
                              shouldDirty: true,
                            })
                          }
                        />
                      </Field>

                      <Field>
                        <FieldLabel htmlFor="limiteUsuarios">
                          Limite de usuários
                        </FieldLabel>
                        <Input
                          id="limiteUsuarios"
                          type="number"
                          min={1}
                          placeholder="sem limite"
                          value={form.watch("limiteUsuarios") ?? ""}
                          onChange={(e) =>
                            form.setValue(
                              "limiteUsuarios",
                              e.target.value === "" ? null : Number(e.target.value),
                              { shouldDirty: true },
                            )
                          }
                        />
                      </Field>
                    </div>
                  </div>
                )}

                <FieldGroup>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field data-invalid={!!form.formState.errors.razaoSocial}>
                      <FieldLabel htmlFor="razaoSocial">Razão social *</FieldLabel>
                      <Input id="razaoSocial" {...form.register("razaoSocial")} />
                      <FieldError errors={[form.formState.errors.razaoSocial]} />
                    </Field>

                    <Field data-invalid={!!form.formState.errors.nomeFantasia}>
                      <FieldLabel htmlFor="nomeFantasia">Nome fantasia *</FieldLabel>
                      <Input id="nomeFantasia" {...form.register("nomeFantasia")} />
                      <FieldError errors={[form.formState.errors.nomeFantasia]} />
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field data-invalid={!!form.formState.errors.cnpj}>
                      <FieldLabel htmlFor="tipoPessoa">Tipo de pessoa</FieldLabel>
                      <select id="tipoPessoa" className="h-9 rounded-md border bg-background px-3 text-sm mb-2"
                        {...form.register('tipoPessoa')}>
                        <option value="juridica">Pessoa Jurídica</option>
                        <option value="fisica">Pessoa Física</option>
                      </select>
                      <FieldLabel htmlFor="cnpj">{tipoPessoa === 'fisica' ? 'CPF *' : 'CNPJ *'} (somente números)</FieldLabel>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Input className="min-w-0 flex-1" id="cnpj" inputMode="numeric" maxLength={tipoPessoa === 'fisica' ? 11 : 14} {...form.register("cnpj", { onChange: (e) => form.setValue('cnpj', e.target.value.replace(/\D/g, '')) })} />
                        {tipoPessoa === 'juridica' && <Button className="shrink-0" type="button" variant="default" onClick={consultarCnpj}
                          disabled={consultandoCnpj || !/^\d{14}$/.test(form.watch('cnpj'))}>
                          {consultandoCnpj ? 'Consultando...' : 'Consultar CNPJ'}
                        </Button>}
                      </div>
                      <FieldError errors={[form.formState.errors.cnpj]} />
                    </Field>

                    <Field data-invalid={!!form.formState.errors.alias}>
                      <FieldLabel htmlFor="alias">Alias (URL de login)</FieldLabel>
                      <Input
                        id="alias"
                        placeholder="ex.: rcg"
                        maxLength={40}
                        {...form.register("alias", {
                          setValueAs: (v) => (v?.trim() ? v.trim().toLowerCase() : null),
                        })}
                      />
                      <FieldDescription>
                        Usado para acionar o login via <span className="font-mono">/login?empresa=&lt;alias&gt;</span>.
                      </FieldDescription>
                      <FieldError errors={[form.formState.errors.alias]} />
                    </Field>
                  </div>
                </FieldGroup>
              </TabsContent>

              {/* ABA 2: ENDEREÇO & CONTATO */}
              <TabsContent value="endereco" className="space-y-4">
                <FieldGroup>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field data-invalid={!!form.formState.errors.inscricaoEstadual}>
                      <FieldLabel htmlFor="inscricaoEstadual">Inscrição estadual</FieldLabel>
                      <Input id="inscricaoEstadual" maxLength={20} {...form.register("inscricaoEstadual")} />
                      <FieldError errors={[form.formState.errors.inscricaoEstadual]} />
                    </Field>

                    <Field data-invalid={!!form.formState.errors.inscricaoMunicipal}>
                      <FieldLabel htmlFor="inscricaoMunicipal">Inscrição municipal</FieldLabel>
                      <Input id="inscricaoMunicipal" maxLength={20} {...form.register("inscricaoMunicipal")} />
                      <FieldError errors={[form.formState.errors.inscricaoMunicipal]} />
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
                    <Field data-invalid={!!form.formState.errors.endereco}>
                      <FieldLabel htmlFor="endereco">Endereço</FieldLabel>
                      <Input id="endereco" placeholder="Logradouro e número" maxLength={150} {...form.register("endereco")} />
                      <FieldError errors={[form.formState.errors.endereco]} />
                    </Field>

                    <Field data-invalid={!!form.formState.errors.complemento}>
                      <FieldLabel htmlFor="complemento">Complemento</FieldLabel>
                      <Input id="complemento" maxLength={100} {...form.register("complemento")} />
                      <FieldError errors={[form.formState.errors.complemento]} />
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                    <Field data-invalid={!!form.formState.errors.bairro}>
                      <FieldLabel htmlFor="bairro">Bairro</FieldLabel>
                      <Input id="bairro" maxLength={100} {...form.register("bairro")} />
                      <FieldError errors={[form.formState.errors.bairro]} />
                    </Field>

                    <Field data-invalid={!!form.formState.errors.municipio}>
                      <FieldLabel htmlFor="municipio">Município</FieldLabel>
                      <Input id="municipio" maxLength={100} {...form.register("municipio")} />
                      <FieldError errors={[form.formState.errors.municipio]} />
                    </Field>

                    <Field data-invalid={!!form.formState.errors.uf}>
                      <FieldLabel htmlFor="uf">UF</FieldLabel>
                      <Input id="uf" maxLength={2} {...form.register("uf", { setValueAs: (v) => (v ?? "").trim().toUpperCase() })} />
                      <FieldError errors={[form.formState.errors.uf]} />
                    </Field>

                    <Field data-invalid={!!form.formState.errors.cep}>
                      <FieldLabel htmlFor="cep">CEP</FieldLabel>
                      <Input id="cep" maxLength={10} {...form.register("cep")} />
                      <FieldError errors={[form.formState.errors.cep]} />
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Field data-invalid={!!form.formState.errors.telefone}>
                      <FieldLabel htmlFor="telefone">Telefone principal</FieldLabel>
                      <Input id="telefone" maxLength={20} {...form.register("telefone")} />
                      <FieldError errors={[form.formState.errors.telefone]} />
                    </Field>

                    <Field data-invalid={!!form.formState.errors.email}>
                      <FieldLabel htmlFor="email">E-mail principal</FieldLabel>
                      <Input id="email" type="email" maxLength={120} {...form.register("email")} />
                      <FieldError errors={[form.formState.errors.email]} />
                    </Field>

                    <Field data-invalid={!!form.formState.errors.site}>
                      <FieldLabel htmlFor="site">Site institucional</FieldLabel>
                      <Input id="site" maxLength={150} {...form.register("site")} />
                      <FieldError errors={[form.formState.errors.site]} />
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field data-invalid={!!form.formState.errors.telefone2}>
                      <FieldLabel htmlFor="telefone2">Segundo telefone</FieldLabel>
                      <Input id="telefone2" maxLength={20} {...form.register("telefone2")} />
                      <FieldError errors={[form.formState.errors.telefone2]} />
                    </Field>

                    <Field data-invalid={!!form.formState.errors.email2}>
                      <FieldLabel htmlFor="email2">Segundo e-mail</FieldLabel>
                      <Input id="email2" type="email" maxLength={120} {...form.register("email2")} />
                      <FieldError errors={[form.formState.errors.email2]} />
                    </Field>
                  </div>
                </FieldGroup>
              </TabsContent>

              {/* ABA 3: MARCA & FAIXA */}
              <TabsContent value="branding" className="space-y-6">
                <FieldGroup>
                  {current ? (
                    <Field>
                      <FieldLabel>Logo da Empresa</FieldLabel>
                      <div className="flex items-center gap-4 mt-2">
                        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40 p-2">
                          {current.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={assetUrl(current.logoUrl) ?? ""}
                              alt="Logo da empresa"
                              className="size-full object-contain"
                            />
                          ) : (
                            <ImageIcon className="size-8 text-muted-foreground" />
                          )}
                        </div>
                        <div className="space-y-1">
                          <input
                            ref={logoInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/svg+xml"
                            className="hidden"
                            onChange={handleLogoUpload}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={uploadingLogo}
                            onClick={() => logoInputRef.current?.click()}
                          >
                            <Upload className="size-4" />
                            {uploadingLogo ? "Enviando..." : "Enviar novo logo"}
                          </Button>
                          <p className="text-xs text-muted-foreground">Recomendado formato SVG ou PNG transparente (até 2 MB).</p>
                        </div>
                      </div>
                    </Field>
                  ) : (
                    <p className="text-xs text-muted-foreground">Cadastre a empresa primeiro para realizar o upload do logo.</p>
                  )}

                  {current && (
                    <Field className="pt-4 border-t">
                      <FieldLabel>Faixa Institucional no Topo</FieldLabel>
                      <FieldDescription>
                        Barra com logo de selo, certificação ou associação exibida para quem está logado nesta empresa.
                      </FieldDescription>

                      <label className="mt-3 flex w-fit cursor-pointer items-center gap-2 text-sm font-medium">
                        <Switch
                          checked={!!form.watch("bannerAtivo")}
                          onCheckedChange={(v) =>
                            form.setValue("bannerAtivo", v, { shouldDirty: true })
                          }
                        />
                        Exibir faixa no topo do sistema
                      </label>

                      <div className="mt-3 flex flex-wrap items-end gap-4">
                        <div className="space-y-1">
                          <FieldLabel htmlFor="bannerCor" className="text-xs">
                            Cor de fundo
                          </FieldLabel>
                          <div className="flex items-center gap-2">
                            <Input
                              id="bannerCor"
                              type="color"
                              className="h-9 w-14 p-1"
                              value={form.watch("bannerCor") || "#bd1e7d"}
                              onChange={(e) =>
                                form.setValue("bannerCor", e.target.value, { shouldDirty: true })
                              }
                            />
                            <Input
                              aria-label="Cor em hexadecimal"
                              className="w-28 font-mono"
                              maxLength={7}
                              placeholder="#bd1e7d"
                              {...form.register("bannerCor")}
                            />
                          </div>
                          <FieldError errors={[form.formState.errors.bannerCor]} />
                        </div>

                        <div className="space-y-1">
                          <FieldLabel className="text-xs">Imagem da Faixa</FieldLabel>
                          <input
                            ref={bannerInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/svg+xml"
                            className="hidden"
                            onChange={handleBannerUpload}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={uploadingBanner}
                            onClick={() => bannerInputRef.current?.click()}
                          >
                            <Upload className="size-4" />
                            {uploadingBanner ? "Enviando..." : "Enviar imagem"}
                          </Button>
                        </div>
                      </div>

                      <div className="mt-4 space-y-1">
                        <span className="text-xs text-muted-foreground">Prévia visual da faixa</span>
                        <div
                          className="flex h-10 items-center justify-center rounded-md"
                          style={{ backgroundColor: form.watch("bannerCor") || "#bd1e7d" }}
                        >
                          {current.bannerImagemUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={assetUrl(current.bannerImagemUrl) ?? ""}
                              alt="Faixa institucional"
                              className="h-6 w-auto"
                            />
                          ) : (
                            <span className="text-xs text-white/80">
                              Envie a imagem para visualizar a faixa
                            </span>
                          )}
                        </div>
                      </div>
                    </Field>
                  )}
                </FieldGroup>
              </TabsContent>

              {/* ABA 4: ATENDIMENTO IA */}
              <TabsContent value="ia" className="space-y-4">
                <FieldGroup>
                  <Field data-invalid={!!form.formState.errors.fundadaEm}>
                    <FieldLabel htmlFor="fundadaEm">Data de fundação</FieldLabel>
                    <Input
                      id="fundadaEm"
                      type="date"
                      className="max-w-xs"
                      value={paraCampoData(form.watch("fundadaEm"))}
                      onChange={(e) =>
                        form.setValue(
                          "fundadaEm",
                          e.target.value
                            ? new Date(e.target.value + "T12:00:00").toISOString()
                            : null,
                          { shouldDirty: true },
                        )
                      }
                    />
                    <FieldDescription>
                      Transforma-se em &quot;no mercado desde [ANO]&quot; nas respostas do assistente de IA.
                    </FieldDescription>
                    <FieldError errors={[form.formState.errors.fundadaEm]} />
                  </Field>

                  <Field data-invalid={!!form.formState.errors.segmentos}>
                    <FieldLabel htmlFor="segmentos">Segmentos de atuação</FieldLabel>
                    <Input
                      id="segmentos"
                      maxLength={300}
                      placeholder="Ex.: Distribuição de bebidas, food service, materiais de construção"
                      {...form.register("segmentos")}
                    />
                    <FieldDescription>
                      Resumo da atuação comercial em uma linha para contextualizar o atendimento inteligente.
                    </FieldDescription>
                    <FieldError errors={[form.formState.errors.segmentos]} />
                  </Field>

                  <Field data-invalid={!!form.formState.errors.historia}>
                    <FieldLabel htmlFor="historia">História & Institucional da Empresa</FieldLabel>
                    <Textarea
                      id="historia"
                      rows={6}
                      maxLength={4000}
                      placeholder="Fundada em 1998 em Campo Grande, a empresa é especialista em..."
                      {...form.register("historia")}
                    />
                    <FieldDescription>
                      O assistente de IA consulta esta narrativa para responder dúvidas dos clientes sobre a empresa.
                    </FieldDescription>
                    <FieldError errors={[form.formState.errors.historia]} />
                  </Field>
                </FieldGroup>
              </TabsContent>
            </Tabs>
          </CardContent>

          <CardFooter className="justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => router.push(listRoute)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {empresa ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
