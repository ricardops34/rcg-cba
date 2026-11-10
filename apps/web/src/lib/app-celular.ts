"use client";

import type { PushConfig } from "@plataforma/contracts";
import { apiFetch } from "./api-client";

/**
 * O app instalado no celular: aviso (Web Push) e instalação.
 *
 * Plano: docs/planos/2026-11-10-app-celular.md. O servidor só manda aviso para
 * aparelho com sessão aberta; aqui fica o lado do navegador — pedir a
 * permissão, assinar no serviço de push do aparelho e entregar à API.
 */

export function ehIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    // iPad no "modo computador" se apresenta como Mac com tela de toque.
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1)
  );
}

/** Aberto como app (ícone na tela inicial), não numa aba do navegador. */
export function estaInstalado(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** O navegador tem o necessário para receber aviso. */
export function pushSuportado(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Por que o aviso não pode ser ligado neste aparelho agora, em linguagem de
 * quem usa; `null` quando pode.
 */
export function motivoSemPush(): string | null {
  // No iPhone o aviso só existe com o app instalado (iOS 16.4+), e o Safari
  // em aba comum nem expõe o PushManager — por isso a pergunta vem antes.
  if (ehIos() && !estaInstalado()) {
    return "No iPhone, o aviso só funciona com o app instalado: toque em Compartilhar e depois em “Adicionar à Tela de Início”. Abra pelo ícone e volte aqui.";
  }
  if (!pushSuportado()) return "Este navegador não recebe avisos.";
  if (Notification.permission === "denied") {
    return "Os avisos estão bloqueados para este site nas configurações do aparelho. Libere lá e volte aqui.";
  }
  return null;
}

function chaveParaBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normal = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bruto = atob(normal);
  const bytes = new Uint8Array(new ArrayBuffer(bruto.length));
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
  return bytes;
}

async function registro(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSuportado()) return null;
  return (await navigator.serviceWorker.getRegistration("/")) ?? null;
}

export async function obterConfigPush(): Promise<PushConfig> {
  return apiFetch<PushConfig>("/push/config");
}

/** Assinatura que este aparelho já tem, se tiver. */
export async function assinaturaAtual(): Promise<PushSubscription | null> {
  const reg = await registro();
  return reg ? reg.pushManager.getSubscription() : null;
}

function corpoDaAssinatura(sub: PushSubscription, religar = false) {
  const json = sub.toJSON();
  return {
    endpoint: sub.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
    ...(religar ? { religar: true } : {}),
  };
}

/**
 * Liga o aviso neste aparelho. Precisa vir de um toque do usuário: o iPhone
 * recusa o pedido de permissão feito sem gesto.
 */
export async function ligarPush(chavePublica: string): Promise<void> {
  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") {
    throw new Error("Permissão de aviso não concedida.");
  }
  const reg = (await registro()) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
  await navigator.serviceWorker.ready;
  const existente = await reg.pushManager.getSubscription();
  const sub =
    existente ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: chaveParaBytes(chavePublica),
    }));
  await apiFetch("/push/assinar", { method: "POST", body: corpoDaAssinatura(sub) });
}

/** Desliga o aviso neste aparelho: no servidor e no navegador. */
export async function desligarPush(): Promise<void> {
  const sub = await assinaturaAtual();
  if (!sub) return;
  await apiFetch("/push/cancelar", { method: "POST", body: { endpoint: sub.endpoint } }).catch(
    () => undefined,
  );
  await sub.unsubscribe().catch(() => undefined);
}

export async function testarPush(): Promise<number> {
  const r = await apiFetch<{ enviados: number }>("/push/testar", { method: "POST" });
  return r.enviados;
}

/**
 * Ao abrir o app logado: reaponta a assinatura deste aparelho para a sessão
 * nova (a do login anterior já foi encerrada e não recebe mais). Só funciona
 * para a assinatura que já é deste usuário — ver `religar` no contrato.
 */
export async function religarPush(): Promise<void> {
  if (!pushSuportado() || Notification.permission !== "granted") return;
  const sub = await assinaturaAtual();
  if (!sub) return;
  await apiFetch("/push/assinar", { method: "POST", body: corpoDaAssinatura(sub, true) });
}

// ------------------------------------------------------------- instalação

/** Evento que o Chrome/Android dispara quando o app pode ser instalado. */
export interface EventoInstalacao extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let eventoGuardado: EventoInstalacao | null = null;
const ouvintes = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // Guarda para o botão "Instalar app" em vez de deixar o navegador mostrar
    // a barra dele na hora errada.
    e.preventDefault();
    eventoGuardado = e as EventoInstalacao;
    ouvintes.forEach((f) => f());
  });
  window.addEventListener("appinstalled", () => {
    eventoGuardado = null;
    ouvintes.forEach((f) => f());
  });
}

export function assinarInstalacao(aviso: () => void) {
  ouvintes.add(aviso);
  return () => {
    ouvintes.delete(aviso);
  };
}

export function podeInstalar(): boolean {
  return eventoGuardado !== null;
}

export async function instalar(): Promise<boolean> {
  if (!eventoGuardado) return false;
  const evento = eventoGuardado;
  await evento.prompt();
  const { outcome } = await evento.userChoice;
  eventoGuardado = null;
  ouvintes.forEach((f) => f());
  return outcome === "accepted";
}
