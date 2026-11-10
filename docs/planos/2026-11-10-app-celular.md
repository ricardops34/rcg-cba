# App para celular — plano

> Criado em 2026-11-10. **Documento vivo:** atualizar a cada decisão e a cada entrega.
> Relacionado: [`2026-10-16-telas-no-celular.md`](2026-10-16-telas-no-celular.md) (revisão tela a tela),
> [`portal-cliente.md`](portal-cliente.md) (app do cliente, fora deste plano).

## 1. Objetivo

Colocar a plataforma no celular do **vendedor e do gestor** como um app: ícone na tela inicial,
abre em tela cheia, sem barra do navegador, **avisa por notificação** (pedido liberado, desconto a
aprovar, mensagem nova, agenda do dia) e, se decidido, aparece nas lojas (Google Play e App Store).

O Portal do Cliente segue adiado (decisão de 27/10, foco em integração, ferramentas e relatórios).

## 2. Caminhos possíveis

| Caminho | O que é | Lojas | Notificação | Custo de manutenção | Reaproveita |
|---|---|---|---|---|---|
| **A. PWA completo** | O próprio sistema web, instalado pelo navegador | Não (Android aceita publicar como TWA, ver C) | Sim — Android sempre; iPhone a partir do iOS 16.4 **e só com o app instalado na tela inicial** | Nenhum extra: uma base só | 100% |
| **B. Casca nativa (Capacitor)** | O mesmo sistema web dentro de um app nativo fino | Sim, as duas | Sim, nativa (Firebase/APNs), confiável no iPhone | Baixo: publicar versão nas lojas quando a casca muda; as telas continuam vindo do servidor | ~95% |
| **C. TWA (só Android)** | PWA empacotado para a Google Play | Só Play | Igual ao PWA | Muito baixo | 100% |
| **D. App nativo (React Native / Flutter)** | Telas reescritas para celular | Sim | Nativa | **Alto**: duas bases de tela para manter em dia | Só a API |

**Recomendação:** **A agora, B depois se precisar de loja.** O PWA já está meio caminho andado
(seção 3), entrega o ganho principal — ícone + notificação — sem conta em loja nem revisão da
Apple, e tudo que for feito nele (push, telas ajustadas, sessão por aparelho) é reaproveitado pela
casca do Capacitor se a decisão D1 for por loja. O caminho D só se justifica com requisito que o
navegador não cumpre (offline pesado, Bluetooth, leitura de código de barras contínua), e hoje
não há nenhum.

## 3. O que já temos

| Item | Situação | Onde |
|---|---|---|
| App instalável (manifesto, ícones 192/512/maskable, ícone Apple) | ✅ | `apps/web/src/app/manifest.ts`, `public/icons/` |
| Service worker registrado (só em produção) | ✅ mínimo | `public/sw.js`, `components/pwa-registro.tsx` |
| **Sem cache de dados, de propósito** (preço/estoque/sessão sempre da rede) | ✅ decisão | comentário em `sw.js` |
| Tela cheia no iPhone (`appleWebApp`, `themeColor`) | ✅ | `app/layout.tsx` |
| HTTPS com certificado (Traefik) — exigência de PWA e push | ✅ | VPS |
| Marcação "disponível no celular" em módulo › menu › rotina, sobreponível por empresa | ✅ | catálogo + *Administração › Estrutura* |
| Guarda que bloqueia no celular a tela marcada só para computador | ✅ | `components/layout/responsive-route-guard.tsx` |
| Telas já ajustadas: tela inicial, barra superior, perfil, dashboards, Conversas, Agenda, formulário de orçamento | ✅ código · 📱 conferência pendente | plano de telas no celular |
| Lista em cartões no celular (`mobileCard` do EntityTable) | 🔎 só Orçamentos usa | `crud/entity-table` |
| Login com token curto (15 min) + renovação em cookie `HttpOnly` | ✅ | `modules/auth` (SEC-11) |
| Notificações gravadas por usuário (sino) — fonte única | ✅ | `modules/notificacoes`, `registrarNotificacao` |
| Horário de expediente encerra a sessão | ✅ | `JwtAuthGuard` |
| Anexo de arquivo no WhatsApp (câmera/galeria pelo seletor do celular) | ✅ | `whatsapp/composer.tsx` |
| Nome neutro do app ("CRM") — coerente com plataforma multicliente sem marcas | ✅ | `manifest.ts` |

## 4. O que falta

### 4.1 Bloqueadores (sem isso o app atrapalha mais do que ajuda)

