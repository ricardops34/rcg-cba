"use client";

import { useEffect } from "react";

/** Registra o service worker que torna o app instalável (só em produção). */
export function PwaRegistro() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
