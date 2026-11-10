# App para celular — plano

> Criado em 2026-11-10. **Documento vivo:** atualizar a cada decisão e a cada entrega.
> Relacionado: [`2026-10-16-telas-no-celular.md`](2026-10-16-telas-no-celular.md) (revisão tela a tela),
> [`portal-cliente.md`](portal-cliente.md) (app do cliente, fora deste plano).

## Onde paramos (10/11/2026) — ler primeiro ao retomar

**Situação:** tudo commitado no `main`, **nada publicado**. Nenhuma decisão em aberto.

**Feito e verificado em dev** (testes, build, banco de dev):

| Commit | O quê |
|---|---|
| `3aae6196` | Sessão 1 computador + 1 celular; aviso no celular (Web Push) com tudo do sino menos WhatsApp; Perfil › Conta › *App no celular*; tela "Sem conexão"; aviso de versão nova; margem da barra de gestos |
| `506d9b56`, `3b9e22a6` | Módulo Administração e tela Campos do Produto fora do celular; o catálogo é o teto (a empresa não religa) |
| `01d9a60c` | Posição de Cliente revisada no celular (liberação de desconto virou lista) |
| (este) | Avisos onde a pessoa estiver usando, **computador e celular** (decisão de 10/11). No computador, o cartão do Perfil vira "Avisos neste navegador", sem a parte de instalar |
| `6a648d39` | Levantamento da parte 0 do offline (9.9): cabe com folga, cerca de 14 MB para a empresa inteira |

**Para publicar** (nesta ordem):

1. `publish.ps1`. A migration `20261110120000_app_celular_sessao_push` roda sozinha na subida da API.
2. `sincronizar-catalogo` depois da migration. Sem ele, a Administração continua aparecendo no
   celular.
3. Gerar o par VAPID e gravar `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` na stack
   (runbook, "Chaves do aviso no celular (VAPID)"). As stacks `rcg` e `bjsoft` estão fora do git:
   as variáveis foram postas só nos arquivos locais. Conferir que chegaram ao container.
4. Conferir num Android e num iPhone (instalado pela tela de início):
   - instalar o app;
   - ligar o aviso e mandar o aviso de teste;
   - entrar no computador e no celular ao mesmo tempo;
   - ver que a Administração some do menu;
   - ver a tela "Sem conexão" em modo avião.

**App nativo (10/11), em planejamento:** projeto à parte, sem afetar o navegador — Capacitor, APK de Android para
teste local (build em Docker, abrindo a produção), lojas depois (seção 11). Pendente: repositório próprio ou pasta `mobile/` (A7).

**Próximo passo de desenvolvimento:**

1. **F2 — revisão das telas no celular**, na ordem aprovada. Já feitas: Posição de Cliente e
   Agenda. Faltam:
   - **Estoque** (próxima);
   - Produtos;
   - Orçamentos (lista);
   - Atividades;
   - Oportunidades (kanban).

   Critério e controle em [`2026-10-16-telas-no-celular.md`](2026-10-16-telas-no-celular.md).
2. **Parte 1 do offline (consulta, só leitura)**, depois da F2 nas telas que ela usa. Piloto
   pelo Android (9.8).