1. **Sessão única × celular.** Hoje um login novo **derruba a sessão do outro aparelho** (decisão
   de 30/09, `auth.service.ts` e `JwtAuthGuard`). Com o app, o vendedor que abre o celular perde o
   computador e vice-versa. Precisa da decisão D2 e do ajuste na regra.
2. **Telas do dia a dia do vendedor revisadas no aparelho.** Do plano de telas: Posição de Cliente,
   Estoque, Produtos, Lista de Orçamentos, Atividades, Oportunidades (kanban), Clientes, Títulos.
   Depende da decisão D3 daquele plano (prioridade), que segue pendente.
3. **Telas de configuração desligadas no celular** (Estrutura, Perfis, Integração, Campos, E-mail,
   Agente IA) — decisão D1/D2 do plano de telas, pendente. Sem isso o menu do app fica poluído.

### 4.2 Notificação no celular (o principal ganho)

| # | Peça | Lado |
|---|---|---|
| N1 | Chaves VAPID (variável na stack, como `PARAMETROS_CRYPTO_KEY`) + biblioteca `web-push` | API / operação |
| N2 | Tabela `push_assinaturas` (usuário, empresa, aparelho, endpoint, chaves, último uso) com RLS e policy na mesma migration | API |
| N3 | Rotas: assinar, cancelar, testar; apagar assinatura que o serviço responde 404/410 | API |
| N4 | Envio disparado de `registrarNotificacao` — **o sino continua sendo a fonte**; o push é só um aviso de que há linha nova. Texto curto e sem dado sensível (o conteúdo aparece na tela de bloqueio) | API |
| N5 | `sw.js` ganha `push` e `notificationclick` (abre a tela certa); **continua sem cache de dados** | Web |
| N6 | Tela no Perfil: ligar/desligar por aparelho e por tipo de aviso; explicação de "instale o app" para iPhone | Web |
| N7 | Logout, troca de empresa e fim de expediente desligam/ignoram a assinatura do aparelho | API |

Acesso é código: o push só vai para o usuário que a notificação já endereçou na origem; o envio
não amplia quem vê o quê.

### 4.3 Acabamento de app

- Margens de área segura (entalhe do iPhone, barra de gestos): `viewport-fit=cover` + `env(safe-area-inset-*)` na barra superior e nos rodapés fixos (orçamento).
- Tela de "sem conexão" no lugar da página de erro do navegador (sem guardar dado — só o aviso).
- Aviso de versão nova (o SW detecta atualização e oferece recarregar) para o app instalado não ficar preso numa versão antiga.
- Convite de instalação: botão "Instalar app" no Android (`beforeinstallprompt`) e instrução de "Compartilhar › Adicionar à Tela de Início" no iPhone.
- Nome e ícone do app por empresa? Ver D4.

### 4.4 Só se a decisão for ir para as lojas (caminho B)

- Projeto Capacitor em `apps/mobile` apontando para a URL do sistema; plugins de push nativo, barra de status e abertura de links externos.
- Push nativo: Firebase (Android) e APNs (iPhone) — o N4 ganha um segundo canal de envio.
- Contas: **Google Play Console (US$ 25, uma vez)** e **Apple Developer Program (US$ 99/ano)**, em nome de quem publica (ver D4).
- Exigências de loja: política de privacidade publicada, **exclusão de conta pelo próprio app** (Apple exige), conta de teste para a revisão, capturas de tela, descrição.
- Apple recusa app que é "só um site embrulhado": precisa de algo nativo visível (push nativo, biometria no login) — mais um motivo para fazer A primeiro e ter push pronto.
- Mac para compilar e assinar a versão de iPhone (ou serviço de build na nuvem).

## 5. Pré-requisitos

| Pré-requisito | Para | Situação |
|---|---|---|
| HTTPS válido no domínio de produção | PWA e push | ✅ |
| Decisões D1–D3 deste plano | começar | ⏳ |
| Decisões D1–D3 do plano de telas no celular | bloqueadores 2 e 3 | ⏳ |
| Chaves VAPID criadas e guardadas na stack | push | ⬜ |
| Aparelhos de teste: um iPhone (iOS ≥ 16.4) e um Android | conferência real | a confirmar |
| Contas de loja e política de privacidade | só caminho B | ⬜ |
| Mac ou build em nuvem | só caminho B, iPhone | ⬜ |

## 6. Decisões que dependem do usuário

