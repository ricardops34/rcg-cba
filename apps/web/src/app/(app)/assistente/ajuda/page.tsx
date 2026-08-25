"use client";

import { useQuery } from "@tanstack/react-query";
import type { AgenteApresentacao } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Bot, Lock, MessageSquare, PencilLine, ShieldCheck } from "lucide-react";

/** O que `/agente/ferramentas-disponiveis` devolve. */
interface FerramentaAjuda {
  chave: string;
  nome: string;
  descricao: string;
  escrita: boolean;
  exemplos: string[];
}

/**
 * Como usar o assistente.
 *
 * A lista de ferramentas é **a do usuário que está lendo** — o mesmo recorte
 * que vai para o modelo (permissão do RBAC ∩ configuração da empresa). Uma
 * página de ajuda genérica prometeria capacidades que o vendedor não tem e
 * esconderia as que ele tem; aqui as duas coisas não acontecem.
 */
export default function AssistenteAjudaPage() {
  const podeUsar = useAuthStore((s) => s.hasPermission("agente", "visualizar"));

  const { data: apresentacao } = useQuery({
    queryKey: ["agente-apresentacao"],
    queryFn: () => apiFetch<AgenteApresentacao>("/agente/apresentacao"),
    enabled: podeUsar,
    retry: false,
  });
  const { data: ferramentas, isLoading } = useQuery({
    queryKey: ["agente-ferramentas-disponiveis"],
    queryFn: () =>
      apiFetch<FerramentaAjuda[]>("/agente/ferramentas-disponiveis"),
    enabled: podeUsar,
  });

  const nome = apresentacao?.nomeAgente || "Assistente";

  if (!podeUsar) {
    return (
      <p className="text-sm text-muted-foreground">
        Você não tem acesso ao assistente nesta empresa.
      </p>
    );
  }

  const leitura = (ferramentas ?? []).filter((f) => !f.escrita);
  const escrita = (ferramentas ?? []).filter((f) => f.escrita);

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2">
          <Bot className="size-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Como usar o {nome}</h1>
          <p className="text-sm text-muted-foreground">
            Pergunte em português, como você falaria com um colega. Ele consulta
            o sistema e responde com o que encontrou — e traz o botão para você
            abrir a tela e conferir.
          </p>
        </div>
      </div>

      {/* As três regras que evitam as surpresas mais caras: dado inventado,
          gravação silenciosa e carteira alheia. */}
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="flex gap-3 pt-6">
            <Lock className="size-5 shrink-0 text-muted-foreground" />
            <div className="text-sm">
              <p className="font-medium">Ele vê o que você vê</p>
              <p className="text-muted-foreground">
                Mesma carteira, mesmas permissões. Nada de cliente de outro
                vendedor, nem de rotina que você não acessa.
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex gap-3 pt-6">
            <ShieldCheck className="size-5 shrink-0 text-muted-foreground" />
            <div className="text-sm">
              <p className="font-medium">Nada grava sem você confirmar</p>
              <p className="text-muted-foreground">
                Ação que altera dado vira um card de confirmação. Até você
                clicar em Confirmar, nada foi gravado.
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex gap-3 pt-6">
            <MessageSquare className="size-5 shrink-0 text-muted-foreground" />
            <div className="text-sm">
              <p className="font-medium">Números vêm do sistema</p>
              <p className="text-muted-foreground">
                Ele não estima. Se a consulta não trouxe o dado, ele diz que não
                sabe em vez de arredondar.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="font-medium">O que dá para pedir</h2>
          <p className="text-sm text-muted-foreground">
            Esta lista é a sua: mostra só o que o {nome} pode fazer com as suas
            permissões, nesta empresa.
          </p>
        </div>

        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (ferramentas ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma ferramenta liberada para o seu perfil. Fale com o
            administrador em Administração → Agente IA.
          </p>
        ) : (
          <div className="space-y-3">
            {leitura.map((f) => (
              <LinhaFerramenta key={f.chave} ferramenta={f} />
            ))}

            {escrita.length > 0 && (
              <>
                <div className="flex items-center gap-2 pt-2">
                  <PencilLine className="size-4 text-amber-600 dark:text-amber-400" />
                  <h3 className="text-sm font-medium">
                    Estas alteram dados — e pedem confirmação
                  </h3>
                </div>
                {escrita.map((f) => (
                  <LinhaFerramenta key={f.chave} ferramenta={f} />
                ))}
              </>
            )}
          </div>
        )}
      </section>

      <section className="space-y-2 rounded-lg border p-4 text-sm">
        <h2 className="font-medium">Dicas para uma resposta melhor</h2>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>
            Diga o nome do cliente como está no cadastro, ou o código — se
            houver dois parecidos, ele pergunta qual.
          </li>
          <li>
            Informe o período quando a pergunta for de venda: &quot;de janeiro a
            junho&quot;, &quot;nos últimos 6 meses&quot;.
          </li>
          <li>
            Encerre a conversa (o ícone de borracha) ao mudar de assunto: ele
            deixa de carregar o contexto anterior e responde mais direto.
          </li>
          <li>
            Se a resposta parecer estranha, abra a tela pelo botão que vem
            abaixo dela e confira o dado na fonte.
          </li>
        </ul>
      </section>
    </div>
  );
}

function LinhaFerramenta({ ferramenta }: { ferramenta: FerramentaAjuda }) {
  return (
    <Card>
      <CardContent className="space-y-2 pt-6">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{rotuloAmigavel(ferramenta)}</p>
          {ferramenta.escrita && (
            <Badge
              variant="outline"
              className="border-amber-500/40 text-amber-700 dark:text-amber-400"
            >
              Pede confirmação
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{ferramenta.descricao}</p>
        {ferramenta.exemplos.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {ferramenta.exemplos.map((e) => (
              <span
                key={e}
                className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
              >
                &ldquo;{e}&rdquo;
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * `buscar_cliente` → "Buscar cliente". A chave é identificador de código; a
 * empresa pode ter reescrito o nome na configuração, e aí vale o que ela
 * escreveu.
 */
function rotuloAmigavel(f: FerramentaAjuda): string {
  if (f.nome !== f.chave) return f.nome;
  const texto = f.chave.replace(/_/g, " ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