3. Partes 2 a 4 do offline na sequência (9.8). Todas as regras estão fechadas: mesmo dia pela data
   do servidor, três datas por operação, prazos por parâmetro, supervisor e gerente com a equipe
   inteira, estoque insuficiente não impede o envio ao ERP.

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
> nativo). Decidido em O6: a equipe usa os dois sistemas, e o offline vai em partes. Começa no app
> instalado e passa para o Capacitor na parte 4 (seção 9.8).

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
3. ~~Telas de configuração desligadas no celular~~ — **resolvido em 10/11:** o módulo Administração
   inteiro fica fora do celular, em todas as empresas (o catálogo é o teto; a empresa não religa).
   No celular ficam Comercial, CRM, Gerencial, Consultas, Cadastros e Relatórios, conforme o perfil.

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
| D1 | Caminho | **A (PWA completo) agora**; B (Capacitor nas lojas) só se as lojas forem exigência comercial | **A** (10/11), e **B também** (10/11, mais tarde no mesmo dia): o usuário quer a opção de app nativo. Primeiro um APK de Android para teste local, lojas depois; o app do site continua junto. Ver seção 11 |
| D2 | Sessão única com o celular | **Uma sessão de computador + uma de celular** por usuário; um segundo celular derruba o primeiro, como hoje acontece entre computadores | **1 computador + 1 celular** (10/11) |
| D3b | Onde o aviso chega | — | **Onde a pessoa estiver usando: computador e celular** (10/11). Cada aparelho ou navegador liga o seu no Perfil, com um toque (regra do navegador). Vai para todos os aparelhos com sessão aberta |
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
- **Tela** — Perfil › Conta › *App no celular* (no computador, *Notificações do navegador*): instalar, **ativar** a notificação neste aparelho, notificação de teste. Faixa de convite no celular fora do app instalado (dispensável).
- **Sem desligar** (decisão do usuário, 10/11: "os avisos são função importante do sistema"). O Perfil só oferece *Ativar notificações*. A `FaixaAtivarAvisos`, no topo do sistema, aparece no computador e no celular enquanto a notificação não está ativa no aparelho em uso, e **não se dispensa**: oferece ativar, explica como liberar quando está bloqueada (e confere de novo ao voltar para a aba) e, no iPhone sem o app instalado, ensina a instalar — nesse caso no lugar do convite dispensável. Obrigatório de verdade não dá: o navegador só libera com o toque da pessoa, e bloquear nas configurações dele continua possível. Fica fora do ar sem as chaves VAPID e na personificação. Nomes na tela: *notificação do celular* no celular, *notificação do navegador* no computador.
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
| **Gerar, alterar, enviar e aprovar orçamento** (decisão de 10/11) | Só com a base sincronizada **no mesmo dia** (regra 9.3a). Gerar e alterar ficam no aparelho; enviar e aprovar entram na fila e **só acontecem de fato no sincronismo**, depois de o servidor revalidar (9.4) |
| Registrar atividade, visita ou anotação no cliente | Fila de envio |

| **Não** funciona offline | Por quê |
|---|---|
| Liberar desconto acima do máximo (supervisor) | Decisão de outra pessoa sobre um pedido que pode não estar no aparelho dela; segue o fluxo de liberação online que já existe |
| Saída efetiva para o ERP ou para o cliente (link, e-mail, WhatsApp) | O pedido de envio feito offline espera na fila; nada sai do sistema antes da revalidação |
| WhatsApp, Conversas | Tempo real por natureza |
| Dashboards, consultas, relatórios | Volume grande e valor só se atualizado |
| 2ª via de boleto e DANFE | Documento fiscal ou financeiro: sempre o vigente |
| Administração, cadastros fora da carteira, clientes de outros vendedores | Fora do escopo do vendedor na rua |
| Fotos de produto | Volume; no máximo miniatura (decidir em O1) |

### 9.3 Sincronismo obrigatório

O sincronismo não depende de botão. As regras a seguir são **obrigatórias**. **Os prazos são
parâmetros do sistema** (decisão O2, 10/11), por empresa, em Administração › Parâmetros. Os
valores entre parênteses são só o valor inicial de cada parâmetro. A regra do mesmo dia para
orçamento (9.3a) é fixa e não vira parâmetro.

| # | Regra | Quando | Efeito |
|---|---|---|---|
| S1 | **Ao voltar a rede**: primeiro **envia** a fila do aparelho, depois **baixa** o que mudou | Automático, assim que houver conexão | Barra "Sincronizando…"; o vendedor continua trabalhando |
| S2 | **Carga do dia**: sincronismo completo ao abrir o app | Primeira abertura do dia com rede, ou última sincronização há mais de `SYNC_COMPLETO_HORAS` (12 h) | Tela de progresso; só libera a lista depois de terminar |
| S3 | **Aviso de dado envelhecendo** | Última sincronização há mais de `SYNC_AVISO_HORAS` (4 h) | Faixa amarela "Dados de ontem 17:40 — preço e estoque podem ter mudado" |
| S4 | **Bloqueio do que não é orçamento** | Sem sincronizar há mais de `SYNC_BLOQUEIO_HORAS` (24 h) | Consulta continua; atividade e visita offline ficam bloqueadas até sincronizar. **Orçamento segue a regra do mesmo dia (9.3a)**, mais rígida |
| S5 | **Base local expira** | Sem sincronizar há mais de `SYNC_EXPIRA_DIAS` (7 dias, igual à validade do login) | A cópia local é apagada e o app exige entrar online. **A fila pendente nunca é apagada sem ser enviada**: ela fica guardada e trancada até o próximo login do mesmo usuário |
| S6 | **Antes de sair** | Logout, troca de empresa ou de usuário com fila pendente | Avisa "há N itens não enviados"; sair só depois de enviar ou com confirmação explícita de descartar |
| S7 | **Sessão substituída ou desconectada** | Ao reconectar, o servidor diz que a sessão do aparelho foi encerrada (outro celular entrou, administração desconectou) | Envia a fila com novo login do mesmo usuário; apaga a cópia local se for outro usuário |

