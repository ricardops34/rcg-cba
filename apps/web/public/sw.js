// Service worker do app instalado.
//
// De propósito NÃO guarda dado nenhum em cache: preço, estoque, pedido e
// sessão precisam vir sempre da rede, e um cache velho serviria dado
// desatualizado ou tela de usuário já saído. A ÚNICA coisa guardada é a página
// estática de "sem conexão" (offline.html), que não tem dado de ninguém.
//
// Faz três coisas:
// 1. deixa o app instalável;
// 2. mostra "sem conexão" quando a abertura de uma tela falha por falta de rede;
// 3. recebe o aviso no celular (Web Push) e abre a tela certa ao tocar.

const CACHE_OFFLINE = "offline-v1";
const PAGINA_OFFLINE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_OFFLINE)
      .then((cache) => cache.add(new Request(PAGINA_OFFLINE, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nomes) =>
        Promise.all(nomes.filter((n) => n !== CACHE_OFFLINE).map((n) => caches.delete(n))),
      )
      .then(() => self.clients.claim()),
  );
});

// Só a navegação (abrir uma tela) é interceptada, e só para trocar o erro do
// navegador pela página de "sem conexão". Chamada de API, imagem e script
// seguem direto para a rede, sem passar por aqui.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(PAGINA_OFFLINE).then((r) => r || Response.error()),
    ),
  );
});

self.addEventListener("push", (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch {
    dados = {};
  }
  const titulo = typeof dados.titulo === "string" ? dados.titulo : "Novo aviso";
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: typeof dados.corpo === "string" ? dados.corpo : "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: typeof dados.tag === "string" ? dados.tag : undefined,
      data: { rota: rotaInterna(dados.rota) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = new URL(rotaInterna(event.notification.data?.rota), self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      // App já aberto: leva para a tela em vez de abrir outra janela.
      for (const janela of janelas) {
        if (new URL(janela.url).origin === self.location.origin && "focus" in janela) {
          return janela.focus().then((j) => (j && "navigate" in j ? j.navigate(destino) : j));
        }
      }
      return self.clients.openWindow(destino);
    }),
  );
});

/** Só caminho do próprio sistema; qualquer outra coisa abre a tela inicial. */
function rotaInterna(rota) {
  return typeof rota === "string" && rota.startsWith("/") && !rota.startsWith("//") ? rota : "/";
}
