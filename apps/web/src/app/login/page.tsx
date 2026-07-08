"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { LayoutDashboard } from "lucide-react";
import { loginSchema, type LoginInput, type CurrentUser } from "@plataforma/contracts";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";

const DESTAQUES = [
  "Multiempresa com isolamento por Row-Level Security",
  "RBAC por empresa, perfil, menu e rotina",
  "Hierarquia comercial e apuração de metas",
];

export default function LoginPage() {
  const router = useRouter();
  const { accessToken, setTokens, setUser } = useAuthStore();

  useEffect(() => {
    if (accessToken) router.replace("/");
  }, [accessToken, router]);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", senha: "" },
  });

  const onSubmit = async (values: LoginInput) => {
    try {
      const tokens = await apiFetch<{ accessToken: string; refreshToken: string }>(
        "/auth/login",
        { method: "POST", body: values },
      );
      setTokens(tokens.accessToken, tokens.refreshToken);

      const me = await apiFetch<CurrentUser>("/auth/me");
      setUser(me);

      toast.success(`Bem-vindo, ${me.nome.split(" ")[0]}`);
      router.replace("/");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Falha ao entrar";
      toast.error(message);
    }
  };

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* Painel de marca — mesma identidade visual do sidebar do app */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:2.5rem_2.5rem]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-sidebar-primary/25 blur-3xl"
        />

        <div className="relative flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <LayoutDashboard className="size-4.5" />
          </div>
          <span className="font-semibold tracking-tight">Plataforma Comercial</span>
        </div>

        <div className="relative max-w-sm space-y-6">
          <p className="text-2xl leading-snug font-medium text-balance">
            Um único lugar para vender, gerenciar e acompanhar todas as empresas do grupo.
          </p>
          <ul className="space-y-2.5 text-sm text-sidebar-foreground/70">
            {DESTAQUES.map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-sidebar-primary" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative font-mono text-xs text-sidebar-foreground/40">v1.0 · ambiente de desenvolvimento</p>
      </div>

      {/* Formulário */}
      <div className="flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="mb-4 flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <LayoutDashboard className="size-4.5" />
            </div>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">Entrar</h1>
          <p className="mt-1 mb-8 text-sm text-muted-foreground">
            Acesse a plataforma comercial com seu e-mail e senha.
          </p>

          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <FieldGroup>
              <Field data-invalid={!!form.formState.errors.email}>
                <FieldLabel htmlFor="email">E-mail</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="voce@empresa.com"
                  {...form.register("email")}
                />
                <FieldError errors={[form.formState.errors.email]} />
              </Field>

              <Field data-invalid={!!form.formState.errors.senha}>
                <FieldLabel htmlFor="senha">Senha</FieldLabel>
                <Input
                  id="senha"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  {...form.register("senha")}
                />
                <FieldError errors={[form.formState.errors.senha]} />
              </Field>

              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Entrando..." : "Entrar"}
              </Button>
            </FieldGroup>
          </form>
        </div>
      </div>
    </div>
  );
}
