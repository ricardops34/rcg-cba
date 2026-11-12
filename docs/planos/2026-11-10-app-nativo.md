# App nativo — plano

> **Planejamento aprovado em 10/11; início adiado — nada implementado.** Nasceu na seção 11 do
> [plano do app no celular](2026-11-10-app-celular.md) e virou projeto à parte em 10/11.

## Onde paramos (10/11/2026)

Planejamento **fechado e aprovado** (A1–A13 e B1–B4, seções 6 e 7). **Início adiado** por decisão
do usuário (10/11: "Aprovado. Mas não vamos começar agora"). Nada no código. Ao retomar, começar
pela M0 e, antes dela, pela aprovação do login do app com revisão de segurança (B4).

## 1. Pedido

> *"Quero uma opção de ter APP nativo."* — *"Este APP precisa ter interface simples e fácil,
> estilo WhatsApp."* (usuário, 10/11)

Um app de celular com **telas próprias**, simples, para o dia a dia do vendedor e do supervisor.
O sistema no navegador (computador e celular) e o app instalado pelo site **continuam como estão**.

## 2. Princípio: coisas separadas

O app é um projeto à parte e **não pode afetar o sistema pelo navegador** (usuário, 10/11).

- Código em `mobile/` na raiz, **fora do workspace do pnpm** (`apps/*`, `packages/*`), com
  `package.json` e lockfile próprios. Nada do app entra na web.
- O app fala com a **mesma API** que o navegador usa. O que a API precisar ganhar para o app
  (seção 5) é entrega separada, com aprovação própria, e **não muda nada para quem usa o
  navegador**: rota nova ou modo novo, nunca mudança de comportamento do que existe.
- Regras de negócio continuam na API (acesso é código — CLAUDE.md). O app só mostra e pede; não
  decide permissão, preço, desconto nem escopo de carteira.

## 3. Como o app é feito

| Parte | Escolha | Por quê |
|---|---|---|
| Base nativa | **Capacitor 8** (8.6.0 em 10/11) | App nativo de verdade nas lojas, com plugins nativos (notificação, câmera, banco local), e telas em React — a mesma linguagem do resto do sistema |
| Telas | **Próprias do app**, em React, dentro do Capacitor (A11) | Interface pensada para o celular, independente da web |
| Visual | Estilo WhatsApp, **sem a marca do WhatsApp** (seção 4) | Simples, conhecido pela equipe |
| Endereço do sistema | Escolhido **na tela do app** (A10) | Um APK para todos os clientes |
| Dados da API | Mesmos endpoints da web, em `https://<endereço>/api/v1` | A API já atende no mesmo endereço do sistema |
| WhatsApp em tempo quase real | Consulta periódica, como a web faz hoje (8–20 s) | A plataforma não tem canal em tempo real; o app não precisa de um a mais |
| Notificação | **FCM** (Firebase) | A WebView não tem Web Push |
| Offline | Banco local nativo (SQLite), com as regras de sincronismo do plano do app no celular (seção 9) | Base certa desde o início |

## 4. Interface

Estilo WhatsApp, com as cores e a logo **da empresa** (plataforma multicliente, sem marcas):

- **Abas embaixo**: Conversas · Clientes · Agenda · Orçamentos · Estoque. O sino de avisos fica
  no topo, com o número de não lidos.
- **Listas** com foto ou iniciais, nome em destaque, uma linha de resumo, hora ou valor à
  direita, e o selo de pendência (como as mensagens não lidas).
- **Busca no topo** de cada aba; **botão +** redondo para a ação principal (novo orçamento, nova
  atividade, nova conversa).
- **Tela de conversa** igual à de um chat: balões, anexos, áudio, e as **ferramentas da
  plataforma** (ver A12) num menu do campo de digitar.
- Toque grande, uma ação por tela, sem tabela larga. O que não couber nisso fica no navegador.

## 5. O que a API precisa ganhar (entrega separada, aprovação própria)

| Item | Por quê | Sem afetar o navegador |
|---|---|---|
| Origem do app no CORS (`capacitor://localhost`, `https://localhost`) | A API só aceita as origens da stack (`CORS_ORIGIN`) | Acrescentar origem não muda as que existem |
| **Login do app**: renovação de sessão sem cookie | A renovação de hoje usa cookie HttpOnly (SEC-11), que não funciona bem fora do navegador | Modo de login próprio do aparelho nativo, com o token guardado no cofre do celular; o login do navegador não muda. Passa por revisão de segurança antes |
| Notificação por FCM | Avisos do sino no app | Web Push continua igual para o navegador; FCM é um canal a mais |
| O que faltar para as telas | Uma tela do app pode precisar de um resumo que a web monta sozinha | Rota nova, nunca mudança de resposta de rota existente |

