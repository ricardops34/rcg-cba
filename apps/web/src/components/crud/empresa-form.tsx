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
} from "@plataforma/contracts";
import { useResourceMutations } from "@/hooks/use-resource";
import { ApiError, apiFetch, apiUpload, assetUrl } from "@/lib/api-client";
import { paraCampoData, paraIsoFimDoDia } from "@/lib/data-avaliacao";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, ImageIcon, Upload } from "lucide-react";

const LIST_ROUTE = "/admin/empresas";

/**
 * Cadastro da empresa, usado por dois módulos.
 *
 * Em Administração, o admin do tenant edita a **própria** empresa. Em
 * Plataforma, quem administra o SaaS edita **qualquer** uma — mesma tela, mesmo
 * endpoint, mesmas validações; o que muda é a lista para onde o botão voltar
 * leva e uma seção a mais, de assinatura.
 *
 * Duplicar o formulário para o módulo novo custaria manter dois cadastros da
 * mesma entidade em sincronia — e o primeiro campo fiscal acrescentado só num
 * deles já criaria a divergência.
 */
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
          bannerAtivo: empresa.bannerAtivo,
          bannerCor: empresa.bannerCor ?? "",
          bannerImagemUrl: empresa.bannerImagemUrl ?? null,
        }
      : {
          razaoSocial: "",
          nomeFantasia: "",
          cnpj: "",
          alias: null,
          situacao: "ativa",
          bannerAtivo: false,
          bannerCor: "",
        },
  });

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
      // O `me()` carrega a faixa da empresa ativa: sem recarregar, a barra do
      // topo continuaria mostrando a arte antiga até o próximo login.
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
          <CardContent>
            <FieldGroup>
              {/* Assinatura: só quem administra o SaaS enxerga e altera. O
                  servidor remove estes campos do payload de quem não é
                  administrador da plataforma (ver `semCamposDaPlataforma`),
                  então esconder aqui é conveniência de tela, não a trava. */}
              {administradorPlataforma && (
                <div className="rounded-lg border border-dashed p-3">
                  <p className="mb-3 text-sm font-medium">Assinatura</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Field>
                      <FieldLabel htmlFor="situacao">Situação</FieldLabel>
                      <select
                        id="situacao"
                        className="h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
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
                  <p className="mt-2 text-xs text-muted-foreground">
                    Situação decide o acesso: teste e ativa entram, suspensa e
                    cancelada não. Prazo em branco, em teste, é avaliação sem
                    data. Limite em branco, sem teto.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field data-invalid={!!form.formState.errors.razaoSocial}>
                  <FieldLabel htmlFor="razaoSocial">Razão social</FieldLabel>
                  <Input id="razaoSocial" {...form.register("razaoSocial")} />
                  <FieldError errors={[form.formState.errors.razaoSocial]} />
                </Field>

                <Field data-invalid={!!form.formState.errors.nomeFantasia}>
                  <FieldLabel htmlFor="nomeFantasia">Nome fantasia</FieldLabel>
                  <Input id="nomeFantasia" {...form.register("nomeFantasia")} />
                  <FieldError errors={[form.formState.errors.nomeFantasia]} />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field data-invalid={!!form.formState.errors.cnpj}>
                  <FieldLabel htmlFor="cnpj">CNPJ (somente números)</FieldLabel>
                  <Input id="cnpj" maxLength={14} {...form.register("cnpj")} />
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
                  <p className="text-xs text-muted-foreground">
                    Usado em <span className="font-mono">/login?empresa=&lt;alias&gt;</span>. Apenas
                    letras minúsculas, números e hífen.
                  </p>
                  <FieldError errors={[form.formState.errors.alias]} />
                </Field>
              </div>

              {/* Dados que saem no cabeçalho dos documentos emitidos pro
                  cliente — hoje, a proposta de orçamento em PDF. */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field data-invalid={!!form.formState.errors.inscricaoEstadual}>
                  <FieldLabel htmlFor="inscricaoEstadual">Inscrição estadual</FieldLabel>
                  <Input id="inscricaoEstadual" maxLength={20} {...form.register("inscricaoEstadual")} />
                  <FieldError errors={[form.formState.errors.inscricaoEstadual]} />
                </Field>

                <Field data-invalid={!!form.formState.errors.inscricaoMunicipal}>
                  <FieldLabel htmlFor="inscricaoMunicipal">Inscrição municipal</FieldLabel>
                  <Input
                    id="inscricaoMunicipal"
                    maxLength={20}
                    {...form.register("inscricaoMunicipal")}
                  />
                  <FieldError errors={[form.formState.errors.inscricaoMunicipal]} />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
                <Field data-invalid={!!form.formState.errors.endereco}>
                  <FieldLabel htmlFor="endereco">Endereço</FieldLabel>
                  <Input
                    id="endereco"
                    placeholder="Logradouro e número"
                    maxLength={150}
                    {...form.register("endereco")}
                  />
                  <FieldError errors={[form.formState.errors.endereco]} />
                </Field>

                <Field data-invalid={!!form.formState.errors.complemento}>
                  <FieldLabel htmlFor="complemento">Complemento</FieldLabel>
                  <Input id="complemento" maxLength={100} {...form.register("complemento")} />
                  <FieldError errors={[form.formState.errors.complemento]} />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
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
                  <Input
                    id="uf"
                    maxLength={2}
                    {...form.register("uf", { setValueAs: (v) => (v ?? "").trim().toUpperCase() })}
                  />
                  <FieldError errors={[form.formState.errors.uf]} />
                </Field>

                <Field data-invalid={!!form.formState.errors.cep}>
                  <FieldLabel htmlFor="cep">CEP</FieldLabel>
                  <Input id="cep" maxLength={10} {...form.register("cep")} />
                  <FieldError errors={[form.formState.errors.cep]} />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field data-invalid={!!form.formState.errors.telefone}>
                  <FieldLabel htmlFor="telefone">Telefone</FieldLabel>
                  <Input id="telefone" maxLength={20} {...form.register("telefone")} />
                  <FieldError errors={[form.formState.errors.telefone]} />
                </Field>

                <Field data-invalid={!!form.formState.errors.email}>
                  <FieldLabel htmlFor="email">E-mail</FieldLabel>
                  <Input id="email" type="email" maxLength={120} {...form.register("email")} />
                  <FieldError errors={[form.formState.errors.email]} />
                </Field>

                <Field data-invalid={!!form.formState.errors.site}>
                  <FieldLabel htmlFor="site">Site</FieldLabel>
                  <Input id="site" maxLength={150} {...form.register("site")} />
                  <FieldError errors={[form.formState.errors.site]} />
                </Field>
              </div>

              {current && (
                <Field>
                  <FieldLabel>Logo</FieldLabel>
                  <div className="flex items-center gap-3">
                    <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-muted/40">
                      {current.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={assetUrl(current.logoUrl) ?? ""}
                          alt="Logo da empresa"
                          className="size-full object-contain"
                        />
                      ) : (
                        <ImageIcon className="size-6 text-muted-foreground" />
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
                        {uploadingLogo ? "Enviando..." : "Enviar logo"}
                      </Button>
                      <p className="text-xs text-muted-foreground">PNG, JPEG, WEBP ou SVG (até 2 MB).</p>
                    </div>
                  </div>
                </Field>
              )}

              {/* Faixa institucional — a barra do topo do sistema (selo de
                  associação, certificação, grupo). Só aparece dentro do
                  sistema: no login ainda não se sabe a empresa. */}
              {current && (
                <Field>
                  <FieldLabel>Faixa institucional</FieldLabel>
                  <p className="text-xs text-muted-foreground">
                    Barra exibida no topo do sistema para quem está logado nesta empresa. Precisa da
                    imagem enviada para aparecer.
                  </p>

                  <label className="mt-1 flex w-fit cursor-pointer items-center gap-2 text-sm">
                    <Switch
                      checked={!!form.watch("bannerAtivo")}
                      onCheckedChange={(v) =>
                        form.setValue("bannerAtivo", v, { shouldDirty: true })
                      }
                    />
                    Exibir a faixa
                  </label>

                  <div className="mt-2 flex flex-wrap items-end gap-4">
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
                      <FieldLabel className="text-xs">Imagem</FieldLabel>
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

                  {/* Prévia com a cor e a arte reais, do tamanho que sai no
                      topo — escolher cor às cegas dá tarja ilegível. */}
                  <div className="mt-2 space-y-1">
                    <span className="text-xs text-muted-foreground">Prévia</span>
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
                          Envie a imagem para ver a faixa
                        </span>
                      )}
                    </div>
                  </div>
                </Field>
              )}
            </FieldGroup>
          </CardContent>

          <CardFooter className="justify-end gap-2">
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
