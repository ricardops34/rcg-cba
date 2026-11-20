# Mapas de clientes, leads, calor e rotas de visita

Pedido do usuário em 2026-11-20. Situação: **planejado, decisões tomadas** (seção
"Decisões"). Nada implementado.

## O pedido

**Gerencial**
- Mapa de Clientes com filtros: cidade, estado, vendedor, situação, dias sem compra, top 10.
- Controle de rotas de visita: mapa para planejar o caminho, com filtros para escolher
  os clientes a visitar.

**Comercial**
- Mapa de Clientes com os mesmos filtros.
- Mapa de calor.
- Mapa de leads.

Junta-se ao pedido anterior do mesmo dia: **marcar/ajustar o pin** do cliente ou lead
no mapa para criar ou corrigir a coordenada.

## O que já existe (20/11)

- Mapa Leaflet + OpenStreetMap no botão **Mapa** da Posição de Clientes
  (`apps/web/src/components/comercial/mapa-clientes-leaflet.tsx`), pin colorido por
  situação (ativo, inativo, bloqueado, título aberto, título vencido) e leads abertos com
  pin próprio. Teto de 3000 pinos (`LIMITE_PINS_MAPA`).
- Filtros da Posição (`ClientesService.filtroPosicao`): vendedor (com escopo de carteira),
  ativo, UF, município, carteira, busca, **dias sem comprar**, produto comprado, CNAE,
  bloqueado, comodato sem consumo. Servem de base para o mapa novo.
- Coordenadas: Geocoding do Google (ao salvar + lote); 0/0 do ERP conta como vazia
  (commit f31d5579). Em dev, 693 dos 1108 clientes ativos da RCG têm coordenada real.
- Agenda: `Atividade` com `tipo = visita`, `dataVencimento`, `concluida` — é onde uma
  rota planejada pode cair para o vendedor.
- **Não existe**: top 10, mapa de calor, rota de visita (o "roteiro" atual,
  `WhatsappRoteiro`, é de atendimento por WhatsApp).

## Sem chave do Google (pedido do usuário, 2026-11-20)

Os mapas e o pin manual **não dependem** da chave nem de `GEO_ATIVO`: o mapa é
Leaflet + OpenStreetMap, e mostra todo cliente/lead que tem coordenada. A chave só é
exigida para o que é serviço do Google: busca automática de coordenada (Geocoding) e
cálculo de rota (Routes). Sem a chave, a tela de rota ainda deixa escolher e ordenar as
paradas e abrir no Google Maps/Waze; só não desenha o caminho pelas ruas.

Formas de obter a coordenada sem Google (o Leaflet sozinho só desenha o mapa, não
converte endereço em coordenada):
- **Pin manual** no mapa (fase 2) e os campos Latitude/Longitude do cadastro (já existem).
- **"Usar minha localização"**: o vendedor, no cliente, grava a posição do celular
  (localização do navegador). Gratuito e preciso; vale a mesma regra de aprovação do pin.
- **Nominatim (OpenStreetMap)** como alternativa ao Google — **decidido (20/11): os
  dois, usa o que estiver configurado** (parâmetro de provedor em Administração >
  Geolocalização). O serviço público aceita no máximo 1 consulta por segundo e acha
  menos números de rua no Brasil que o Google; com ele o lote anda a 1 por segundo.

## Aba Mapa no cliente (pedido do usuário, 20/11 — feita antes da fase 1)

No cadastro do cliente (editar e visualizar) e na Posição de Cliente, uma aba **Mapa**:
- mostra o cliente, a **empresa ativa** e, se o usuário pedir, a **localização dele**
  (navegador);
- permite incluir ou mover o pin do cliente e gravar a coordenada (regra da decisão 5:
  direto se estava vazia/0,0, solicitação se troca uma existente);
- botão **"Buscar pelo endereço"** quando a coordenada está vazia ou 0/0: consulta o
  serviço configurado (Google ou Nominatim) e coloca o pin para conferir antes de gravar;
- **"Usar minha localização"** como coordenada do cliente (quem está no cliente).

A empresa não tinha coordenadas: ganha `latitude`/`longitude` (migration), preenchidas
em Administração > Geolocalização pela mesma busca ou pelo pin.

**Feita em 20/11** (aguarda conferência visual): aba Mapa no cadastro do cliente
(editar: o pin vai para os campos e grava no Salvar; visualizar: grava na hora) e na
Posição de Cliente; card "Localização da empresa" em Geolocalização; rota
`POST /geocodificacao/buscar` (sem gravar), `GET/PUT /geocodificacao/empresa`;
regra de aprovação da coordenada manual na API (`ClientesService.update`).

## Coordenadas de onde o orçamento foi feito (pedido do usuário, 20/11 — a fazer)

