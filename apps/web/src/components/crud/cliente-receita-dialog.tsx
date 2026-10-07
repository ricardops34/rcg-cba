"use client";

import Link from "next/link";
import { CAMPO_CLIENTE_LABEL } from "@plataforma/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Resposta de POST /clientes/:id/atualizar-receita. */
export interface ResultadoReceita {
  atualizado?: boolean;
  motivo?: string;
  situacaoCadastral?: string | null;
  cnaesSemReferencia?: string[];
  solicitacaoId?: string | null;
  camposPendentes?: string[];
  /** Campos que estavam vazios e foram preenchidos na hora. */
  camposAtualizados?: string[];
}

/**
 * Resultado da consulta do CNPJ de um cliente já cadastrado. Campo que estava
 * vazio — inclusive o CNAE de quem não tinha nenhum — foi preenchido na hora;
 * o que a Receita tem de diferente virou uma solicitação, que quem tem
 * clientes.aprovar analisa campo a campo em Alterações de clientes.
 */
export function ResultadoReceitaDialog({
  resultado,
  onClose,
}: {
  resultado: ResultadoReceita | null;
  onClose: () => void;
}) {
  const campos = resultado?.camposPendentes ?? [];
  const preenchidos = resultado?.camposAtualizados ?? [];
  const semReferencia = resultado?.cnaesSemReferencia ?? [];
  return (
    <Dialog open={!!resultado} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Consulta do CNPJ na Receita</DialogTitle>
          <DialogDescription>
            Campo vazio no cadastro é preenchido na hora. O que a Receita tem de diferente vai para análise e
            aprovação.
          </DialogDescription>
        </DialogHeader>

        {resultado?.motivo ? (
          <p className="text-sm">{resultado.motivo}</p>
        ) : (
          <div className="space-y-3 text-sm">
            {resultado?.situacaoCadastral && (
              <p>
                Situação na Receita:{" "}
                <Badge variant={resultado.situacaoCadastral === "ATIVA" ? "outline" : "destructive"}>
                  {resultado.situacaoCadastral}
                </Badge>
              </p>
            )}
            {preenchidos.length > 0 && (
              <div className="space-y-1">
                <p>Preenchido(s) no cadastro, que estava(m) vazio(s):</p>
                <div className="flex flex-wrap gap-1">
                  {preenchidos.map((c) => (
                    <Badge key={c} variant="outline">{CAMPO_CLIENTE_LABEL[c] ?? c}</Badge>
                  ))}
                </div>
              </div>
            )}
            {campos.length === 0 ? (
              preenchidos.length === 0 && (
                <p>O cadastro já está igual ao da Receita. Nenhuma solicitação foi aberta.</p>
              )
            ) : (
              <div className="space-y-1">
                <p>Solicitação aberta com {campos.length} campo(s) para análise:</p>
                <div className="flex flex-wrap gap-1">
                  {campos.map((c) => (
                    <Badge key={c} variant="secondary">{CAMPO_CLIENTE_LABEL[c] ?? c}</Badge>
                  ))}
                </div>
              </div>
            )}
            {semReferencia.length > 0 && (
              <p className="text-xs text-muted-foreground">
                CNAE(s) {semReferencia.join(", ")} não existem na referência local e ficaram de fora (sincronize as
                referências do IBGE).
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          {!!resultado?.solicitacaoId && (
            <Button asChild>
              <Link href="/cadastros/clientes-alteracoes">Analisar e aprovar</Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
