"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Briefcase,
  Eye,
  EyeOff,
  Handshake,
  Layers,
  Lightbulb,
  Lock,
  Mail,
  Radar,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { loginSchema, type LoginInput, type CurrentUser } from "@plataforma/contracts";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";

const SERVICOS = [
  { icon: Target, label: "Metas e indicadores" },
  { icon: TrendingUp, label: "Histórico e tendências" },
  { icon: Lightbulb, label: "Sugestão de venda" },
  { icon: Layers, label: "Mix ideal do cliente" },
  { icon: Briefcase, label: "Carteira e oportunidades" },
  { icon: BarChart3, label: "Performance comercial" },
  { icon: Users, label: "Ação da equipe" },
  { icon: Radar, label: "Inteligência de mercado" },
];

const PILARES = [
  { icon: ShieldCheck, label: "Confiança" },
  { icon: BarChart3, label: "Performance" },
  { icon: Handshake, label: "Relacionamento" },
  { icon: BadgeCheck, label: "Resultados" },
];

export default function LoginPage() {
  const router = useRouter();
  const { accessToken, setTokens, setUser } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);

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

      // "Lembrar de mim": sem a marca de sessão, o guard encerra o acesso
      // quando o navegador for fechado (nova sessão sem o marcador).
      if (remember) {
        localStorage.removeItem("plataforma-auth-ephemeral");
      } else {
        localStorage.setItem("plataforma-auth-ephemeral", "1");
      }
      sessionStorage.setItem("plataforma-auth-session", "1");

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
    <div className="flex h-svh flex-col overflow-hidden">
      {/* Faixa magenta da marca allia — full-width no topo */}
      <div className="flex h-9 shrink-0 items-center justify-center bg-[#bd1e7d] sm:h-11">
        <Image
          src="/allia.png"
          alt="allia — Empresa associada"
          width={240}
          height={44}
          priority
          className="h-[22px] w-auto brightness-0 invert sm:h-7"
        />
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[1.1fr_1fr]">
      {/* Painel de marca — imagem de fundo RCG em azul-marinho */}
      <div className="relative hidden flex-col justify-center gap-10 overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <Image
          src="/fundo_login.png"
          alt=""
          aria-hidden
          fill
          priority
          sizes="(min-width: 1024px) 55vw, 0px"
          className="pointer-events-none object-cover object-center select-none"
        />
        {/* Sobreposição para legibilidade do texto sobre a imagem */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-linear-to-r from-sidebar/95 via-sidebar/70 to-sidebar/30"
        />

        <div className="relative max-w-md space-y-8">
          <p className="text-3xl leading-snug font-semibold text-balance">
            Dados que impulsionam vendas.
          </p>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-3.5 text-sm text-sidebar-foreground/75">
            {SERVICOS.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-white/5 ring-1 ring-white/10">
                  <Icon className="size-3.5 text-cyan-300" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Formulário — sempre em tema claro (fundo branco) */}
      <div className="theme-light flex items-center justify-center overflow-y-auto bg-background p-6 text-foreground">
        <div className="w-full max-w-sm py-4">
          <div className="mb-8 flex justify-center">
            <Image src="/rcglogo.png" alt="RCG Distribuidora" width={150} height={51} priority />
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <FieldGroup>
              <Field data-invalid={!!form.formState.errors.email}>
                <FieldLabel htmlFor="email">E-mail</FieldLabel>
                <div className="relative">
                  <Mail className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    placeholder="seu@email.com"
                    className="h-10 pl-9"
                    {...form.register("email")}
                  />
                </div>
                <FieldError errors={[form.formState.errors.email]} />
              </Field>

              <Field data-invalid={!!form.formState.errors.senha}>
                <FieldLabel htmlFor="senha">Senha</FieldLabel>
                <div className="relative">
                  <Lock className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="senha"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="h-10 pr-10 pl-9"
                    {...form.register("senha")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <FieldError errors={[form.formState.errors.senha]} />
              </Field>

              <div className="flex items-center justify-between">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground select-none">
                  <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
                  Lembrar de mim
                </label>
                <button
                  type="button"
                  onClick={() =>
                    toast.info("Fale com o administrador do sistema para redefinir sua senha.")
                  }
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Esqueci minha senha
                </button>
              </div>

              <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
                <span className="flex-1 text-center">
                  {form.formState.isSubmitting ? "Acessando..." : "Acessar"}
                </span>
                <ArrowRight className="size-4" />
              </Button>
            </FieldGroup>
          </form>

          <div className="mt-10 grid grid-cols-4 gap-2 border-t border-border/60 pt-6">
            {PILARES.map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-1.5 text-center">
                <Icon className="size-4.5 text-primary/70" />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
