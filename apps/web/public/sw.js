// Service worker mínimo, só para o app ser instalável. De propósito NÃO guarda
// nada em cache: preço, estoque, pedido e sessão precisam vir sempre da rede,
// e um cache velho serviria dado desatualizado ou tela de usuário já saído.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
