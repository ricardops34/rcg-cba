"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { loginSchema, type LoginInput, type CurrentUser } from "@plataforma/contracts";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-muted/30 p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,color-mix(in_oklch,var(--primary)_18%,transparent),transparent_55%),radial-gradient(circle_at_80%_75%,color-mix(in_oklch,var(--primary)_12%,transparent),transparent_50%)]"
      />
      <Card className="relative w-full max-w-sm shadow-lg">
        <CardHeader>
          <div className="mb-1 flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold">
            PC
          </div>
          <CardTitle className="text-xl">Entrar</CardTitle>
          <CardDescription>Acesse a plataforma comercial com seu e-mail e senha.</CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  );
}