A idade dos dados aparece sempre no topo do app quando offline ("Offline · dados de 08:12"). O
vendedor nunca vê preço ou estoque sem saber de quando é.

### 9.3a Regra do orçamento offline: o mesmo dia (decisão do usuário, 10/11)

> *"A geração, alteração, envio e aprovação de orçamentos, quando offline, não podem ter mais de
> um dia de diferença. Ex.: fiz um orçamento em 10/11/2026 às 17:00. Não vou conseguir fazer nada
> nele no dia 11/11/2026 se não estiver online ou ter feito um sincronismo de dados no 11/11/2026."*

**Regra:** offline, qualquer operação de orçamento (gerar, alterar, enviar, aprovar) só é permitida
se o **último sincronismo do aparelho foi no mesmo dia do calendário** em que a operação é feita.
O dia é a data civil no fuso da empresa (o mesmo do horário de trabalho), não um prazo de 24 h.

| Situação | Pode operar orçamento offline? |
|---|---|
| Sincronizou 11/11 às 07:30, está offline às 16:00 do dia 11/11 | **Sim** |
| Sincronizou 10/11 às 17:00, está offline às 08:00 do dia 11/11 (15 h depois) | **Não** — virou o dia |
| Gerou orçamento offline 10/11 às 17:00 sem sincronizar; dia 11/11, ainda offline | **Não** — o orçamento fica trancado (só leitura) até ficar online ou sincronizar no dia 11/11 |
| Mesmo caso, dia 11/11 com rede | Sincroniza: o orçamento de 10/11 sobe como rascunho, revalidado com o preço e o estoque do dia 11/11. Envio ou aprovação feitos offline no dia 10/11 **não são executados** (chegaram em outro dia, pela data do servidor) e o vendedor refaz online. Depois disso pode ser alterado normalmente |

Consequências:

- **Substitui o S4 para orçamentos.** O bloqueio de 24 h fica só para as demais operações
  offline (atividade, visita). Orçamento segue a regra do dia.
- **Começar o dia sincronizado.** A carga do dia (S2) passa a ser o que libera o orçamento offline.
  Sem ela, o vendedor só consulta.
- **A tela diz por quê.** Orçamento trancado mostra "Sincronize hoje para mexer neste orçamento",
  com o botão de sincronizar quando houver rede.
- **Acesso é código, também aqui.** O app bloqueia na tela, mas o bloqueio que vale é o do servidor.
  - Cada sincronismo devolve um **comprovante emitido e assinado pelo servidor** com a data do dia.
  - Todo item de orçamento na fila leva esse comprovante.
  - **Vale a data do servidor (decisão de 10/11).** O relógio do celular não entra em decisão
    nenhuma. A data de cada operação é a do servidor no momento em que ela chega. No envio, o
    servidor compara o dia de chegada com o dia do comprovante, e só executa a operação de
    orçamento se os dois forem o mesmo dia.
  - Com isso fecha a brecha do relógio atrasado: o dia do comprovante e o dia de chegada são
    ambos do servidor, e nada do aparelho é usado para decidir.
  - **Chegou em outro dia:** feito offline no dia 10/11 com o comprovante de 10/11, mas só chegou
    no dia 11/11. **Decidido (10/11):**
    - o conteúdo do orçamento **não se perde**: sobe como rascunho, revalidado com o preço e o
      estoque do dia 11/11;
    - **envio e aprovação pendentes não são executados**: o vendedor, que nessa hora já está
      online, confere e refaz.

    Isso cumpre a regra: no dia 11/11 nada acontece no orçamento sem sincronismo do dia 11/11.
  - O app também tranca a tela pelo relógio do celular, só para avisar antes de o vendedor
    perder trabalho. Quem adianta ou atrasa o relógio engana apenas o aviso; quem decide é o
    servidor.
