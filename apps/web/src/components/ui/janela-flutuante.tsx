"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Grip, Maximize2, Minimize2, Minus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Geometria {
  x: number;
  y: number;
  largura: number;
  altura: number;
}

const LARGURA_MIN = 320;
const ALTURA_MIN = 320;
const MARGEM = 8;
/** Altura da barra de título — a faixa por onde a janela é arrastada. */
const ALTURA_TITULO = 44;

function viewport() {
  const visual = window.visualViewport;
  return {
    largura: visual?.width ?? window.innerWidth,
    altura: visual?.height ?? window.innerHeight,
    x: visual?.offsetLeft ?? 0,
    y: visual?.offsetTop ?? 0,
  };
}

const limitar = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), Math.max(min, max));

interface Padrao {
  largura: number;
  altura: number;
  /** Quanto a janela nasce afastada da borda direita — para não nascer em cima de outra. */
  afastamentoDireita: number;
}

/** Encosta a janela no canto inferior direito, longe do ícone que a abre. */
function geometriaPadrao(p: Padrao): Geometria {
  const tela = viewport();
  const compacta = tela.largura < 640;
  const largura = Math.max(1, Math.min(compacta ? tela.largura : p.largura, tela.largura - MARGEM * 2));
  const altura = Math.max(1, Math.min(compacta ? tela.altura : p.altura, tela.altura - MARGEM * 2));
  const afastamento = compacta ? 0 : p.afastamentoDireita;
  return {
    largura,
    altura,
    x: Math.max(tela.x + MARGEM, tela.x + tela.largura - largura - MARGEM - afastamento),
    y: tela.y + tela.altura - altura - MARGEM,
  };
}

function geometriaMaximizada(): Geometria {
  const tela = viewport();
  return { x: tela.x + MARGEM, y: tela.y + MARGEM,
    largura: Math.max(1, tela.largura - MARGEM * 2), altura: Math.max(1, tela.altura - MARGEM * 2) };
}

/**
 * Mantém a janela dentro da viewport.
 *
 * Roda no arrasto, no redimensionamento e quando a **janela do navegador**
 * muda de tamanho: sem isso, quem move a janela para a direita e depois
 * reduz a tela (ou gira o tablet) perde a barra de título — e com ela o único
 * jeito de trazer a janela de volta.
 */
function acomodar(g: Geometria, p: Padrao): Geometria {
  const tela = viewport();
  if (tela.largura < 640) return geometriaPadrao(p);
  const larguraDisponivel = Math.max(1, tela.largura - MARGEM * 2);
  const alturaDisponivel = Math.max(1, tela.altura - MARGEM * 2);
  const largura = limitar(
    g.largura,
    Math.min(LARGURA_MIN, larguraDisponivel),
    larguraDisponivel,
  );
  const altura = limitar(g.altura, Math.min(ALTURA_MIN, alturaDisponivel), alturaDisponivel);
  return {
    largura,
    altura,
    x: limitar(g.x, tela.x + MARGEM, tela.x + tela.largura - largura - MARGEM),
    // Preserva também o rodapé (o campo de mensagem), não só o título.
    y: limitar(g.y, tela.y + MARGEM, tela.y + tela.altura - altura - MARGEM),
  };
}

/**
 * Janela flutuante, **não modal**: se move, se redimensiona, maximiza, e o
 * resto do sistema segue clicável atrás. Nasceu no assistente (Bia), que antes
 * era um `Sheet` — o overlay obrigava a fechá-lo para conferir na tela o que
 * ele tinha respondido. O atendimento de WhatsApp a partir da Posição de
 * Cliente usa a mesma moldura pelo mesmo motivo.
 *
 * Aqui mora só a moldura: geometria, gestos e os botões de janela. Minimizar e
 * fechar são decisão de quem usa — no assistente os dois voltam ao ícone.
 *
 * Cada abertura recalcula a posição pela tela atual, sem coordenadas salvas de
 * outro monitor.
 */
