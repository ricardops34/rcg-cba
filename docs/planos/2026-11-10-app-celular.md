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

> **Revisto em 10/11:** o usuário pediu **trabalho offline com sincronismo obrigatório** (seção 9).
> Offline é possível no PWA, mas no iPhone o armazenamento do navegador é mais frágil e não há
> sincronização em segundo plano. Isso pesa a favor do caminho B (Capacitor, banco local
> nativo). A escolha está na decisão O6.

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
| D5 | Offline | **Nenhum dado offline** (mantém a decisão do `sw.js`); só a tela de "sem conexão" | Adotada em 10/11 e **revista no mesmo dia**: o usuário quer trabalho offline com sincronismo obrigatório. Desenho e decisões O1–O7 na seção 9 |

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

## 9. Trabalho offline e sincronismo obrigatório

> Pedido de 10/11. **Planejado, nada implementado.** Muda a decisão D5 e o princípio do `sw.js`
> ("nada de dado em cache"). Por isso a regra abaixo é o que mantém o princípio vivo: **o dado
> offline é sempre uma cópia com data, e quem decide no fim é o servidor.**

### 9.1 Para quê

O vendedor na rua perde sinal: em cliente com galpão sem cobertura, na estrada, no interior. Hoje,
sem rede, o app mostra só "Sem conexão". Com o modo offline ele continua consultando a carteira e
montando o pedido. O pedido sobe sozinho quando o sinal volta.

### 9.2 O que funciona sem rede (proposta — decisão O1)

| Funciona offline | Como |
|---|---|
| Clientes **da carteira do vendedor**: cadastro, contatos, endereço, condição e tabela de preço | Cópia local, só leitura |
| Títulos em aberto e últimas compras do cliente (resumo) | Cópia local, só leitura |
| Produtos, preço da tabela do cliente, regras de desconto | Cópia local, só leitura |
| Estoque disponível | Cópia local **com a hora da foto** sempre visível ("estoque de 08:12") |
| Agenda e atividades do dia/semana | Cópia local; concluir e registrar visita entram na fila |
| **Criar e editar orçamento** | Fica no aparelho como *rascunho offline* e sobe ao reconectar (9.4) |
| Registrar atividade, visita ou anotação no cliente | Fila de envio |

| **Não** funciona offline | Por quê |
|---|---|
| Aprovar ou liberar desconto, aprovar orçamento | Decisão de outra pessoa; precisa do servidor |
| Enviar orçamento ao ERP ou ao cliente (link, e-mail, WhatsApp) | Sai do sistema; só depois de validado |
| WhatsApp, Conversas | Tempo real por natureza |
| Dashboards, consultas, relatórios | Volume grande e valor só se atualizado |
| 2ª via de boleto e DANFE | Documento fiscal ou financeiro: sempre o vigente |
| Administração, cadastros fora da carteira, clientes de outros vendedores | Fora do escopo do vendedor na rua |
| Fotos de produto | Volume; no máximo miniatura (decidir em O1) |

### 9.3 Sincronismo obrigatório

O sincronismo não depende de botão. As regras a seguir são **obrigatórias**, e os prazos ficam em
parâmetro da empresa (Administração › Parâmetros), com os valores sugeridos entre parênteses
(decisão O2).

| # | Regra | Quando | Efeito |
|---|---|---|---|
| S1 | **Ao voltar a rede**: primeiro **envia** a fila do aparelho, depois **baixa** o que mudou | Automático, assim que houver conexão | Barra "Sincronizando…"; o vendedor continua trabalhando |
| S2 | **Carga do dia**: sincronismo completo ao abrir o app | Primeira abertura do dia com rede, ou última sincronização há mais de `SYNC_COMPLETO_HORAS` (12 h) | Tela de progresso; só libera a lista depois de terminar |
| S3 | **Aviso de dado envelhecendo** | Última sincronização há mais de `SYNC_AVISO_HORAS` (4 h) | Faixa amarela "Dados de ontem 17:40 — preço e estoque podem ter mudado" |
| S4 | **Bloqueio de novos pedidos** | Sem sincronizar há mais de `SYNC_BLOQUEIO_HORAS` (24 h) | Consulta continua; **criar ou editar orçamento fica bloqueado** até sincronizar |
| S5 | **Base local expira** | Sem sincronizar há mais de `SYNC_EXPIRA_DIAS` (7 dias, igual à validade do login) | A cópia local é apagada e o app exige entrar online. **A fila pendente nunca é apagada sem ser enviada**: ela fica guardada e trancada até o próximo login do mesmo usuário |
| S6 | **Antes de sair** | Logout, troca de empresa ou de usuário com fila pendente | Avisa "há N itens não enviados"; sair só depois de enviar ou com confirmação explícita de descartar |
| S7 | **Sessão substituída ou desconectada** | Ao reconectar, o servidor diz que a sessão do aparelho foi encerrada (outro celular entrou, administração desconectou) | Envia a fila com novo login do mesmo usuário; apaga a cópia local se for outro usuário |

