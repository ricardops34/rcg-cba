"use client";

import { useQuery } from "@tanstack/react-query";
import type { Produto } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResizableSheetContent } from "@/components/ui/resizable-sheet-content";
import { StatusDot } from "@/components/crud/status-dot";
import { CopiarBotao } from "@/components/crud/copiar-botao";
import { ProdutoFotosCard } from "@/components/crud/produto-fotos-card";
import { ProdutoEstoqueCard } from "@/components/comercial/produto-estoque-card";
import { ProdutoPrecosCard } from "@/components/comercial/produto-precos-card";
import { regraDescontoLabel } from "@/lib/regra-desconto";
import { useAuthStore } from "@/stores/auth-store";

export type ProdutoDetalhe = Produto & {
  categoria?: {
    id: string;
    codigoErp: string | null;
    descricao: string;
  } | null;
  subCategoria?: {
    id: string;
    codigoErp: string | null;
    descricao: string;
  } | null;
  armazem?: { id: string; codigoErp: string | null; descricao: string } | null;
};

function Info({
  label,
  value,
  copiavel = false,
  mono = false,
}: {
  label: string;
  value: string | number | null | undefined;
  /** Mostra o botão de copiar ao lado do valor (só quando há valor). */
  copiavel?: boolean;
  mono?: boolean;
}) {
  const vazio = value == null || value === "";
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-1">
        <p className={`text-sm break-words ${mono && !vazio ? "font-mono" : ""} ${vazio ? "text-muted-foreground" : ""}`}>
          {vazio ? "—" : value}
        </p>
        {copiavel && !vazio && <CopiarBotao valor={String(value)} rotulo={label} />}
      </div>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {titulo}
      </h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 @xl:grid-cols-4">{children}</div>
    </section>
  );
}

const numero = (v: number | null | undefined) =>
  v == null ? null : v.toLocaleString("pt-BR", { maximumFractionDigits: 4 });

/**
 * Título do produto: descrição e código ERP, cada um com botão de copiar — são
 * os dois valores que o vendedor leva para o ERP, a busca ou o WhatsApp.
 * Usado no cabeçalho da página cheia e da cortina.
 */
export function ProdutoTitulo({
  produto,
  titulo: Titulo = "h1",
}: {
  produto: ProdutoDetalhe;
  /** Elemento do título: na cortina é o SheetTitle, que dá nome ao diálogo. */
  titulo?: React.ElementType<{ className?: string; children?: React.ReactNode }>;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex items-start gap-1.5">
        <Titulo className="text-lg font-semibold leading-snug tracking-tight">
          {produto.descricao}
        </Titulo>
        <CopiarBotao valor={produto.descricao} rotulo="Descrição" className="mt-0.5 shrink-0" />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-0.5 rounded-md border bg-muted/40 pl-2 font-mono text-xs text-foreground">
          {produto.codigoErp}
          <CopiarBotao valor={produto.codigoErp} rotulo="Código ERP" />
        </span>
        <StatusDot active={produto.ativo} />
        {!produto.ativo && <Badge variant="destructive">Inativo</Badge>}
      </div>
    </div>
  );
}

/** Corpo da aba Dados gerais — usado tanto na página cheia quanto na cortina. */
export function ProdutoDetalheContent({
  produto,
  permitirEdicaoFoto = false,
}: {
  produto: ProdutoDetalhe;
  permitirEdicaoFoto?: boolean;
}) {
  return (
    <div className="space-y-4">
      <ProdutoFotosCard produto={produto} permitirEdicao={permitirEdicaoFoto} />
      <Card>
        <CardContent className="@container space-y-5">
          <Secao titulo="Identificação">
            <Info label="Código ERP" value={produto.codigoErp} copiavel mono />
            <Info label="Código do fornecedor" value={produto.codigoFornecedor} copiavel mono />
            <Info label="Código de barras" value={produto.codigoBarras} copiavel mono />
            <Info label="NCM" value={produto.ncm} copiavel mono />
          </Secao>
          <Secao titulo="Classificação">
            <Info label="Categoria" value={produto.categoria?.descricao} />
            <Info label="Subcategoria" value={produto.subCategoria?.descricao} />
            <Info label="Marca" value={produto.marca} />
            <Info label="Armazém" value={produto.armazem?.descricao} />
          </Secao>
          <Secao titulo="Embalagem">
            <Info label="Unidade" value={produto.unidade} />
            <Info label="Qtd. embalagem" value={numero(produto.qtdEmbalagem)} />
            <Info label="Peso" value={numero(produto.peso)} />
            {/* No Protheus a regra vive no item da tabela de preço (DA1_XDESC);
                o produto só tem vínculo próprio quando cadastrado na plataforma. */}
            {produto.regraDesconto ? (
              <Info label="Regra de desconto" value={regraDescontoLabel(produto.regraDesconto)} />
            ) : (
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Regra de desconto</p>
                <p className="text-sm text-muted-foreground">Por tabela de preço — ver aba Preços</p>
              </div>
            )}
          </Secao>
          {produto.observacao && (
            <section className="space-y-1">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Observação
              </h3>
              <p className="whitespace-pre-line text-sm">{produto.observacao}</p>
            </section>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Cortina lateral com o detalhe do produto — usada dentro da Posição de
 * Cliente (aba Mix) pra não perder a busca/scroll/aba de quem está
 * consultando a posição.
 */
export function ProdutoSheet({
  id,
  onOpenChange,
}: {
  id: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const verEstoque = useAuthStore((state) => state.hasPermission("estoque", "visualizar"));
  const {
    data: produto,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["produtos", id],
    queryFn: () => apiFetch<ProdutoDetalhe>(`/produtos/${id}`),
    enabled: !!id,
  });

  return (
    <Sheet open={!!id} onOpenChange={onOpenChange}>
      <ResizableSheetContent defaultWidth={560}>
        <SheetHeader className="pr-10">
          {produto ? (
            <ProdutoTitulo produto={produto} titulo={SheetTitle} />
          ) : (
            <SheetTitle>Produto</SheetTitle>
          )}
        </SheetHeader>
        <div className="px-4 pb-4">
          {isLoading && <Skeleton className="h-64 w-full rounded-xl" />}
          {isError && (
            <p className="text-sm text-muted-foreground">
              Produto não encontrado.
            </p>
          )}
          {produto && (
            // key: ao trocar de produto a cortina volta para Dados gerais.
            <Tabs key={produto.id} defaultValue="dados">
              <TabsList>
                <TabsTrigger value="dados">Dados gerais</TabsTrigger>
                {verEstoque && <TabsTrigger value="estoque">Estoque</TabsTrigger>}
                <TabsTrigger value="precos">Preços</TabsTrigger>
              </TabsList>
              <TabsContent value="dados">
                <ProdutoDetalheContent produto={produto} />
              </TabsContent>
              {verEstoque && (
                <TabsContent value="estoque">
                  <ProdutoEstoqueCard produtoId={produto.id} />
                </TabsContent>
              )}
              <TabsContent value="precos">
                <ProdutoPrecosCard produtoId={produto.id} />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </ResizableSheetContent>
    </Sheet>
  );
}
