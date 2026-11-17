# Coordenadas do cliente pelo Google (Geocoding API)

Pedido de 16/11/2026: obter latitude e longitude do cliente pela API do Google,
com URL e chave em parâmetros e uma tela no módulo Administração.

## Decisões do usuário (16/11/2026)

- **Quando busca:** automático ao salvar o cliente **e** lote na tela de
  Administração. Sem botão no cadastro.
- **Vai ao ERP:** sim, pela fila de alterações (A1_XLAT/A1_XLNG, já mapeados na
  BJPLA004 — nenhuma mudança de AdvPL).

## Decisões de implementação (sem pergunta — revisar se não servirem)

- **Parâmetros** (sem tabela própria, como SMS): `GEO_ATIVO` (nasce desligado),
  `GEO_URL`, `GEO_CHAVE` (senha, cifrada com `PARAMETROS_CRYPTO_KEY`, fora do
  backup), `GEO_AO_SALVAR` (padrão ligado), `GEO_LOTE_LIMITE` (padrão 200).
- **Tela:** Administração > Geolocalização (`/admin/geolocalizacao`, rotina
  `geolocalizacao`, concedida aos perfis `sistemaBase`). Configuração, teste de
  um endereço (não grava) e o lote com andamento.
- **Ao salvar:** consulta quando o endereço mudou (grafia não conta) ou quando
  está sem coordenada e o Google ainda não tentou aquele cadastro. Coordenada
  digitada na tela vence. A coordenada vai na mesma solicitação do endereço —
  aplicada direto ou para aprovação junto com ele. Falha do Google nunca impede
  salvar (só log).
- **Precisão:** grava ROOFTOP, RANGE_INTERPOLATED e GEOMETRIC_CENTER.
  APPROXIMATE (bairro/cidade) conta como não encontrado — um ponto no centro da
  cidade engana mais do que ajuda. 6 casas decimais.
- **Lote:** clientes ativos, sem coordenada, com rua + cidade + UF, ainda não
  consultados (`clientes.coordenadasConsultadasEm`); opção de reconsultar os não
  encontrados. Segundo plano, andamento em memória (reinício da API interrompe;
  quem já foi consultado está marcado). Para na chave recusada / cota
  (REQUEST_DENIED, OVER_*_LIMIT) ou em 10 falhas seguidas. Grava pela fila com
  origem `geocodificacao` ("Coordenadas (Google)"), aplicada direto.

## Onde está

- API: `apps/api/src/modules/geocodificacao/`; gancho em
  `ClientesService.create/update`.
- Migration: `20261116140000_geocodificacao_clientes`.
- Contrato: `packages/contracts/src/geocodificacao.ts`.
- Tela: `apps/web/src/app/(app)/admin/geolocalizacao/page.tsx`.

## Pendente

- Chave real do Google para validar ponta a ponta (só a resposta de chave
  inválida foi conferida).
- Conferência visual da tela; publicar.