export function JanelaFlutuante({
  aberto,
  rotulo,
  icone,
  titulo,
  acoes,
  onFechar,
  tituloFechar = "Fechar",
  larguraPadrao = 420,
  alturaPadrao = 560,
  afastamentoDireita = 0,
  onPronta,
  iconeMinimizada,
  seloMinimizada,
  children,
}: {
  aberto: boolean;
  /** Nome acessível da janela (aria-label). */
  rotulo: string;
  icone?: ReactNode;
  titulo: ReactNode;
  /** Botões extras da barra de título, antes de minimizar/maximizar/fechar. */
  acoes?: ReactNode;
  onFechar: () => void;
  tituloFechar?: string;
  larguraPadrao?: number;
  alturaPadrao?: number;
  afastamentoDireita?: number;
  /** Chamado quando a janela aparece pela primeira vez (o conteúdo já está montado). */
  onPronta?: () => void;
  /** Ícone do botão redondo em que a janela vira ao minimizar. */
  iconeMinimizada?: ReactNode;
  /** Número no botão minimizado (ex.: conversas não lidas); 0 esconde. */
  seloMinimizada?: number;
  children: ReactNode;
}) {
  const padrao = useMemo<Padrao>(
    () => ({ largura: larguraPadrao, altura: alturaPadrao, afastamentoDireita }),
    [larguraPadrao, alturaPadrao, afastamentoDireita],
  );
  const [geometria, setGeometria] = useState<Geometria | null>(null);
  const [maximizada, setMaximizada] = useState(false);
  /**
   * Minimizada, a janela vira um botão redondo no canto inferior direito, que
   * a reabre no mesmo lugar e tamanho. O conteúdo segue montado — a conversa
   * e o texto digitado não se perdem.
   * Fechar (X) é outra coisa: some de vez e volta pelo ícone da topbar.
   */
  const [recolhida, setRecolhida] = useState(false);
  /**
   * Onde o ícone minimizado está, quando o vendedor o arrastou; nulo é o
   * canto inferior direito. Arrastar move; clicar sem arrastar reabre.
   */
  const [posicaoIcone, setPosicaoIcone] = useState<{ x: number; y: number } | null>(null);
  const arrastouIcone = useRef(false);
  const arrastarIcone = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    const alvo = e.currentTarget;
    const caixa = alvo.getBoundingClientRect();
    const inicio = { x: e.clientX, y: e.clientY };
    arrastouIcone.current = false;
    alvo.setPointerCapture(e.pointerId);
    const mover = (ev: PointerEvent) => {
      const dx = ev.clientX - inicio.x;
      const dy = ev.clientY - inicio.y;
      if (!arrastouIcone.current && Math.hypot(dx, dy) < 5) return;
      arrastouIcone.current = true;
      const tela = viewport();
      setPosicaoIcone({
        x: limitar(caixa.left + dx, MARGEM, tela.largura - caixa.width - MARGEM),
        y: limitar(caixa.top + dy, MARGEM, tela.altura - caixa.height - MARGEM),
      });
    };
    const soltar = () => {
      alvo.releasePointerCapture(e.pointerId);
      alvo.removeEventListener("pointermove", mover);
      alvo.removeEventListener("pointerup", soltar);
      alvo.removeEventListener("pointercancel", soltar);
    };
    alvo.addEventListener("pointermove", mover);
    alvo.addEventListener("pointerup", soltar);
    alvo.addEventListener("pointercancel", soltar);
  };
  const geometriaAnterior = useRef<Geometria | null>(null);
  const alternarMaximizada = () => {
    setRecolhida(false);
    if (maximizada) setGeometria(acomodar(geometriaAnterior.current ?? geometriaPadrao(padrao), padrao));
    else { geometriaAnterior.current = geometria; setGeometria(geometriaMaximizada()); }
    setMaximizada(!maximizada);
  };

  useEffect(() => {
    if (!aberto) return;
    const frame = window.requestAnimationFrame(() => {
      setGeometria((g) => maximizada ? geometriaMaximizada() : acomodar(g ?? geometriaPadrao(padrao), padrao));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [aberto, maximizada, padrao]);

  useEffect(() => {
    const aoRedimensionar = () => setGeometria((g) => (g ? maximizada ? geometriaMaximizada() : acomodar(g, padrao) : g));
    const visual = window.visualViewport;
    window.addEventListener("resize", aoRedimensionar);
    visual?.addEventListener("resize", aoRedimensionar);
    visual?.addEventListener("scroll", aoRedimensionar);
    return () => {
      window.removeEventListener("resize", aoRedimensionar);
      visual?.removeEventListener("resize", aoRedimensionar);
      visual?.removeEventListener("scroll", aoRedimensionar);
    };
  }, [maximizada, padrao]);

  /**
   * A janela fica **sempre por cima** das cortinas. Ela e as cortinas têm o
   * mesmo z-index, então vale a ordem no documento: quando uma cortina entra
   * na página, este contêiner volta para o fim do <body>. Não basta subir o
   * z-index da janela — os menus que ela própria abre (o "+" da conversa, o
   * seletor de cliente) são portais com o z-index comum e sumiriam por trás
   * dela.
   */
  const [conteiner] = useState<HTMLDivElement | null>(() =>
    typeof document === "undefined" ? null : document.createElement("div"),
  );
  useEffect(() => {
    if (!conteiner) return;
    document.body.appendChild(conteiner);
    const ehCortina = (no: Node) =>
      no instanceof HTMLElement &&
      no !== conteiner &&
      (no.matches('[data-slot="sheet-content"]') ||
        !!no.querySelector('[data-slot="sheet-content"]'));
    const observador = new MutationObserver((mudancas) => {
      if (mudancas.some((m) => Array.from(m.addedNodes).some(ehCortina))) {
        document.body.appendChild(conteiner);
      }
    });
    observador.observe(document.body, { childList: true });
    return () => {
      observador.disconnect();
      conteiner.remove();
    };
  }, [conteiner]);

  const possuiGeometria = geometria !== null;
  const avisarPronta = useEffectEvent(() => onPronta?.());
  useEffect(() => {
    if (possuiGeometria) avisarPronta();
  }, [possuiGeometria]);

  /**
   * Arrasto e redimensionamento com Pointer Events e captura de ponteiro: o
   * movimento continua valendo mesmo quando o cursor sai da janela ou passa
   * por cima de um iframe, o que `mousemove` no documento não garante.
   */
  const iniciarGesto = useCallback(
    (modo: "mover" | "redimensionar" | "redimensionar-inicio") => (e: React.PointerEvent) => {
      // Só botão principal, e nunca a partir dos botões do cabeçalho.
      if (e.button !== 0) return;
      if (maximizada) return;
      if (viewport().largura < 640) return;
      if (
        modo === "mover" &&
        (e.target as HTMLElement).closest("button, a, input, textarea")
      ) {
        return;
      }
      e.preventDefault();
      const alvo = e.currentTarget as HTMLElement;
      alvo.setPointerCapture(e.pointerId);
      const inicio = { x: e.clientX, y: e.clientY };
      const base = geometria;
      if (!base) return;

      const mover = (ev: PointerEvent) => {
        const dx = ev.clientX - inicio.x;
        const dy = ev.clientY - inicio.y;
        setGeometria(
          acomodar(
            modo === "mover"
              ? { ...base, x: base.x + dx, y: base.y + dy }
              : modo === "redimensionar-inicio" ? {
                  ...base, x: base.x + dx, y: base.y + dy,
                  largura: base.largura - dx, altura: base.altura - dy,
                } : {
                  ...base,
                  largura: base.largura + dx,
                  altura: base.altura + dy,
                },
            padrao,
          ),
        );
      };
      const soltar = () => {
        alvo.releasePointerCapture(e.pointerId);
        alvo.removeEventListener("pointermove", mover);
        alvo.removeEventListener("pointerup", soltar);
        alvo.removeEventListener("pointercancel", soltar);
      };
      alvo.addEventListener("pointermove", mover);
      alvo.addEventListener("pointerup", soltar);
      alvo.addEventListener("pointercancel", soltar);
    },
    [geometria, maximizada, padrao],
  );

  if (!aberto || !geometria || !conteiner) return null;

  // Minimizada, vira um botão redondo no canto inferior direito, por cima de
  // tudo. A janela continua montada (escondida): a conversa e o texto
  // digitado voltam do jeito que estavam, no mesmo lugar e tamanho.
  const botaoMinimizada = recolhida ? (
    <button
      type="button"
      onPointerDown={arrastarIcone}
      onClick={() => {
        if (!arrastouIcone.current) setRecolhida(false);
      }}
      style={posicaoIcone ? { left: posicaoIcone.x, top: posicaoIcone.y } : undefined}
      title={`Reabrir ${rotulo.toLowerCase()} (arraste para mover)`}
      aria-label={`Reabrir ${rotulo.toLowerCase()}`}
      className={`fixed z-50 flex size-12 touch-none cursor-grab items-center justify-center rounded-full border bg-background shadow-2xl transition-transform hover:scale-105 ${
        posicaoIcone ? "" : "right-4 bottom-4"
      }`}
    >
      {iconeMinimizada ?? icone}
      {seloMinimizada ? (
        <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#00A884] px-1 text-[11px] font-semibold text-white">
          {seloMinimizada > 99 ? "99+" : seloMinimizada}
        </span>
      ) : null}
    </button>
  ) : null;

  return createPortal(
    <>
    {botaoMinimizada}
    <div
      role="dialog"

      data-janela-flutuante=""
      aria-label={rotulo}
      className={`fixed z-50 flex-col overflow-hidden rounded-lg border bg-background shadow-2xl ${
        recolhida ? "hidden" : "flex"
      }`}
      style={{
        left: geometria.x,
        top: geometria.y,
        width: geometria.largura,
        height: geometria.altura,
      }}
    >
      <div
        onPointerDown={iniciarGesto("mover")}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest("button, a")) return;
          alternarMaximizada();
        }}
        className="flex shrink-0 touch-none select-none items-center gap-2 border-b bg-muted/40 px-3 sm:cursor-move"
        style={{ height: ALTURA_TITULO }}
      >
        {icone}
        <span className="flex-1 truncate text-sm font-medium">{titulo}</span>
        {acoes}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          title="Minimizar para o canto da tela"
          aria-label="Minimizar"
          onClick={() => setRecolhida(true)}
        >
          <Minus className="size-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="size-7"
          title={maximizada ? "Restaurar tamanho" : "Maximizar janela"}
          aria-label={maximizada ? "Restaurar tamanho" : "Maximizar janela"}
          aria-pressed={maximizada} onClick={alternarMaximizada}>
          {maximizada ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          title={tituloFechar}
          aria-label={tituloFechar}
          onClick={onFechar}
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {children}
      </div>

      {/* Alça de redimensionamento. `touch-none` para o gesto não virar
          rolagem no tablet. */}
      {!maximizada && <div
        onPointerDown={iniciarGesto("redimensionar")}
        role="separator"
        aria-label={`Redimensionar ${rotulo.toLowerCase()}`}
        title="Arraste para ajustar o tamanho"
        className="absolute bottom-0 right-0 hidden size-5 cursor-nwse-resize touch-none text-muted-foreground sm:block"
        style={{
          // `currentColor` para não depender do formato do token de
          // cor (hsl/oklch): a cor vem do `text-border` acima.
          background:
            "linear-gradient(135deg, transparent 50%, currentColor 50%)",
        }}
      ><Grip className="size-4" /></div>}
      {!maximizada && <div onPointerDown={iniciarGesto("redimensionar-inicio")}
        role="separator" aria-label="Redimensionar pelo canto superior esquerdo"
        title="Arraste para ajustar o tamanho"
        className="absolute left-0 top-0 hidden size-3 cursor-nwse-resize touch-none border-l-2 border-t-2 border-muted-foreground/60 sm:block" />}
    </div>
    </>,
    conteiner
  );
}
