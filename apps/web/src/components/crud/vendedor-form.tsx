"use client";

import { useRouter } from "next/navigation";
import { useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  TIPO_VENDEDOR_LABEL,
  VINCULO_VENDEDOR_LABEL,
  vendedorCreateSchema,
  vendedorUpdateSchema,
  type TipoVendedor,
  type Vendedor,
  type VendedorCreate,
  type VendedorUpdate,
  type VinculoVendedor,
} from "@plataforma/contracts";
import { useResourceMutations } from "@/hooks/use-resource";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { ArrowLeft, UserPlus } from "lucide-react";

const LIST_ROUTE = "/gerencial/vendedores";

interface UsuarioOption {
  id: string;
  nome: string;
}

const dateToInput = (v: unknown) => {
  if (!v) return "";
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};
const inputToDate = (v: unknown) => (v === "" || v == null ? null : new Date(`${v}T00:00:00`));

export function VendedorForm({ vendedor }: { vendedor?: Vendedor }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { create, update } = useResourceMutations<VendedorCreate, VendedorUpdate>("vendedores");

  const criarUsuario = useMutation({
    mutationFn: () =>
      apiFetch<{ emailEnviado?: boolean; senhaProvisoria?: string }>(
        `/vendedores/${vendedor?.id}/criar-usuario`,
        { method: "POST" },
      ),
    // SMTP fora do ar não impede a criação do acesso — a senha provisória vem
    // na resposta pro admin repassar ao vendedor.
    onSuccess: (r) => {
      toast.success(
        r.emailEnviado === false && r.senhaProvisoria
          ? `Usuário criado, mas o e-mail não pôde ser enviado. Senha provisória: ${r.senhaProvisoria}`
          : "Usuário criado — senha provisória enviada por e-mail",
      );
      queryClient.invalidateQueries({ queryKey: ["vendedores"] });
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
    },
  });

  const onCriarUsuario = () => {
    if (!vendedor) return;
    if (!confirm(`Criar usuário de acesso para "${vendedor.nome}" e enviar senha provisória para ${vendedor.email}?`)) {
      return;
    }
    criarUsuario.mutate(undefined, {
      onError: (err) => {
        toast.error(err instanceof ApiError ? err.message : "Erro ao criar usuário");
      },
    });
  };

  const vendedoresSelectQuery = useQuery({
    queryKey: ["vendedores", "select"],
    queryFn: () => apiFetch<{ data: Vendedor[] }>("/vendedores", { query: { pageSize: 100 } }),
  });
  const usuariosSelectQuery = useQuery({
    queryKey: ["usuarios", "select"],
    queryFn: () => apiFetch<{ data: UsuarioOption[] }>("/usuarios", { query: { pageSize: 100 } }),
  });

  // Só lista quem já tem o papel marcado e está ativo — mas mantém o valor
  // atualmente salvo na lista mesmo que o papel tenha sido desmarcado ou o
  // vendedor bloqueado depois, senão o Select mostra um valor "fantasma" ao
  // editar.
  // Só quem é "superior" pode chefiar — e o valor já gravado continua na
  // lista mesmo que a pessoa tenha sido rebaixada ou bloqueada depois, senão
  // o Select mostra vazio ao editar.
  const opcoesSuperior = (vendedoresSelectQuery.data?.data ?? []).filter(
    (v) =>
      v.id !== vendedor?.id &&
      (v.id === vendedor?.superiorId || (v.tipo === "superior" && v.ativo)),
  );
  const opcoesUsuario = usuariosSelectQuery.data?.data ?? [];

  const schema = vendedor ? vendedorUpdateSchema : vendedorCreateSchema;
  const empty: VendedorCreate = {
    codigoErp: "",
    nome: "",
    nomeReduzido: "",
    telefone: "",
    email: "",
    dataNascimento: null,
    usuarioId: null,
    tipo: "vendedor",
    vinculo: null,
    usaDashboard: true,
    superiorId: null,
    ativo: true,
    desligado: false,
  };
  const form = useForm<VendedorCreate>({
    resolver: zodResolver(schema as typeof vendedorCreateSchema),
    defaultValues: vendedor
      ? {
          codigoErp: vendedor.codigoErp ?? "",
          nome: vendedor.nome,
          nomeReduzido: vendedor.nomeReduzido ?? "",
          telefone: vendedor.telefone ?? "",
          email: vendedor.email ?? "",
          dataNascimento: vendedor.dataNascimento ?? null,
          usuarioId: vendedor.usuarioId ?? null,
          tipo: vendedor.tipo,
          vinculo: vendedor.vinculo ?? null,
          usaDashboard: vendedor.usaDashboard,
          superiorId: vendedor.superiorId ?? null,
          ativo: vendedor.ativo,
          desligado: vendedor.desligado,
        }
      : empty,
  });

  /**
   * Validação reprovada: o `handleSubmit` do react-hook-form simplesmente não
   * chama o `onSubmit`, e sem isto a tela não dizia nada — clicar em Salvar
   * parecia não fazer efeito, que é indistinguível de "não salvou". O aviso
   * nomeia o primeiro campo com problema, porque ele pode estar fora da parte
   * visível do formulário.
   */
  const onInvalid = (erros: FieldErrors<VendedorCreate>) => {
    const primeiro = Object.values(erros).find((e) => e?.message)?.message;
    toast.error(
      primeiro
        ? `Confira os campos: ${String(primeiro)}`
        : "Há campos inválidos no formulário.",
    );
  };

  const onSubmit = async (values: VendedorCreate) => {
    try {
      if (vendedor) {
        await update.mutateAsync({ id: vendedor.id, input: values });
        toast.success("Vendedor atualizado");
      } else {
        await create.mutateAsync(values);
        toast.success("Vendedor cadastrado");
      }
      router.push(LIST_ROUTE);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar vendedor");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">
          {vendedor ? "Editar vendedor" : "Novo vendedor"}
        </h1>
      </div>

      <Card>
        <form id="vendedor-form" onSubmit={form.handleSubmit(onSubmit, onInvalid)} noValidate>
          <CardContent>
            <FieldGroup>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field data-invalid={!!form.formState.errors.nome}>
                  <FieldLabel htmlFor="nome">Nome</FieldLabel>
                  <Input id="nome" {...form.register("nome")} />
                  <FieldError errors={[form.formState.errors.nome]} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="nomeReduzido">Nome reduzido</FieldLabel>
                  <Input id="nomeReduzido" {...form.register("nomeReduzido")} />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="codigoErp">Código ERP</FieldLabel>
                  <Input id="codigoErp" {...form.register("codigoErp")} />
                </Field>
                <Field data-invalid={!!form.formState.errors.dataNascimento}>
                  <FieldLabel htmlFor="dataNascimento">Data de nascimento</FieldLabel>
                  <Input
                    id="dataNascimento"
                    type="date"
                    defaultValue={dateToInput(form.getValues("dataNascimento"))}
                    onChange={(e) => form.setValue("dataNascimento", inputToDate(e.target.value))}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="telefone">Telefone</FieldLabel>
                  <Input id="telefone" {...form.register("telefone")} />
                </Field>
                <Field data-invalid={!!form.formState.errors.email}>
                  <FieldLabel htmlFor="email">E-mail</FieldLabel>
                  <Input id="email" {...form.register("email")} />
                  <FieldError errors={[form.formState.errors.email]} />
                </Field>
              </div>

              {/* Comissão vem do ERP pela API de integração — exibida, nunca
                  editada aqui (o campo nem faz parte do create/update). */}
              <Field>
                <FieldLabel htmlFor="percComissao">% de comissão</FieldLabel>
                <Input
                  id="percComissao"
                  readOnly
                  disabled
                  className="sm:max-w-40"
                  value={
                    vendedor?.percComissao != null
                      ? `${vendedor.percComissao.toLocaleString("pt-BR", {
                          maximumFractionDigits: 2,
                        })}%`
                      : "—"
                  }
                />
                <FieldDescription>Mantido pelo ERP; não editável por aqui.</FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="usuarioId">Usuário do sistema (opcional)</FieldLabel>
                <Select
                  value={form.watch("usuarioId") ?? "none"}
                  onValueChange={(val) => form.setValue("usuarioId", val === "none" ? null : val)}
                >
                  <SelectTrigger id="usuarioId" className="w-full">
                    <SelectValue placeholder="Sem vínculo de login" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem vínculo de login</SelectItem>
                    {opcoesUsuario.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {vendedor && !vendedor.usuarioId && (
                  <div className="pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!vendedor.email || criarUsuario.isPending}
                      onClick={onCriarUsuario}
                    >
                      <UserPlus className="size-4" />
                      Criar usuário
                    </Button>
                    {!vendedor.email && (
                      <FieldDescription>
                        Cadastre um e-mail para o vendedor antes de criar o usuário.
                      </FieldDescription>
                    )}
                  </div>
                )}
              </Field>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="superiorId">Superior</FieldLabel>
                  <Select
                    value={form.watch("superiorId") ?? "none"}
                    onValueChange={(val) => form.setValue("superiorId", val === "none" ? null : val)}
                  >
                    <SelectTrigger id="superiorId" className="w-full">
                      <SelectValue placeholder="Sem superior" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem superior</SelectItem>
                      {opcoesSuperior.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.nomeReduzido || v.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    A quem esta pessoa responde. A hierarquia sobe sozinha a
                    partir daqui: o vendedor aponta o supervisor, o supervisor
                    aponta o gerente, e assim por diante.
                  </FieldDescription>
                </Field>
              </div>


              {/* Tipo e vínculo são escolhas únicas: o cadastro é de um papel
                  só (era possível marcar vendedor+supervisor+gerente ao mesmo
                  tempo, o que não existe no negócio). */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="tipo">Tipo</FieldLabel>
                  <Select
                    value={form.watch("tipo")}
                    onValueChange={(val) => form.setValue("tipo", val as TipoVendedor)}
                  >
                    <SelectTrigger id="tipo" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TIPO_VENDEDOR_LABEL) as TipoVendedor[]).map((t) => (
                        <SelectItem key={t} value={t}>
                          {TIPO_VENDEDOR_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    Define o alcance nas telas: gerente vê o time todo, supervisor vê os
                    vendedores abaixo dele, vendedor vê a própria carteira.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="vinculo">Vínculo</FieldLabel>
                  <Select
                    value={form.watch("vinculo") ?? "none"}
                    onValueChange={(val) =>
                      form.setValue("vinculo", val === "none" ? null : (val as VinculoVendedor))
                    }
                  >
                    <SelectTrigger id="vinculo" className="w-full">
                      <SelectValue placeholder="Não informado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Não informado</SelectItem>
                      {(Object.keys(VINCULO_VENDEDOR_LABEL) as VinculoVendedor[]).map((v) => (
                        <SelectItem key={v} value={v}>
                          {VINCULO_VENDEDOR_LABEL[v]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    “Sistema” são os cadastros que não são pessoas de venda (escritório,
                    e-commerce, balcão).
                  </FieldDescription>
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.watch("usaDashboard")}
                    onCheckedChange={(v) => form.setValue("usaDashboard", v === true)}
                  />
                  Usa em Dashboard
                </label>
                {/* Desligado é o que inativa: o servidor mantém `ativo` como
                    espelho, e é `ativo` que os selects do sistema consultam. */}
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.watch("desligado")}
                    onCheckedChange={(v) => {
                      form.setValue("desligado", v === true);
                      form.setValue("ativo", v !== true);
                    }}
                  />
                  Desligado
                </label>
              </div>

            </FieldGroup>
          </CardContent>

          <CardFooter className="justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push(LIST_ROUTE)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {vendedor ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
