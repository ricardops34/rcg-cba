"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Eraser, Sparkles, Trash2 } from "lucide-react";
import type { DemoLimpeza, DemoResumo } from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/**
 * Base de demonstração de **uma empresa**, no detalhe dela.
 *
 * Fica aqui, e não numa tela própria, porque a pergunta que antecede a ação é
 * sempre "em qual empresa?" — e no detalhe ela já está respondida pela página
 * em que se está.
 *
 * As duas operações parecem vizinhas e não são: popular é repetível e só mexe
 * no conjunto `DEMO-`; limpar apaga o cadastro real e não tem volta. Por isso
 * o bloco destrutivo tem moldura própria e confirmação digitada.
 */
export function DemoDadosEmpresa({
  empresaId,
  razaoSocial,
}: {
  empresaId: string;
  razaoSocial: string;
}) {
  const permissoes = useAuthStore((s) => s.user?.permissoes);
  const podePopular = Boolean(permissoes?.includes("demo-dados.cadastrar"));
  const podeLimpar = Boolean(permissoes?.includes("demo-dados.excluir"));

  const [confirmacao, setConfirmacao] = useState("");
  const [resumo, setResumo] = useState<DemoResumo | null>(null);
  const [limpeza, setLimpeza] = useState<DemoLimpeza | null>(null);
  const queryClient = useQueryClient();

  const erro = (e: unknown, padrao: string) =>
    toast.error(e instanceof ApiError ? e.message : padrao);

  /** O que foi gerado ou apagado aparece em todas as telas. */
  const invalidarTudo = () => void queryClient.invalidateQueries();

  const gerar = useMutation({
    mutationFn: () =>
      apiFetch<DemoResumo>(`/empresas/${empresaId}/demo/dados`, {
        method: "POST",
      }),
    onSuccess: (r) => {
      setResumo(r);
      setLimpeza(null);
      invalidarTudo();
      toast.success("Base de demonstração criada");
    },
    onError: (e) => erro(e, "Não consegui gerar a base de demonstração"),
  });

  const removerDemo = useMutation({
    mutationFn: () =>
      apiFetch(`/empresas/${empresaId}/demo/dados`, { method: "DELETE" }),
    onSuccess: () => {
      setResumo(null);
      invalidarTudo();
      toast.success("Dados de demonstração removidos");
    },
    onError: (e) => erro(e, "Não consegui remover os dados de demonstração"),
  });

  const limparBase = useMutation({
    mutationFn: () =>
      apiFetch<DemoLimpeza>(`/empresas/${empresaId}/demo/base`, {
        method: "DELETE",
        body: { confirmacao },
      }),
    onSuccess: (r) => {
      setLimpeza(r);
      setResumo(null);
      setConfirmacao("");
      invalidarTudo();
      toast.success(`Base limpa: ${r.total} registro(s) apagados`);
    },
    onError: (e) => erro(e, "Não consegui limpar a base"),
  });

  const ocupado =
    gerar.isPending || removerDemo.isPending || limparBase.isPending;

  // Sem nenhuma das duas permissões não há o que mostrar — nem o aviso, que
  // só ensinaria que a capacidade existe a quem não pode usá-la.
  if (!podePopular && !podeLimpar) return null;

  return (
    <div className="space-y-4">
      {podePopular && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="size-4" />
                Base de demonstração
              </h2>
              <p className="pt-1 text-sm text-muted-foreground">
                Popula <strong>{razaoSocial}</strong> com oito meses de
                movimento fictício: seis meses fechados, o corrente até hoje e o
                seguinte inteiro — para quem navegar para a frente não encontrar
                tela vazia.
              </p>
            </div>

            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>
                clientes com CNAE e cesta de compra por ramo (a Sugestão de
                Compra depende disso)
              </li>
              <li>notas com XML de NF-e, para a 2ª via do DANFE funcionar</li>
              <li>títulos com dados de boleto, para a 2ª via do boleto funcionar</li>
              <li>metas por mês, orçamentos, agenda, funil e conversas de WhatsApp</li>
            </ul>

            <p className="rounded-lg bg-muted px-3 py-2 text-sm">
              Tudo leva o prefixo <code>DEMO-</code>. Gerar de novo apaga o
              conjunto anterior e cria outro —{" "}
              <strong>o que foi cadastrado à mão não é tocado</strong>.
            </p>

            <div className="flex flex-wrap gap-2">
              <Button disabled={ocupado} onClick={() => gerar.mutate()}>
                <Sparkles className="size-4" />
                {gerar.isPending
                  ? "Gerando… (pode levar alguns minutos)"
                  : "Popular com dados de demonstração"}
              </Button>
              <Button
                variant="outline"
                disabled={ocupado}
                onClick={() => removerDemo.mutate()}
              >
                <Eraser className="size-4" />
                {removerDemo.isPending
                  ? "Removendo…"
                  : "Remover só os dados DEMO-"}
              </Button>
            </div>

            {resumo && (
              <div className="space-y-2 rounded-lg border p-3 text-sm">
                <p className="font-medium">
                  Criado em {resumo.empresa} — {resumo.periodo.join(", ")}
                </p>
                <ul className="grid gap-1 sm:grid-cols-2">
                  <li>
                    {resumo.clientes} clientes · {resumo.produtos} produtos
                  </li>
                  <li>{resumo.notas} notas com XML</li>
                  <li>
                    {resumo.titulos} títulos ({resumo.titulosComBoleto} com
                    boleto)
                  </li>
                  <li>
                    {resumo.orcamentos} orçamentos · {resumo.atividades}{" "}
                    atividades
                  </li>
                  <li>{resumo.conversas} conversas de WhatsApp</li>
                  <li>{resumo.usuarios} usuários criados</li>
                </ul>
                <div className="pt-2">
                  <p className="font-medium">
                    Entre com a senha <code>{resumo.senha}</code>:
                  </p>
                  <ul className="pt-1 text-muted-foreground">
                    {resumo.acessos.map((a) => (
                      <li key={a.email}>
                        {a.email} — {a.perfil}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {podeLimpar && (
        <Card className="border-destructive/40">
          <CardContent className="space-y-4 pt-6">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-destructive">
                <AlertTriangle className="size-4" />
                Limpar a base desta empresa
              </h2>
              <p className="pt-1 text-sm text-muted-foreground">
                Apaga <strong>todo</strong> o dado de negócio de{" "}
                <strong>{razaoSocial}</strong> — inclusive o que foi cadastrado
                à mão. Não tem como desfazer.
              </p>
            </div>

            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-lg border border-destructive/30 p-3">
                <p className="font-medium text-destructive">Apaga</p>
                <p className="pt-1 text-muted-foreground">
                  clientes, produtos, notas, títulos, orçamentos, metas, CRM,
                  conversas de WhatsApp, mural e o cadastro de vendedor.
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="font-medium">Preserva</p>
                <p className="pt-1 text-muted-foreground">
                  usuários e acessos, parâmetros e configurações, a chave de API
                  do agente, o pareamento do WhatsApp e a trilha de auditoria.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {/* Digitar em vez de clicar "tem certeza?": estando numa lista de
                  empresas, o erro caro não é o clique acidental — é apagar a
                  base da empresa errada sem perceber qual estava aberta. */}
              <label className="text-sm" htmlFor="confirmacao-limpeza">
                Para liberar, digite a razão social exata:{" "}
                <code className="text-xs">{razaoSocial}</code>
              </label>
              <Input
                id="confirmacao-limpeza"
                value={confirmacao}
                disabled={ocupado}
                placeholder="Razão social"
                onChange={(e) => setConfirmacao(e.target.value)}
              />
            </div>

            <Button
              variant="destructive"
              disabled={ocupado || confirmacao.trim().length === 0}
              onClick={() => limparBase.mutate()}
            >
              <Trash2 className="size-4" />
              {limparBase.isPending ? "Limpando…" : "Limpar a base desta empresa"}
            </Button>

            {limpeza && (
              <div className="rounded-lg border p-3 text-sm">
                <p className="font-medium">
                  {limpeza.total} registro(s) apagados em{" "}
                  {limpeza.apagados.length} tabela(s).
                </p>
                <ul className="pt-1 text-muted-foreground">
                  {limpeza.apagados.map((a) => (
                    <li key={a.tabela}>
                      {a.tabela}: {a.linhas}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