A idade dos dados aparece sempre no topo do app quando offline ("Offline · dados de 08:12"). O
vendedor nunca vê preço ou estoque sem saber de quando é.

### 9.4 O que acontece com o que foi feito offline

**Acesso é código: o servidor revalida tudo no envio, como se o pedido tivesse sido feito agora.**
O que o app bloqueia offline (prazo, carteira, desconto) é comportamento, não barreira. Quem
mexer no aparelho só consegue mandar para a fila o que o servidor vai recusar.

- **Identidade:** cada item da fila nasce com um id gerado no aparelho (UUID). O reenvio do mesmo
  item não duplica (idempotência). O número do orçamento é dado pelo servidor ao aceitar.
- **Orçamento offline:** sobe como **rascunho**. O vendedor confere e confirma antes de seguir para
  o fluxo normal (liberação, envio ao ERP). Essa é a proposta da decisão O4. No envio, o servidor
  recalcula:
  - preço vigente diferente → decisão O3 (proposta: recalcula com o preço atual e marca os itens
    alterados para o vendedor ver);
  - desconto acima do máximo → entra no fluxo de liberação do supervisor que já existe;
  - estoque insuficiente, produto inativo, cliente bloqueado ou fora da carteira → o item ou o
    orçamento volta com o motivo, sem gravar;
  - fora do expediente → decisão O5.
- **Atividade e visita:** a hora registrada é a do aparelho, guardada junto com a hora de chegada
  ao servidor. Se a mesma atividade foi alterada no servidor nesse meio tempo, vale a mais recente
  e o vendedor é avisado.
- **Resultado visível:** tela "Pendências de envio" com cada item (enviado / recusado com motivo /
  aguardando). Item recusado não some: fica para o vendedor corrigir ou descartar.

### 9.5 Segurança e privacidade do dado no aparelho

- **Só o que o usuário já vê:** a carga usa o mesmo escopo e as mesmas permissões das telas
  (carteira do vendedor, RLS da empresa), e nada a mais. Supervisor e gerente: decidir em O1 se
  levam a equipe inteira ou só a própria carteira (volume).
- **Celular perdido:** a cópia local é a carteira do vendedor, com CNPJ, contatos e títulos. Ela é
  apagada no logout, na troca de usuário, ao expirar (S5) e na desconexão pela administração (S7).
  Também deve haver um botão "Apagar dados deste aparelho" em Acessos › Sessões, que vale na
  próxima vez que o aparelho tiver rede.
- **Cifra:** no PWA, a chave ficaria no próprio navegador, o que é pouca proteção. A defesa real é
  o bloqueio de tela do aparelho mais os prazos curtos. No caminho B (Capacitor), dá para usar o
  armazenamento cifrado do sistema e exigir biometria para abrir offline.
- **Expediente:** offline, o app aplica o horário guardado da última sincronização. Quem ignorar
  esse bloqueio esbarra no servidor no envio (O5).

### 9.6 Impacto técnico

| Peça | O que é | Onde |
|---|---|---|
| Casca do app em cache | Para abrir sem rede, o service worker passa a guardar **JS/CSS/HTML das telas do modo offline** (não dado). Versão nova troca a casca no próximo acesso com rede (o aviso de versão já existe) | Web (`sw.js`, possivelmente Serwist) |
| Banco local | IndexedDB no PWA (biblioteca tipo Dexie) ou SQLite no Capacitor | Web |
| Persistência | Pedir `navigator.storage.persist()`. No iPhone, o PWA instalado escapa da limpeza de 7 dias do Safari, mas o sistema ainda pode apagar com o aparelho sem espaço. A S2 cobre isso: a base vazia é recarregada | Web |
| API de carga incremental | `GET /sync/<entidade>?desde=<cursor>` devolve o que mudou e o que foi excluído, só do escopo do usuário | API |
| API de envio | `POST /sync/fila` com itens idempotentes; resposta item a item (aceito, recusado com motivo, conflito) | API |
| Exclusões | Delta por `updatedAt` e exclusão por `deletedAt`. Já existem em clientes, produtos, estoques, itens de tabela de preço, orçamentos, atividades, condições de pagamento e títulos a receber. **A verificar:** se a integração com o ERP apaga alguma linha fisicamente (sem `deletedAt`, o aparelho não fica sabendo) e se grava por SQL direto sem atualizar `updatedAt` | API / integração |
| Itens do orçamento | `orcamento_itens` não tem `deletedAt`: o orçamento sincroniza inteiro, cabeçalho e itens juntos | API |
| Telas | Clientes, produtos, estoque, agenda e orçamento ganham uma "fonte local" quando offline. É o maior esforço: hoje toda tela lê direto da API | Web |
| Segundo plano | Android/Chrome tem Background Sync; **iPhone não tem**. No PWA do iPhone, o envio só acontece com o app aberto. No Capacitor, há tarefa em segundo plano limitada | Web |

