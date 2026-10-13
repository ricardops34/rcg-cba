"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  Bold,
  Eye,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Minus,
  Pencil,
  Pilcrow,
  Quote,
  Redo,
  RemoveFormatting,
  ShieldCheck,
  Sparkles,
  Trash2,
  Underline,
  Undo,
} from "lucide-react";
import {
  TERMOS_USO_PLATAFORMA_PADRAO,
  gerarSugestaoTermosEmpresa,
} from "@plataforma/contracts";
import {
  htmlParaTextoPlano,
  markdownParaHtml,
  sanitizarHtml,
} from "@/lib/termos-formatacao";
import { VisualizadorTermos } from "@/components/termos/visualizador-termos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface EmpresaTermosEditorProps {
  valor: string | null | undefined;
  onChange: (novoValor: string) => void;
  empresaNome?: string;
  empresaRazaoSocial?: string;
  empresaCnpj?: string;
  disabled?: boolean;
}

export function EmpresaTermosEditor({
  valor = "",
  onChange,
  empresaNome,
  empresaRazaoSocial,
  empresaCnpj,
  disabled = false,
}: EmpresaTermosEditorProps) {
  const [visualizacaoAtiva, setVisualizacaoAtiva] = useState<"editor" | "preview">("editor");
  const [dialogPlataformaAberto, setDialogPlataformaAberto] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const estaFocadoRef = useRef(false);

  // Converte valor inicial (se for markdown antigo) para HTML limpo
  const htmlInicial = markdownParaHtml(valor ?? "");

  // Sincroniza o conteúdo do contentEditable quando o valor externo mudar (e o usuário não estiver digitando)
  useEffect(() => {
    if (!editorRef.current) return;
    if (estaFocadoRef.current) return;

    const htmlAtualNoEditor = editorRef.current.innerHTML;
    const htmlEsperado = markdownParaHtml(valor ?? "");

    if (htmlAtualNoEditor !== htmlEsperado) {
      editorRef.current.innerHTML = htmlEsperado;
    }
  }, [valor]);

  const textoPlano = htmlParaTextoPlano(valor ?? "");
  const totalCaracteres = textoPlano.length;
  const totalPalavras = textoPlano ? textoPlano.split(/\s+/).length : 0;

  /** Executa comando de formatação no editor visual mantendo a seleção do usuário */
  const executarComando = (comando: string, parametro: string | undefined = undefined) => {
    if (disabled || !editorRef.current) return;
    editorRef.current.focus();
    // Executa comando nativo do navegador para Rich Text
    document.execCommand(comando, false, parametro);
    atualizarValor();
  };

  const atualizarValor = () => {
    if (!editorRef.current) return;
    const html = sanitizarHtml(editorRef.current.innerHTML);
    onChange(html);
  };

  const carregarSugestao = () => {
    if (disabled) return;
    if (
      textoPlano.length > 0 &&
      !confirm(
        "Deseja carregar a sugestão padrão de termos? O texto atual será substituído pelo modelo formatado com os dados da empresa.",
      )
    ) {
      return;
    }

    const sugestaoMd = gerarSugestaoTermosEmpresa({
      nomeFantasia: empresaNome,
      razaoSocial: empresaRazaoSocial,
      cnpj: empresaCnpj,
    });

    const sugestaoHtml = markdownParaHtml(sugestaoMd);

    if (editorRef.current) {
      editorRef.current.innerHTML = sugestaoHtml;
    }
    onChange(sugestaoHtml);
  };

  const limparConteudo = () => {
    if (disabled) return;
    if (
      textoPlano.length > 0 &&
      !confirm("Deseja realmente limpar os termos de uso da empresa?")
    ) {
      return;
    }
    if (editorRef.current) {
      editorRef.current.innerHTML = "";
    }
    onChange("");
  };

  return (
    <div className="space-y-6">
      {/* 1. TERMOS DA PLATAFORMA (FIXOS) */}
      <Card className="border-border/70 bg-muted/20">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ShieldCheck className="size-4" />
              </div>
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  Termos de Uso da Plataforma
                  <Badge variant="secondary" className="text-[11px] font-normal">
                    Fixo · Global
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  Condições contratuais gerais de segurança, infraestrutura e auditoria do sistema SaaS.
                </CardDescription>
              </div>
            </div>

            <Dialog
              open={dialogPlataformaAberto}
              onOpenChange={setDialogPlataformaAberto}
            >
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 shrink-0">
                  <Eye className="size-3.5" />
                  Visualizar Termos da Plataforma
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <ShieldCheck className="size-5 text-primary" />
                    Termos de Uso da Plataforma Comercial
                  </DialogTitle>
                  <DialogDescription>
                    Documento global imutável aplicável a todas as empresas e usuários da plataforma.
                  </DialogDescription>
                </DialogHeader>
                <div className="mt-2 rounded-lg border bg-card p-5">
                  <VisualizadorTermos conteudo={TERMOS_USO_PLATAFORMA_PADRAO} />
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
      </Card>

      {/* 2. EDITOR VISUAL DOS TERMOS DA EMPRESA (WYSIWYG) */}
      <Card className="border-border shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="size-5 text-primary" />
                <CardTitle className="text-lg">
                  Termos de Uso e Normas da Empresa
                </CardTitle>
                {textoPlano.length > 0 ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs"
                  >
                    Personalizado
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">
                    Não configurado
                  </Badge>
                )}
              </div>
              <CardDescription className="mt-1 text-xs">
                Edite as normas internas, política de confidencialidade e regras de orçamento de{" "}
                <span className="font-medium text-foreground">{empresaNome || "sua empresa"}</span>.
                O texto é formatado visualmente em tempo real.
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={carregarSugestao}
                disabled={disabled}
                className="gap-1.5 h-8 text-xs font-medium border-primary/30 text-primary hover:bg-primary/5"
                title="Insere um modelo completo pré-formatado com os dados da empresa"
              >
                <Sparkles className="size-3.5" />
                Carregar sugestão padrão
              </Button>
              {textoPlano.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={limparConteudo}
                  disabled={disabled}
                  className="h-8 text-xs text-muted-foreground hover:text-destructive gap-1"
                >
                  <Trash2 className="size-3.5" />
                  Limpar
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-2 pt-0">
          {/* BARRA DE FERRAMENTAS VISUAL (TOOLBAR WYSIWYG) */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-lg border border-b-0 bg-muted/40 p-2">
            <div className="flex flex-wrap items-center gap-0.5">
              {/* Estilos de Título */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Título Principal"
                onMouseDown={(e) => {
                  e.preventDefault();
                  executarComando("formatBlock", "<h1>");
                }}
                disabled={disabled || visualizacaoAtiva === "preview"}
              >
                <Heading1 className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Título de Seção"
                onMouseDown={(e) => {
                  e.preventDefault();
                  executarComando("formatBlock", "<h2>");
                }}
                disabled={disabled || visualizacaoAtiva === "preview"}
              >
                <Heading2 className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Subtítulo"
                onMouseDown={(e) => {
                  e.preventDefault();
                  executarComando("formatBlock", "<h3>");
                }}
                disabled={disabled || visualizacaoAtiva === "preview"}
              >
                <Heading3 className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Texto Normal (Parágrafo)"
                onMouseDown={(e) => {
                  e.preventDefault();
                  executarComando("formatBlock", "<p>");
                }}
                disabled={disabled || visualizacaoAtiva === "preview"}
              >
                <Pilcrow className="size-4" />
              </Button>

              <div className="mx-1 h-4 w-px bg-border" />

              {/* Formatação Básica: Negrito, Itálico, Sublinhado */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 font-bold"
                title="Negrito (Ctrl+B)"
                onMouseDown={(e) => {
                  e.preventDefault();
                  executarComando("bold");
                }}
                disabled={disabled || visualizacaoAtiva === "preview"}
              >
                <Bold className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Itálico (Ctrl+I)"
                onMouseDown={(e) => {
                  e.preventDefault();
                  executarComando("italic");
                }}
                disabled={disabled || visualizacaoAtiva === "preview"}
              >
                <Italic className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Sublinhado (Ctrl+U)"
                onMouseDown={(e) => {
                  e.preventDefault();
                  executarComando("underline");
                }}
                disabled={disabled || visualizacaoAtiva === "preview"}
              >
                <Underline className="size-4" />
              </Button>

              <div className="mx-1 h-4 w-px bg-border" />

              {/* Listas */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Lista com Marcadores"
                onMouseDown={(e) => {
                  e.preventDefault();
                  executarComando("insertUnorderedList");
                }}
                disabled={disabled || visualizacaoAtiva === "preview"}
              >
                <List className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Lista Numerada"
                onMouseDown={(e) => {
                  e.preventDefault();
                  executarComando("insertOrderedList");
                }}
                disabled={disabled || visualizacaoAtiva === "preview"}
              >
                <ListOrdered className="size-4" />
              </Button>

              <div className="mx-1 h-4 w-px bg-border" />

              {/* Alinhamento */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Alinhar à Esquerda"
                onMouseDown={(e) => {
                  e.preventDefault();
                  executarComando("justifyLeft");
                }}
                disabled={disabled || visualizacaoAtiva === "preview"}
              >
                <AlignLeft className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Centralizar"
                onMouseDown={(e) => {
                  e.preventDefault();
                  executarComando("justifyCenter");
                }}
                disabled={disabled || visualizacaoAtiva === "preview"}
              >
                <AlignCenter className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Justificar"
                onMouseDown={(e) => {
                  e.preventDefault();
                  executarComando("justifyFull");
                }}
                disabled={disabled || visualizacaoAtiva === "preview"}
              >
                <AlignJustify className="size-4" />
              </Button>

              <div className="mx-1 h-4 w-px bg-border" />

              {/* Destaque / Citação e Divisor */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Citação / Destaque"
                onMouseDown={(e) => {
                  e.preventDefault();
                  executarComando("formatBlock", "<blockquote>");
                }}
                disabled={disabled || visualizacaoAtiva === "preview"}
              >
                <Quote className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Linha Divisória"
                onMouseDown={(e) => {
                  e.preventDefault();
                  executarComando("insertHorizontalRule");
                }}
                disabled={disabled || visualizacaoAtiva === "preview"}
              >
                <Minus className="size-4" />
              </Button>

              <div className="mx-1 h-4 w-px bg-border" />

              {/* Ações */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Desfazer (Ctrl+Z)"
                onMouseDown={(e) => {
                  e.preventDefault();
                  executarComando("undo");
                }}
                disabled={disabled || visualizacaoAtiva === "preview"}
              >
                <Undo className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Refazer (Ctrl+Y)"
                onMouseDown={(e) => {
                  e.preventDefault();
                  executarComando("redo");
                }}
                disabled={disabled || visualizacaoAtiva === "preview"}
              >
                <Redo className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Limpar Formatação da Seleção"
                onMouseDown={(e) => {
                  e.preventDefault();
                  executarComando("removeFormat");
                }}
                disabled={disabled || visualizacaoAtiva === "preview"}
              >
                <RemoveFormatting className="size-4" />
              </Button>
            </div>

            {/* Alternador Modo: Editor Visual vs Leitura */}
            <div className="flex items-center gap-1 rounded-lg border bg-background p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setVisualizacaoAtiva("editor")}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 transition-colors ${
                  visualizacaoAtiva === "editor"
                    ? "bg-primary text-primary-foreground font-medium shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Pencil className="size-3.5" />
                <span>Editor</span>
              </button>
              <button
                type="button"
                onClick={() => setVisualizacaoAtiva("preview")}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 transition-colors ${
                  visualizacaoAtiva === "preview"
                    ? "bg-primary text-primary-foreground font-medium shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Eye className="size-3.5" />
                <span>Pré-visualização</span>
              </button>
            </div>
          </div>

          {/* ÁREA DE EDIÇÃO WYSIWYG */}
          {visualizacaoAtiva === "editor" ? (
            <div
              ref={editorRef}
              contentEditable={!disabled}
              onFocus={() => {
                estaFocadoRef.current = true;
              }}
              onBlur={() => {
                estaFocadoRef.current = false;
                atualizarValor();
              }}
              onInput={atualizarValor}
              dangerouslySetInnerHTML={{ __html: htmlInicial }}
              className={`min-h-[460px] max-h-[750px] overflow-y-auto rounded-b-lg border border-t-0 bg-background p-6 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring select-text ${
                disabled ? "cursor-not-allowed opacity-60" : ""
              } [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h1]:text-foreground [&_h1]:mb-3 [&_h1]:mt-6 [&_h1:first-child]:mt-0
              [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground [&_h2]:border-b [&_h2]:border-border/50 [&_h2]:pb-1.5 [&_h2]:mb-2 [&_h2]:mt-6 [&_h2:first-child]:mt-0
              [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mb-2 [&_h3]:mt-4 [&_h3:first-child]:mt-0
              [&_p]:my-2.5 [&_p]:leading-relaxed [&_p]:text-foreground/90
              [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-3 [&_ul]:space-y-1.5 [&_ul]:text-foreground/90
              [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-3 [&_ol]:space-y-1.5 [&_ol]:text-foreground/90
              [&_li]:leading-relaxed
              [&_blockquote]:border-l-4 [&_blockquote]:border-primary/50 [&_blockquote]:bg-primary/5 [&_blockquote]:px-4 [&_blockquote]:py-2 [&_blockquote]:my-3 [&_blockquote]:italic [&_blockquote]:text-foreground/80 [&_blockquote]:rounded-r-md
              [&_hr]:my-5 [&_hr]:border-border/80
              [&_strong]:font-semibold [&_strong]:text-foreground
              [&_em]:italic [&_em]:text-foreground
              [&_u]:underline
              `}
              aria-label="Editor visual de termos de uso da empresa"
            />
          ) : (
            <div className="min-h-[460px] max-h-[750px] overflow-y-auto rounded-b-lg border border-t-0 bg-card p-6 shadow-inner">
              <VisualizadorTermos
                conteudo={valor}
                placeholder="Nenhum conteúdo definido. Volte à aba 'Editor' ou clique em 'Carregar sugestão padrão' para adicionar o texto."
              />
            </div>
          )}

          {/* RODAPÉ DO EDITOR COM CONTADORES E DICAS */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
            <span>
              Editor visual: selecione qualquer trecho para formatar ou use os atalhos{" "}
              <strong>Ctrl+B</strong> (negrito), <strong>Ctrl+I</strong> (itálico) e{" "}
              <strong>Ctrl+U</strong> (sublinhado).
            </span>
            <span className="font-medium">
              {totalPalavras} palavras · {totalCaracteres} caracteres
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