| # | Decisão | Proposta | Resposta |
|---|---|---|---|
| D1 | Caminho | **A (PWA completo) agora**; B (Capacitor nas lojas) só se as lojas forem exigência comercial | **A** (10/11) |
| D2 | Sessão única com o celular | **Uma sessão de computador + uma de celular** por usuário; um segundo celular derruba o primeiro, como hoje acontece entre computadores | **1 computador + 1 celular** (10/11) |
| D3 | Quais avisos viram notificação no celular | Liberação de desconto (para o supervisor), pedido/orçamento liberado ou recusado, agenda do dia, recado da equipe. Mensagem de WhatsApp: **não** no início (volume alto; tem o próprio ícone) | **Tudo que vai para o sino**, menos mensagem de WhatsApp; respeita o expediente (10/11) |
| D4 | Nome e ícone (multicliente) | Um app só, neutro, com a marca da empresa dentro (logo já existe por empresa). Um app por cliente só no caminho B, e cada um custa uma publicação | Proposta adotada por padrão (nome "CRM"); revisitar se for para as lojas |
| D5 | Offline | **Nenhum dado offline** (mantém a decisão do `sw.js`); só a tela de "sem conexão" | Proposta adotada por padrão |

## 7. Fases

| Fase | Entrega | Depende de | Situação |
|---|---|---|---|
| F1 | Sessão por tipo de aparelho (D2) + testes do guard e do login | D2 | ✅ código (10/11) |
| F2 | Telas do vendedor revisadas e conferidas em aparelho; telas de configuração desligadas | D1–D3 do plano de telas | ⬜ |
| F3 | Acabamento de app (área segura, sem conexão, versão nova, convite de instalação) | — | ✅ código (10/11) · 📱 conferência pendente |
| F4 | Notificação no celular N1–N7 | D3, chaves VAPID | ✅ código (10/11) · chaves VAPID na produção pendentes |
| F5 | Conferência em iPhone e Android instalados, em produção | F1–F4 publicados | ⬜ |
| F6 | *(se D1 = B)* Capacitor, push nativo, contas e publicação nas lojas | F4, contas | ⬜ |

F1 a F4 são independentes entre si e podem andar em paralelo; F3 é a mais barata e já melhora o
app que existe hoje.

## 8. Como ficou (10/11)

- **Sessão** — `sessoes.aparelho` (computador/celular, pelo navegador no login: `common/sessao/aparelho.ts`). O login só encerra a sessão aberta do mesmo tipo. iPad e tablet Android sem "Mobile" contam como computador.
- **Aviso** — `modules/push`. A notificação continua sendo gravada só por `registrarNotificacao`; um job a cada 20 s lê a fila (`notificacoes.pushEm` nulo), marca e envia. Vai só para aparelho cuja **sessão segue aberta** (sair, ser substituído ou cair no expediente desliga sozinho) e dentro do expediente; aviso com mais de 15 min é descartado. Título genérico por tipo (`push-texto.ts`), corpo "Toque para abrir.", sem dado do fato. Ao entrar de novo, o app religa a assinatura do aparelho para a sessão nova — só se ela já era do mesmo usuário.
- **Tela** — Perfil › Conta › *App no celular*: instalar, ligar/desligar o aviso neste aparelho, aviso de teste. Faixa de convite no celular fora do app instalado (dispensável).
- **Acabamento** — `sw.js` com `push`, `notificationclick` e `offline.html` (único arquivo em cache); `viewport-fit=cover` e margem da barra de gestos no conteúdo e no rodapé do orçamento; `/versao` + aviso "Nova versão disponível" no app aberto.
- **Operação** — variáveis `VAPID_*` nas stacks e passo no runbook ("Chaves do aviso no celular (VAPID)").
- **Fica para depois** — F2 (telas, depende do plano de telas no celular) e F5 (conferência em iPhone e Android, após publicar).

## 9. Riscos

- **iPhone sem instalar não recebe push.** Quem usa pelo Safari sem "Adicionar à Tela de Início" não é avisado — por isso o convite de instalação (4.3) faz parte da entrega, não é enfeite.
- **Texto do aviso na tela bloqueada.** Valor de pedido, nome de cliente e desconto ficam visíveis para quem pegar o aparelho. Aviso curto ("Novo pedido de desconto aguardando"), detalhe só dentro do app.
- **Cache velho.** Qualquer cache de dados no service worker serviria preço/estoque/tela de usuário já saído — fica proibido, como já está documentado no `sw.js`.
- **Expediente.** Fora do horário a sessão cai; o push nesse período abriria o app só para mostrar o login. Decidir com D3 se os avisos respeitam o horário (proposta: sim).
