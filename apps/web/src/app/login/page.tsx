"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Briefcase,
  Building2,
  Eye,
  EyeOff,
  Handshake,
  Layers,
  Lightbulb,
  Lock,
  Mail,
  Pencil,
  Radar,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  loginSchema,
  type LoginInput,
  type CurrentUser,
  type EmpresaBranding,
} from "@plataforma/contracts";
import { apiFetch, ApiError, assetUrl } from "@/lib/api-client";
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

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlAlias = searchParams.get("empresa")?.trim().toLowerCase() ?? "";

  const { accessToken, setTokens, setUser } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);

  // Branding da empresa: quando o alias resolve, exibimos logo e nome dela e
  // escondemos o campo de digitação. Sem alias resolvido, mostramos o campo.
  const [alias, setAlias] = useState(urlAlias);
  const [branding, setBranding] = useState<EmpresaBranding | null>(null);
  const [brandingLoading, setBrandingLoading] = useState(false);
  const aliasInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (accessToken) router.replace("/");
  }, [accessToken, router]);

  // Busca o branding sempre que o alias muda (com debounce), e reflete na URL.
  useEffect(() => {
    const value = alias.trim().toLowerCase();
    if (value.length < 2) {
      setBranding(null);
      setBrandingLoading(false);
      return;
    }

    let cancelled = false;
    setBrandingLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await apiFetch<EmpresaBranding>("/auth/empresa-branding", {
          query: { alias: value },
        });
        if (cancelled) return;
        setBranding(data);
        // Reflete o alias resolvido na URL, para o link ficar compartilhável.
        window.history.replaceState(null, "", `/login?empresa=${data.alias}`);
      } catch {
        if (!cancelled) setBranding(null);
      } finally {
        if (!cancelled) setBrandingLoading(false);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [alias]);

  const trocarEmpresa = () => {
    setBranding(null);
    setAlias("");
    window.history.replaceState(null, "", "/login");
    setTimeout(() => aliasInputRef.current?.focus(), 0);
  };

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", senha: "" },
  });

  const onSubmit = async (values: LoginInput) => {
    try {
      const tokens = await apiFetch<{ accessToken: string; refreshToken: string }>(
        "/auth/login",
        {
          method: "POST",
          body: { ...values, empresaAlias: branding?.alias ?? (alias.trim() || undefined) },
        },
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
          <div className="mb-8 flex flex-col items-center gap-3">
            {branding?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={assetUrl(branding.logoUrl) ?? ""}
                alt={branding.nomeFantasia}
                className="h-12 w-auto max-w-[200px] object-contain"
              />
            ) : (
              <Image src="/logo_bj.png" alt="Plataforma Comercial" width={150} height={51} priority />
            )}
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <FieldGroup>
              {branding ? (
                <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                  <span className="flex items-center gap-2 text-sm">
                    <Building2 className="size-4 text-muted-foreground" />
                    <span className="font-medium">{branding.nomeFantasia}</span>
                  </span>
                  <button
                    type="button"
                    onClick={trocarEmpresa}
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <Pencil className="size-3" /> Trocar
                  </button>
                </div>
              ) : (
                <Field>
                  <FieldLabel htmlFor="empresa-alias">Empresa</FieldLabel>
                  <div className="relative">
                    <Building2 className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="empresa-alias"
                      ref={aliasInputRef}
                      autoCapitalize="none"
                      autoComplete="organization"
                      placeholder="identificador da empresa (ex.: rcg)"
                      className="h-10 pl-9"
                      value={alias}
                      onChange={(e) => setAlias(e.target.value)}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {brandingLoading
                      ? "Buscando empresa..."
                      : "Informe o identificador da sua empresa para acessá-la."}
                  </p>
                </Field>
              )}
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

export default function LoginPage() {
  // useSearchParams exige um limite de Suspense no App Router.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
