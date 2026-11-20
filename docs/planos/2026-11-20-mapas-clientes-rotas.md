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
- **Nominatim (OpenStreetMap)** como alternativa ao Google — *a decidir*: gratuito, mas
  o serviço público aceita no máximo 1 consulta por segundo, não admite carga em massa
  e acha menos números de rua no Brasil que o Google.

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