- **Três datas por operação (decisão de 10/11).** Toda operação feita offline guarda:

  | Data/hora | O que é | Relógio | Para quê |
  |---|---|---|---|
  | **Feito** | Quando o vendedor fez a operação no celular | Do celular | Informação e auditoria |
  | **Transmitido** | Quando o celular enviou o item ao servidor | Do celular | Mostra quanto tempo o item ficou parado no aparelho |
  | **Recebido** | Quando o servidor recebeu e tratou o item | **Do servidor** | **A única que vale para regra, prazo e relatório** (regra do mesmo dia, histórico, data do pedido) |

  As três aparecem no histórico do orçamento ("feito 10/11 16:40 no celular · transmitido
  11/11 07:52 · recebido 11/11 07:52"). As duas do celular nunca decidem nada: servem para
  mostrar o que aconteceu, e uma diferença estranha entre elas (por exemplo, "feito" depois de
  "recebido") fica marcada para a supervisão. Operação feita online tem as três iguais.

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
  - **estoque insuficiente não impede nada** (decisão O7, 10/11): o orçamento é gravado e pode ir
    ao ERP normalmente, como já acontece online. O item sem saldo na foto do envio só fica
    marcado para o vendedor ver;
  - produto inativo, cliente bloqueado ou fora da carteira → o item ou o
    orçamento volta com o motivo, sem gravar;
  - fora do expediente → decisão O5.
- **Atividade e visita:** guardam as mesmas três datas (feito, transmitido, recebido). Vale a de
  recebido, do servidor. Se a mesma atividade foi alterada no servidor nesse meio tempo, vale a
  mais recente e o vendedor é avisado.
- **Resultado visível:** tela "Pendências de envio" com cada item (enviado / recusado com motivo /
  aguardando). Item recusado não some: fica para o vendedor corrigir ou descartar.

### 9.5 Segurança e privacidade do dado no aparelho

- **Só o que o usuário já vê:** a carga usa o mesmo escopo e as mesmas permissões das telas
  (carteira do vendedor, RLS da empresa), e nada a mais. **Supervisor e gerente levam a equipe
  inteira** (decisão O1, 10/11): a carteira de todos os vendedores que eles já veem no sistema. É
  a maior base possível no aparelho, por isso o levantamento da parte 0 mede o volume da maior
  equipe, e não só o da maior carteira. Se não couber com folga, voltamos a conversar antes da
  parte 1.
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
| O1 | O que funciona offline | Tabela 9.2: consulta da carteira, produtos/preço/estoque, agenda, orçamento e atividade. Sem fotos (no máximo miniatura). Supervisor e gerente levam só a própria carteira | **Em parte (10/11):** orçamento offline = gerar, alterar, enviar e aprovar; **supervisor e gerente levam a equipe inteira**. Resto da tabela 9.2 e fotos: **proposta aceita** (sem fotos, no máximo miniatura) |
| O2 | Prazos do sincronismo | Aviso 4 h · carga completa 12 h · bloqueio 24 h · base expira 7 dias, por parâmetro da empresa | **Decidido (10/11):** os prazos são **parâmetros do sistema**, por empresa, com os valores sugeridos como iniciais; orçamento só com sincronismo **no mesmo dia do calendário** (9.3a, fixo). Toda operação offline guarda **feito, transmitido e recebido**; só a de recebido (servidor) vale para regra |
| O3 | Preço mudou entre o offline e o envio | Recalcula com o preço atual e marca os itens alterados para o vendedor conferir | **Proposta aceita (10/11)** |
| O4 | Orçamento feito offline, ao sincronizar | Vira rascunho que o vendedor confirma (não segue sozinho para liberação ou ERP) | **Proposta aceita (10/11)** |
| O5 | Feito offline fora do expediente | Servidor aceita e marca "feito fora do horário" para a supervisão (o trabalho já foi feito; recusar só perde o pedido) | **Proposta aceita (10/11)** |
| O6 | PWA ou Capacitor para o offline | **Se a equipe usa principalmente Android: PWA.** Se tem muito iPhone: offline já no Capacitor (caminho B), pela persistência e pelo armazenamento cifrado | **Os dois (10/11), em partes:** partes 1–3 no app instalado (mesmo código para iPhone e Android); parte 4 leva para o Capacitor, que resolve os limites do iPhone (9.8) |
| O7 | Pedido offline com estoque insuficiente no envio | Grava o orçamento e marca os itens sem estoque, em vez de recusar o orçamento inteiro | **Decidido (10/11): estoque insuficiente não impede o envio ao ERP.** O item só fica marcado; vale igual ao online |

### 9.8 Partes do offline (decisão de 10/11: iPhone e Android, em partes)

A equipe usa **iPhone e Android**. O offline vai ser feito **em partes**. Cada parte entrega algo
usável nos dois sistemas e é conferida em aparelho real, em modo avião, antes da seguinte.

**Base técnica:** o código do offline é escrito uma vez, nas telas web, com banco local
(IndexedDB). Ele roda igual no app instalado (PWA) e, mais tarde, dentro da casca do Capacitor:
nada do que for feito nas partes 1 a 3 é refeito na parte 4. O PWA no iPhone tem limites. O
sistema pode apagar a base local quando o aparelho fica sem espaço, e só sincroniza com o app
aberto. As partes 1 a 3 convivem com isso: a carga do dia recompõe a base. A parte 4 resolve
esses limites.

| Parte | Entrega | Valor para o vendedor | Depende de | Situação |
|---|---|---|---|---|
| **0. Levantamento** | A integração apaga linha fisicamente? Grava sem `updatedAt`? Volume da maior carteira **e da maior equipe** (supervisor e gerente levam todos: clientes, produtos, preços, estoque) e quanto ocupa no aparelho | — (evita surpresa nas outras) | — | ✅ (10/11) — ver 9.9 |
| **1. Consulta offline** | Banco local; casca do app em cache; carga do dia e carga incremental (S1, S2, S3, S5); faixa "Offline · dados de HH:MM"; consulta de clientes da carteira, produtos, preço, estoque e agenda **só leitura**; apagar a base no logout e na troca de usuário | Consulta cliente, preço e estoque sem sinal | Parte 0; O1 (escopo); prazos de O2; F2 nas telas envolvidas | ⬜ |
| **2. Orçamento offline: gerar e alterar** | Fila de envio idempotente; comprovante de sincronismo do dia; **regra do mesmo dia pela data do servidor** (9.3a); revalidação no envio (preço, desconto, cliente; estoque só marca); tela "Pendências de envio"; aviso antes de sair com fila (S6) | Monta o pedido no cliente sem sinal | Parte 1 (decisões tomadas em 10/11) | ⬜ |
| **3. Orçamento offline: enviar e aprovar; atividade e visita** | Envio e aprovação na fila, executados só no sincronismo do mesmo dia; atividade, visita e anotação offline (S4); sessão substituída ou desconectada (S7); "apagar dados deste aparelho" em Acessos | Fecha o atendimento inteiro sem sinal | Parte 2; O5 | ⬜ |
| **4. Casca nativa (Capacitor) para iPhone e Android** | O mesmo app dentro de um app nativo: base local persistente e cifrada, biometria para abrir offline, sincronização em segundo plano onde o sistema deixa, push nativo. Publicação nas lojas | Offline confiável no iPhone; app nas lojas | Parte 3; contas das lojas e Mac (seção 4.4); é a F6 deste plano | ⬜ |

A ordem vai do menor risco para o maior. A parte 1 só lê, e não há como um pedido sair errado.
A parte 2 grava, mas nada sai do sistema. A parte 3 é a primeira em que uma ação feita offline
chega ao ERP ou ao cliente, e por isso fica para quando as duas primeiras estiverem conferidas na
rua.

**Piloto pelo Android (decisão de 10/11).** O código é um só. O que muda é onde cada parte é
testada e liberada primeiro:

1. **Piloto** de cada parte com um ou dois vendedores com Android. No Android, o PWA guarda a base
   de forma persistente, sincroniza em segundo plano, tem o botão "Instalar app" e é depurado
   pelo Chrome do computador Windows por cabo. O que se testa é o que o vendedor vai ter.
2. **Conferência num iPhone** antes de liberar cada parte para todos (instalado pela tela de
   início). É conferência, não desenvolvimento novo.
3. **Liberação para o iPhone:**
   - a **parte 1** (consulta) vai junto com o Android. Se o sistema apagar a base, a carga do
     dia recompõe e nada se perde;
   - as **partes 2 e 3** (orçamento offline) vão para o iPhone só depois de testadas na rua com
     o Android. No PWA, o risco no iPhone é o sistema apagar um orçamento ainda não enviado. A
     parte 4 (Capacitor) elimina esse risco.

Todo o offline depende de F2 (telas do vendedor revisadas no celular): não compensa tornar
offline uma tela que ainda não está boa no celular.

### 9.9 Resultado do levantamento (parte 0, 10/11)

Medido na base de dev, que é cópia da produção.

**Exclusões:** a integração marca `deletedAt` (não apaga a linha) em clientes, produtos,
estoque, tabelas de preço e títulos a receber. Então a carga incremental sabe o que sumiu.
Duas exceções, sem impedimento:

- itens do orçamento/pedido são regravados inteiros (`orcamento_itens`), como já previsto: o
  orçamento sincroniza com cabeçalho e itens juntos;
- faixas de regra de desconto são apagadas e recriadas (`regra_desconto_faixas`): a regra
  sincroniza inteira, com as faixas.

Não há SQL direto na integração gravando sem atualizar `updatedAt`.

**Volume** (empresa `rcg`, a maior):

| Dado | Linhas | Tamanho no banco |
|---|---:|---:|
| Clientes | 6.713 | 3,7 MB |
| Produtos ativos | 4.912 | 3,7 MB |
| Itens de tabela de preço | 17.455 | 4,5 MB |
| Estoques | 2.730 | 1,0 MB |
| Títulos em aberto | 1.265 (de 133 mil no total) | 1,3 MB |
| **Total** | | **≈ 14 MB** |

- **Maior equipe:** os dois superiores do topo veem a carteira inteira (6.711 clientes). Com a
  decisão O1, é a base completa da empresa. A maior carteira de vendedor tem cerca de 2 mil
  clientes ("ESCRITORIO"). Um representante típico fica entre 300 e 500.
- **Cabe com folga:** cerca de 14 MB no banco, algo como 30 a 45 MB no celular (com índices), e
  3 a 4 MB para baixar compactado na carga completa. O espaço do navegador no celular fica na casa
  dos gigabytes. A carga incremental do dia é bem menor.
- **Fica de fora da carga:** títulos já pagos (133 mil linhas) e o histórico completo de notas.
  Para "últimas compras" vai um resumo por cliente, com as últimas N compras, sem os itens
  de todas as notas.
- **Achado à parte:** há "vendedores" que não são pessoas ("ESCRITORIO", "TEMP REGIAO 001
  INTERNO", "EMPRESA ENCERRADA") com centenas de clientes. Sem login, não levam nada ao celular.
  Só pesam na carga do superior deles.

## 11. App nativo (Capacitor)

> Decisão do usuário, 10/11: **"Quero uma opção de ter APP nativo."** Caminho B (casca nativa),
> não reescrita. Primeiro um **APK de Android para teste local** (instalado à mão, fora da loja);
> Google Play e App Store depois. O navegador e o app instalado pelo site **continuam como estão**.

> **Princípio (usuário, 10/11): coisas separadas.** O app nativo é um projeto à parte e **não pode
> afetar o sistema pelo navegador**. Nada do app entra no workspace do monorepo (`apps/*`,
> `packages/*`, lockfile do pnpm), e nenhuma mudança na web ou na API vai junto com a casca. O que
> precisar mexer na web ou na API (notificação nativa N3, ajustes N4) é entrega separada, com
> aprovação própria, e não pode mudar o comportamento de quem usa pelo navegador.
>
> **Em planejamento** — nada implementado.

### 11.1 Como funciona

O app nativo é uma casca fina: abre o mesmo sistema do servidor numa tela nativa (WebView). As
telas continuam vindo do servidor — mudar tela não exige nova versão do app. Nova versão só quando
a casca muda (plugin novo, ícone, permissão).

| Parte | Onde | Observação |
|---|---|---|
| Projeto da casca | Fora do workspace: repositório próprio ou pasta `mobile/` na raiz, com dependências e lockfile próprios (decisão 11.3) | Capacitor 8 (8.6.0 em 10/11). `server.url` aponta para o endereço do sistema; um app por endereço no teste |
| Notificação | **FCM** (Firebase Cloud Messaging), não Web Push | A WebView do Android não tem Push API: o Web Push de hoje não funciona dentro do app. A API passa a mandar pelos dois canais: Web Push para navegador e app do site, FCM para o app nativo |
| Detectar o app | `window.Capacitor` na web | Dentro do nativo, a web esconde o "Instalar app" e a faixa de Web Push, e pede a permissão nativa |
| Offline (partes 1–4 da seção 9) | Banco local nativo (SQLite), na parte 4 | É o que resolve a fragilidade do armazenamento do iPhone |

### 11.2 Fases

| Fase | Entrega | Precisa de | Situação |
|---|---|---|---|
| N1 | Casca Android abrindo o sistema; ícone e nome; voltar do Android navega; link externo abre fora | Projeto Capacitor | ⬜ |
| N2 | APK de teste gerado e instalado num Android | Build em **container Docker** (decisão de 10/11): imagem mínima com JDK e só as partes do Android SDK que o build usa, nada instalado no Windows. Sem emulador: o APK vai para o celular por arquivo | ⬜ |
| N3 | Notificação nativa: plugin de push, projeto Firebase, `google-services.json`, API enviando por FCM, assinatura do aparelho nativo na mesma tabela | Conta Firebase (gratuita) | ⬜ |
| N4 | Web dentro do app: esconder instalar e Web Push, usar a permissão nativa | N1 | ⬜ |
| N5 | Lojas: Google Play (US$ 25 uma vez) e App Store (US$ 99/ano, build de iOS precisa de Mac ou serviço de build) | Decisão de conta e de nome (D4) | ⬜ adiado |

### 11.3 Decisões

| # | Decisão | Resposta |
|---|---|---|
| A1 | Caminho | Casca nativa (Capacitor), não reescrita (10/11) |
| A2 | Primeira entrega | APK de Android para teste local; lojas depois (10/11) |
| A3 | App do site | Continua junto com o nativo (10/11) |
| A4 | Onde gerar o APK | Container Docker (10/11) |
| A5 | Endereço que o APK abre | Produção, `crm.rcgdist.com.br` (10/11): mostra o que está publicado |
| A6 | Separação | Projeto à parte, sem afetar o navegador (10/11) |
| A7 | **Repositório próprio ou pasta `mobile/` neste repositório?** | **Em aberto** |
| A8 | Conta e nome nas lojas (N5) | Adiado até o teste local passar |

## 12. Riscos

- **iPhone sem instalar não recebe push.** Quem usa pelo Safari sem "Adicionar à Tela de Início" não é avisado — por isso o convite de instalação (4.3) faz parte da entrega, não é enfeite.
- **Texto do aviso na tela bloqueada.** Valor de pedido, nome de cliente e desconto ficam visíveis para quem pegar o aparelho. Aviso curto ("Novo pedido de desconto aguardando"), detalhe só dentro do app.
- **Cache velho.** Qualquer cache de dados no service worker serviria preço/estoque/tela de usuário já saído — fica proibido, como já está documentado no `sw.js`. Com o modo offline (seção 9), o dado local passa a existir, mas **só no banco local controlado pelo sincronismo**, com data visível e prazos S3–S5. O service worker continua sem guardar resposta de API.
- **Pedido offline com preço vencido.** Mitigado pela revalidação no servidor (9.4) e pelo bloqueio S4. O vendedor precisa entender que o orçamento offline é rascunho até sincronizar; a tela tem que dizer isso.
- **Fila perdida.** Aparelho perdido, quebrado ou app removido com pedidos não enviados. O app avisa da fila pendente (S6) e tenta enviar a cada abertura com rede, mas o que nunca subiu se perde. Treinar a equipe para sincronizar antes de sair de área com sinal.
- **Expediente.** Fora do horário a sessão cai; o push nesse período abriria o app só para mostrar o login. Decidir com D3 se os avisos respeitam o horário (proposta: sim).