### 9.7 Decisões que dependem do usuário

| # | Decisão | Proposta | Resposta |
|---|---|---|---|
| O1 | O que funciona offline | Tabela 9.2: consulta da carteira, produtos/preço/estoque, agenda, orçamento e atividade. Sem fotos (no máximo miniatura). Supervisor e gerente levam só a própria carteira | _pendente_ |
| O2 | Prazos do sincronismo | Aviso 4 h · carga completa 12 h · bloqueio de pedido 24 h · base expira 7 dias, por parâmetro da empresa | _pendente_ |
| O3 | Preço mudou entre o offline e o envio | Recalcula com o preço atual e marca os itens alterados para o vendedor conferir | _pendente_ |
| O4 | Orçamento feito offline, ao sincronizar | Vira rascunho que o vendedor confirma (não segue sozinho para liberação ou ERP) | _pendente_ |
| O5 | Feito offline fora do expediente | Servidor aceita e marca "feito fora do horário" para a supervisão (o trabalho já foi feito; recusar só perde o pedido) | _pendente_ |
| O6 | PWA ou Capacitor para o offline | **Se a equipe usa principalmente Android: PWA.** Se tem muito iPhone: offline já no Capacitor (caminho B), pela persistência e pelo armazenamento cifrado | _pendente_ — preciso saber a proporção de iPhone e Android na equipe |
| O7 | Pedido offline com estoque insuficiente no envio | Grava o orçamento e marca os itens sem estoque, em vez de recusar o orçamento inteiro | _pendente_ |

### 9.8 Fases do offline

| Fase | Entrega | Depende de | Situação |
|---|---|---|---|
| OF1 | Levantamento: integração apaga fisicamente? grava sem `updatedAt`? Volume da maior carteira (clientes, produtos, preços) | — | ⬜ |
| OF2 | API de carga incremental e de envio idempotente, com escopo e revalidação; testes | O1, O3–O5, O7 | ⬜ |
| OF3 | Banco local, casca em cache e motor de sincronismo (S1–S7), faixa de idade dos dados, tela de pendências | O2, O6 | ⬜ |
| OF4 | Consultas offline: clientes, produtos, preço, estoque, agenda | OF3 | ⬜ |
| OF5 | Orçamento e atividade offline, com fila e retorno do servidor | OF2, OF4 | ⬜ |
| OF6 | Apagar dados do aparelho pela administração; parâmetros de prazo | OF3 | ⬜ |
| OF7 | Conferência em aparelho, sem sinal de verdade (modo avião), inclusive o vencimento dos prazos | OF1–OF6 | ⬜ |

É a maior frente deste plano: é a única que mexe em telas que já funcionam (OF4 e OF5). Ela
depende de F2 (telas do vendedor revisadas no celular), porque não compensa tornar offline uma
tela que ainda não está boa no celular.

## 10. Riscos

- **iPhone sem instalar não recebe push.** Quem usa pelo Safari sem "Adicionar à Tela de Início" não é avisado — por isso o convite de instalação (4.3) faz parte da entrega, não é enfeite.
- **Texto do aviso na tela bloqueada.** Valor de pedido, nome de cliente e desconto ficam visíveis para quem pegar o aparelho. Aviso curto ("Novo pedido de desconto aguardando"), detalhe só dentro do app.
- **Cache velho.** Qualquer cache de dados no service worker serviria preço/estoque/tela de usuário já saído — fica proibido, como já está documentado no `sw.js`. Com o modo offline (seção 9), o dado local passa a existir, mas **só no banco local controlado pelo sincronismo**, com data visível e prazos S3–S5. O service worker continua sem guardar resposta de API.
- **Pedido offline com preço vencido.** Mitigado pela revalidação no servidor (9.4) e pelo bloqueio S4. O vendedor precisa entender que o orçamento offline é rascunho até sincronizar; a tela tem que dizer isso.
- **Fila perdida.** Aparelho perdido, quebrado ou app removido com pedidos não enviados. O app avisa da fila pendente (S6) e tenta enviar a cada abertura com rede, mas o que nunca subiu se perde. Treinar a equipe para sincronizar antes de sair de área com sinal.
- **Expediente.** Fora do horário a sessão cai; o push nesse período abriria o app só para mostrar o login. Decidir com D3 se os avisos respeitam o horário (proposta: sim).
