"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  empresaCreateSchema,
  type CurrentUser,
  type Empresa,
  type EmpresaCreate,
} from "@plataforma/contracts";
import { useResourceMutations } from "@/hooks/use-resource";
import { ApiError, apiFetch, apiUpload, assetUrl } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { ArrowLeft, ImageIcon, Upload } from "lucide-react";

const LIST_ROUTE = "/admin/empresas";

export function EmpresaForm({ empresa }: { empresa?: Empresa }) {
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);
  const { create, update } = useResourceMutations<EmpresaCreate, Partial<EmpresaCreate>>("empresas");
  const [current, setCurrent] = useState<Empresa | undefined>(empresa);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<EmpresaCreate>({
    resolver: zodResolver(empresaCreateSchema),
    defaultValues: empresa
      ? {
          razaoSocial: empresa.razaoSocial,
          nomeFantasia: empresa.nomeFantasia,
          cnpj: empresa.cnpj,
          alias: empresa.alias ?? null,
          ativo: empresa.ativo,
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
        }
      : { razaoSocial: "", nomeFantasia: "", cnpj: "", alias: null, ativo: true },
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

  const onSubmit = async (values: EmpresaCreate) => {
    try {
      if (empresa) {
        await update.mutateAsync({ id: empresa.id, input: values });
        toast.success("Empresa atualizada");
      } else {
        await create.mutateAsync(values);
        toast.success("Empresa cadastrada");
      }
      router.push(LIST_ROUTE);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar empresa");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
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
            </FieldGroup>
          </CardContent>

          <CardFooter className="justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push(LIST_ROUTE)}>
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