## 6. Decisões

| # | Decisão | Resposta |
|---|---|---|
| A1 | Caminho | Capacitor (10/11). **Revista no mesmo dia por A11**: não é mais só casca |
| A2 | Primeira entrega | APK de Android para teste local; lojas depois (10/11) |
| A3 | App do site | Continua junto com o nativo (10/11) |
| A4 | Onde gerar o APK | Container Docker, nada instalado no Windows (10/11) |
| A5 | Endereço no teste | Produção, `crm.rcgdist.com.br` (10/11), digitado no app (A10) |
| A6 | Separação | Projeto à parte, sem afetar o navegador (10/11) |
| A7 | Onde fica o código | Pasta `mobile/` na raiz, fora do workspace (10/11) |
| A8 | Conta e nome nas lojas | Adiado até o teste local passar |
| A9 | Como testar | Celular Android de verdade, APK por arquivo; sem emulador nesta fase (10/11) |
| A10 | Endereço parametrizável | Na tela do app: pergunta na 1ª abertura, guarda, troca ao abrir; só `https` (10/11) |
| A11 | De onde vêm as telas | **Telas próprias do app**, estilo WhatsApp, falando com a mesma API (10/11) |
| A12 | Funções da 1ª versão | **Clientes e posição · Orçamentos · Agenda e atividades · Avisos · WhatsApp completo** — *"o WhatsApp completo que temos na plataforma, por conta das ferramentas"* · **Estoque** (10/11) |
| A13 | O resto | Continua no navegador (dashboards, relatórios, cadastros, administração) |

## 7. Decisões de partida (aprovadas em 10/11)

| # | Pergunta | Aprovado |
|---|---|---|
| B1 | **Ordem das entregas** | M0 base (endereço, login, abas, sino) → M1 WhatsApp completo → M2 Clientes e posição → M3 Orçamentos → M4 Agenda e atividades → M5 Estoque → M6 Notificação FCM → M7 Offline. WhatsApp primeiro porque é o que mais se usa no celular e o que mais pesa (ferramentas) |
| B2 | **Tipos da API** | O app usa o pacote `@plataforma/contracts` por caminho de arquivo, só leitura, para os tipos não divergirem da API. Não entra no workspace nem muda o pacote |
| B3 | **Biblioteca de componentes** | Ionic React (componentes com jeito de app: abas, listas, gestos de voltar) ou componentes próprios. Proposta: Ionic, pelo ganho de "cara de app" com pouco código |
| B4 | **Login do app (seção 5)** | Aprovar o modo de login do aparelho nativo antes de M0, com revisão de segurança |

## 8. Fases (proposta, depende de B1)

| Fase | Entrega | Situação |
|---|---|---|
| M0 | Projeto em `mobile/`, endereço (A10), login do app, abas, sino; APK de teste em Docker | ⬜ |
| M1 | WhatsApp completo: conversas, chat, anexos, áudio, ferramentas | ⬜ |
| M2 | Clientes e posição (carteira, busca, títulos, compras, mix) | ⬜ |
| M3 | Orçamentos (criar, alterar, enviar, pedir/liberar/recusar desconto) | ⬜ |
| M4 | Agenda e atividades | ⬜ |
| M5 | Estoque | ⬜ |
| M6 | Notificação nativa (FCM) | ⬜ |
| M7 | Offline (regras do plano do app no celular, seção 9) | ⬜ |
| M8 | Lojas (Google Play US$ 25 uma vez; App Store US$ 99/ano, build iOS precisa de Mac ou serviço) | ⬜ adiado |

## 9. Riscos

- **Duas interfaces para manter.** Cada função nova do dia a dia pode precisar de tela na web e no
  app. Mitigação: o app fica só com o dia a dia (A12); regra continua na API.
- **WhatsApp com ferramentas** é a parte mais pesada: as regras de acesso das ferramentas estão em
  código na API e devem continuar lá ([docs/ferramentas/README.md](../ferramentas/README.md)) — o
  app só chama.
- **Login fora do navegador** troca a proteção do cookie HttpOnly pelo cofre do aparelho; precisa
  de revisão de segurança (B4).
- **Endereço digitado** (A10): o app só aceita `https` e não dá ao site digitado acesso nativo.
