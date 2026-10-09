"use client";

import { useState } from "react";
import { BookOpen, ChevronDown } from "lucide-react";
import {
  INTEGRACAO_CARGA_ENTIDADES,
  INTEGRACAO_CARGA_FORMATOS,
  INTEGRACAO_CARGA_MAX_BYTES,
  type IntegracaoCargaEntidade,
} from "@plataforma/contracts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopiarBotao } from "@/components/crud/copiar-botao";
import { ORDEM_CARGA } from "./cargas-tab";

/** A ordem de carga primeiro; o que a tela não ordena (pedidos) vai no fim. */
const ENTIDADES: IntegracaoCargaEntidade[] = [
  ...ORDEM_CARGA,
  ...INTEGRACAO_CARGA_ENTIDADES.filter(
    (e) => !(ORDEM_CARGA as readonly string[]).includes(e),
  ),
];

/**
 * Documentação do arquivo de carga, na própria tela de Upload: a regra geral
 * e, por entidade, a chave, as dependências e uma linha de exemplo. O exemplo
 * é o mesmo do Swagger (INTEGRACAO_CARGA_FORMATOS, no contrato), e um teste da
 * API o valida no schema que a carga aplica.
 */
export function FormatosCarga() {
  const [aberto, setAberto] = useState(false);
  const [entidade, setEntidade] = useState<IntegracaoCargaEntidade>("clientes");
  const formato = INTEGRACAO_CARGA_FORMATOS[entidade];
  const linha = JSON.stringify({ entidade, registro: formato.exemplo });

  return (
    <Card className="border-border/70 shadow-xs">
      <Collapsible open={aberto} onOpenChange={setAberto}>
        <CollapsibleTrigger className="flex w-full items-center gap-2 p-4 text-left text-sm font-medium">
          <BookOpen className="size-4 text-muted-foreground" />
          Formato dos arquivos de carga
          <ChevronDown
            className={`ml-auto size-4 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4 px-4 pt-0 pb-4 text-sm">
            <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
              <li>
                <strong className="text-foreground">JSON Lines</strong>: um registro por linha,
                no formato{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  {'{"entidade":"<entidade>","registro":{...}}'}
                </code>
                . Extensão <code>.json</code>, <code>.jsonl</code> ou <code>.txt</code>, em
                UTF-8; pode vir compactado em <code>.gz</code>. Até{" "}
                {Math.round(INTEGRACAO_CARGA_MAX_BYTES / 1024 / 1024)} MB por arquivo — passou
                disso, divida em partes (<code>clientes-parte01.json</code>,{" "}
                <code>clientes-parte02.json</code>…).
              </li>
              <li>
                <strong className="text-foreground">Ordem</strong>: o que um registro referencia
                precisa ter chegado antes (vendedor antes de cliente, cliente antes de nota). O
                nome do arquivo começando pela entidade (<code>notas-saida-2026.json</code>) faz
                a tela enviar na ordem certa.
              </li>
              <li>
                <strong className="text-foreground">Chave</strong>: cada registro é gravado pela{" "}
                <code>chave</code>. Reenviar o mesmo arquivo não duplica — atualiza. As
                referências (<code>vendedorChave</code>, <code>clienteChave</code>…) são a chave
                do registro referenciado, no formato <code>FILIAL-CÓDIGO</code>; filial em branco
                fica <code>-CÓDIGO</code>.
              </li>
              <li>
                <strong className="text-foreground">Excluir</strong>:{" "}
                <code>{'"excluido": true'}</code> no registro, junto da <code>chave</code>.
              </li>
              <li>
                <strong className="text-foreground">Recusas</strong>: registro com erro não
                impede os outros; cada um aparece em Processamento, no log da carga, com o motivo.
              </li>
            </ul>

            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">Entidade</span>
                <Select
                  value={entidade}
                  onValueChange={(v) => setEntidade(v as IntegracaoCargaEntidade)}
                >
                  <SelectTrigger size="sm" className="w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ENTIDADES.map((e, i) => (
                      <SelectItem key={e} value={e}>
                        {i + 1}. {INTEGRACAO_CARGA_FORMATOS[e].nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <code className="text-xs text-muted-foreground">&quot;entidade&quot;: &quot;{entidade}&quot;</code>
              </div>

              <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[8rem_1fr]">
                <dt className="text-muted-foreground">Chave</dt>
                <dd className="font-mono text-xs break-all">{formato.chave}</dd>
                <dt className="text-muted-foreground">Depende de</dt>
                <dd className="flex flex-wrap gap-1">
                  {formato.dependeDe.length === 0
                    ? <span className="text-muted-foreground">nada — pode ir primeiro</span>
                    : formato.dependeDe.map((d) => (
                        <Badge key={d} variant="outline">{INTEGRACAO_CARGA_FORMATOS[d].nome}</Badge>
                      ))}
                </dd>
                {formato.observacao && (
                  <>
                    <dt className="text-muted-foreground">Observação</dt>
                    <dd>{formato.observacao}</dd>
                  </>
                )}
              </dl>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground">
                  Exemplo de registro
                  <CopiarBotao valor={linha} rotulo="Linha de exemplo" />
                  <span className="text-xs">(a linha copiada vai sem quebras, como no arquivo)</span>
                </div>
                <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify({ entidade, registro: formato.exemplo }, null, 2)}
                </pre>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