Gravar a localização do dispositivo (navegador) em:
- criação/envio do orçamento;
- aprovações do orçamento: pelo cliente (link), pelo supervisor e pelo gerente;
- liberações de desconto.

Decisões (20/11): **não é obrigatória** — se o navegador negar ou falhar, a ação
segue e o registro fica "localização não informada" com o motivo; a localização
aparece **no detalhe do orçamento**, por evento (criado, enviado, aprovado pelo
cliente/supervisor/gerente, desconto liberado), com a posição e um mapa.
A levantar no código: cada ponto de aprovação.

## Regiões de atuação dos vendedores (pedido do usuário, 20/11 — depois dos mapas)

Em Gerencial > Vendedores: desenhar regiões no mapa (polígonos) e atribuí-las a
vendedores; há regiões de um vendedor e regiões livres. Vendedor do interior pode ter
um **município inteiro** como região (sem desenhar). Ferramentas para mostrar
**invasão de região**: cliente atendido/vendido por vendedor que não é o dono da região
onde ele está. A detalhar quando chegar a vez (o que conta como invasão: carteira do
cliente, quem vendeu a nota, quem fez o orçamento).

## Mapa da Posição melhorado (20/11 — em andamento)

Ordem acordada: (1) agrupar pinos próximos (leaflet.markercluster); (2) "Colorir por"
— financeiro, situação, vendedor, dias sem compra, tipo de pessoa, ramo (CNAE),
faturamento; legenda clicável com contagem; (3) filtro de tipo de pessoa; (4) balão
com vendedor, faturamento 12 meses, dias sem compra; (6) lista dos sem coordenadas e a
empresa como referência. Seleção por área fica com as rotas.

## Proposta em fases

Cada fase é uma entrega com commit próprio.

### Fase 1 — Mapa de Clientes (tela própria)
Uma única tela de mapa reaproveitada nos dois módulos, com uma rotina de permissão em
cada: `mapa-clientes` (Comercial) e `mapa-clientes-gerencial` (Gerencial). O escopo de
carteira já faz a diferença: o vendedor vê a carteira dele, a supervisão vê a equipe.

- Mapa em tela cheia, filtros numa barra lateral: UF, cidade, vendedor, situação, dias
  sem compra, **Top N** (ver decisão 3).
- Pin por situação (o mesmo de hoje), legenda que liga/desliga grupo.
- Contador "N no mapa / M sem coordenada" com acesso à lista dos sem coordenada.

### Fase 2 — Pin manual (pedido anterior)
- "Ajustar posição" no balão: pin arrastável, Salvar/Cancelar.
- Lista "Sem coordenadas": escolhe o cliente/lead e clica no mapa.
- Cliente grava pela fila de alterações (vai ao ERP); lead grava direto.

### Fase 3 — Mapa de calor e mapa de leads (Comercial)
- Calor: plugin `leaflet.heat`, alternável com os pinos na mesma tela.
- Leads: mesma tela com a camada de leads (filtros: situação, temperatura, vendedor,
  cidade/UF).

### Fase 4 — Rotas de visita (Gerencial)
- Escolher clientes no mapa (clique, ou laço/retângulo) a partir dos filtros.
- Ponto de partida (endereço da empresa, do vendedor ou ponto clicado).
- Ordenar as paradas e desenhar o caminho (ver decisão 1).
- Salvar a rota para um vendedor e uma data → cada parada vira uma **atividade de
  visita** na Agenda dele, na ordem.
- Acompanhamento: rotas do dia/semana, paradas feitas × pendentes (ver decisão 2).
- Botão "Abrir no Google Maps / Waze" para o vendedor navegar no celular.

## Decisões (usuário, 2026-11-20)

1. **Caminho da rota: Google Routes API.** Ruas reais desenhadas no mapa e ordem
   otimizada (até 25 paradas por rota), com a mesma chave do Google. Cobrado por rota
   calculada — calcular só no botão "Calcular rota", nunca a cada clique. A **Routes
   API** precisa ser ativada no projeto Google e incluída nas restrições da chave.
   Parâmetros próprios (ex.: `ROTA_ATIVO`), nascendo desligados como os `GEO_*`.
2. **Visitado = concluir na Agenda.** Cada parada vira atividade `visita` na Agenda do
   vendedor; feita = concluída. Sem check-in por GPS.
3. **Top N por faturamento no período escolhido** na tela (padrão 12 meses),
   quantidade 10/20/50. Mesma regra de venda do resto (`NOTA_DE_VENDA_SQL`).
4. **Mapa de calor alternável**: concentração de clientes × faturamento por região.
5. **Pin manual**: direto quando a coordenada estava vazia (ou 0/0), solicitação quando
   troca uma existente (quem aprova grava direto, como hoje); pode quem pode editar o
   cliente, respeitando a carteira. A lista "Sem coordenadas" entra junto (fase 2).
