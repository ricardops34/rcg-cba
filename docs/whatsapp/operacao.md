# Operação do WhatsApp

Vale para os dois transportes. O que é específico está marcado.

## Variáveis de ambiente

### API

| Variável | Obrigatória | Uso |
|---|---:|---|
| `WHATSAPP_WORKER_TOKEN` | sim no `zapo` | Segredo compartilhado com o worker |
| `WHATSAPP_WORKER_TIMEOUT_MS` | não | Timeout das chamadas API→worker; padrão 10 s |
| `WHATSAPP_CRYPTO_KEY` | sim no `evolution_go` | 32 bytes em base64. Cifra a chave do gateway, o token de cada instância e o segredo do webhook. Sem ela, gravar a chave é recusado |
| `WHATSAPP_EVOLUTION_WEBHOOK_BASE_URL` | não | Endereço com que o gateway chama a API de volta; padrão `http://api:3001` |
| `WHATSAPP_EVOLUTION_TIMEOUT_MS` | não | Timeout das chamadas API→gateway; padrão 15 s |
| `WHATSAPP_EVOLUTION_MAX_RESPOSTA_BYTES` | não | Teto do corpo devolvido pelo gateway; padrão 32 MB |

### Evolution GO (serviço)

| Variável | Obrigatória | Uso |
|---|---:|---|
| `EVOLUTION_GO_IMAGE` | sim | Tag fixa da imagem (`evoapicloud/evolution-go:0.7.2`). Sem valor padrão de propósito |
| `EVOLUTION_DATABASE_URL` | sim | Banco técnico próprio. O stack injeta em `POSTGRES_DB`, `POSTGRES_AUTH_DB` e `POSTGRES_USERS_DB` — **não existe `DATABASE_URL`** neste serviço, e sem as duas últimas ele morre em panic no auto-migration |
| `EVOLUTION_GLOBAL_API_KEY` | sim | Chave administrativa. O **mesmo** valor precisa ser gravado pela tela, onde fica cifrado |
| `WEBHOOK_FILES` / `DATABASE_SAVE_MESSAGES` | — | Fixados em `false` no stack: quem decide o que é gravado é a API |

### Worker

| Variável | Obrigatória | Uso |
|---|---:|---|
| `DATABASE_URL` | sim | Conexão do role `whatsapp_store` |
| `WHATSAPP_WORKER_TOKEN` | sim | Mesmo valor configurado na API |
| `API_URL` | não | URL interna da API; padrão `http://api:3001` |
| `PORT` | não | Porta HTTP; padrão `3100` |
| `WHATSAPP_LOG_NIVEL` | não | `info` ou `debug` |

No Portainer, a variável externa chama-se `WHATSAPP_STORE_DATABASE_URL` e o
stack a injeta no worker como `DATABASE_URL`.

## Valores esperados em produção

```env
WHATSAPP_STORE_DATABASE_URL="postgresql://whatsapp_store:SENHA@postgres:5432/plataforma_comercial?schema=whatsapp"
WHATSAPP_WORKER_TOKEN="SEGREDO_ALEATORIO_FORTE"
```

Na configuração da empresa:

```text
Transporte: zapo
Worker URL: http://rcgcba-whatsapp-worker:3100
```

O token precisa ser exatamente igual nos serviços `api` e `whatsapp-worker`.

Para a Evolution GO:

```env
WHATSAPP_CRYPTO_KEY="32_BYTES_EM_BASE64"
EVOLUTION_GO_IMAGE="ghcr.io/.../evolution-go:TAG_FIXA_CONFIRMADA"
EVOLUTION_DATABASE_URL="postgresql://evolution:SENHA@postgres:5432/evolution?sslmode=disable"
EVOLUTION_GLOBAL_API_KEY="SEGREDO_ALEATORIO_FORTE"
```

```text
Transporte: evolution_go
Endereço: http://rcgcba-evolution-go:8080
Chave de API: o mesmo EVOLUTION_GLOBAL_API_KEY
Versão homologada: a tag do EVOLUTION_GO_IMAGE
```

A chave precisa ser exatamente igual no serviço `evolution-go` e na tela. Ela é
gravada cifrada e nunca é devolvida pela API — a tela mostra só os últimos 4
caracteres.

## Banco

As migrations da API criam o role e o schema do store. Após o primeiro deploy,
troque a senha placeholder:

```sql
ALTER ROLE whatsapp_store WITH PASSWORD 'SENHA_FORTE_AQUI';
```

Confirme o isolamento:

```sql
SELECT rolname, rolsuper, rolbypassrls
FROM pg_roles
WHERE rolname = 'whatsapp_store';

SELECT nspname, pg_get_userbyid(nspowner) AS owner
FROM pg_namespace
WHERE nspname = 'whatsapp';
```

Resultado esperado: `rolsuper=false`, `rolbypassrls=false` e schema `whatsapp`
pertencente a `whatsapp_store`.

## Deploy

O worker usa a imagem `bjsoftware/rcgcba-whatsapp-worker:latest`. Requisitos:

- Node 22 na imagem;
- migrations da API aplicadas antes do primeiro pareamento;
- rede Docker compartilhada com a API e o PostgreSQL;
- volume do PostgreSQL persistente;
- exatamente uma réplica do worker;
- nenhuma rota pública no Traefik.

O estado de sessão persiste no PostgreSQL; reiniciar o container não exige novo
QR enquanto a credencial continuar válida.

## Verificações

### Worker saudável

De dentro da rede Docker:

```bash
curl -H "Authorization: Bearer $WHATSAPP_WORKER_TOKEN" \
  http://rcgcba-whatsapp-worker:3100/saude
```

Resposta:

```json
{ "ok": true }
```

### Configuração da empresa

Na interface, abra **Administração → WhatsApp → zapo-js** e confirme:

- atendimento ativo;
- endereço interno do worker;
- DDD padrão, quando necessário.

### Pareamento

O vendedor abre **Comercial → Atendimento**, aceita o aviso e lê o QR em:

```text
WhatsApp no celular → Aparelhos conectados → Conectar aparelho
```

## Logs

Em operação normal use `WHATSAPP_LOG_NIVEL=info`. Use `debug` temporariamente
para investigar addons cifrados, especialmente reações que não chegam. O nível
debug é mais ruidoso.

Os logs nunca devem registrar `WHATSAPP_WORKER_TOKEN`, chaves Signal ou conteúdo
integral de credenciais.

## Diagnóstico

### Evolution GO: a tela recusa gravar a chave

`WHATSAPP_CRYPTO_KEY` ausente ou com tamanho errado. São 32 bytes em base64, na
API — recusar é de propósito: melhor do que guardar segredo de terceiro em
claro. Trocar essa chave depois invalida o que já está gravado; é preciso
regravar a chave pela tela e reconectar as instâncias.

### Evolution GO: tudo responde 502, e o log do gateway diz 503

Licença não ativada. A 0.7.2 recusa **toda** a API com
`503 LICENSE_REQUIRED` até a ativação, e a plataforma converte isso no 502 que
aparece na tela. Confirme antes de procurar qualquer outra causa:

```bash
curl http://rcgcba-evolution-go:8080/license/status
```

`{"status":"inactive"}` significa que nada vai funcionar — nem com a chave
correta. A ativação é pelo `/manager/login` do próprio serviço.

### Evolution GO: 502 ao conectar

- confira `evolutionUrl` na configuração da empresa;
- confirme o alias `rcgcba-evolution-go` na rede Docker;
- confira se a chave gravada na tela é a mesma `EVOLUTION_GLOBAL_API_KEY` do
  serviço;
- consulte o log do gateway.

### Evolution GO: conecta, mas nada chega

O suspeito número um é o webhook. Ele é registrado a cada `connect` — se o
gateway foi restaurado de um backup ou reiniciou perdendo a configuração, a
instância fica conectada e **muda**, que parece funcionamento normal. Reconecte
a instância pela aba Instâncias: é o mesmo caminho que re-registra o webhook.

Depois confira, nos logs da API:

- **401 no webhook**: o segredo da instância não bate (chave mestra trocada,
  instância recriada no gateway sem repareamento) ou a sessão já não está no
  transporte `evolution_go`;
- **nada no log**: o gateway não está chamando. Confirme
  `WHATSAPP_EVOLUTION_WEBHOOK_BASE_URL` — `localhost` ali aponta para dentro do
  container do gateway, e nenhum evento sai de lá.

### Evolution GO: mensagem enviada não recebe recibo

A gravação depende do `externoId` que o gateway devolve no envio. Se a versão
instalada devolver o id em outro campo, a API recusa o envio com "não devolveu o
identificador da mensagem enviada" — é proposital: gravar com id inventado
deixaria a bolha com um risco só para sempre. O ajuste é no `externoId()` do
`EvolutionGoProvider`, contra o Swagger da versão em uso.

### Worker não sobe

- `DATABASE_URL não configurada`: informe a conexão do `whatsapp_store`.
- `WHATSAPP_WORKER_TOKEN não configurado`: defina o segredo nos dois serviços.
- erro de WebSocket no Node 20: use a imagem do worker baseada em Node 22.
- erro de criação de tabela/schema: confira owner e `search_path` do role.

### API retorna 502

- confirme `workerUrl` na configuração da empresa;
- confirme DNS/alias `rcgcba-whatsapp-worker` na rede Docker;
- consulte logs do worker;
- confira se o Bearer token é igual nos dois containers;
- aumente `WHATSAPP_WORKER_TIMEOUT_MS` apenas se a rede estiver saudável e a
  operação realmente precisar de mais tempo.

### QR não aparece

- a empresa precisa estar ativa para WhatsApp;
- o usuário precisa estar vinculado a um vendedor;
- o vendedor precisa de `whatsapp-conversas.editar`;
- consulte `GET /sessoes/:id/pareamento` no worker;
- credencial morta pode exigir remover a conexão e parear novamente.

### Conecta, mas contatos não aparecem

- solicite **Sincronizar agenda** na tela;
- confirme nos logs se o app-state sync foi executado;
- JIDs `@lid` dependem dos dados de agenda para resolver o telefone;
- grupos são ignorados intencionalmente.

### Mensagem recebida não aparece

- conteúdo de contato sem cliente vinculado não é persistido por política;
- confira se o contato está vinculado ao cliente correto;
- confirme o callback `/whatsapp/interno/mensagem` nos logs da API;
- reenvios não criam outra linha por causa da chave idempotente.

### Mídia não aparece

- a API só pede download depois de decidir persistir a mensagem;
- confira o limite de 16 MiB;
- confirme o volume `/app/apps/api/uploads`;
- confira o segundo callback `/whatsapp/interno/mensagem-arquivo`.

### Reação não aparece

- habilite temporariamente `WHATSAPP_LOG_NIVEL=debug`;
- procure eventos `message_addon` e falhas de decifragem;
- reações a mensagens que a plataforma não gravou são ignoradas.

## Backup e recuperação

O backup completo precisa incluir:

1. schema `public`, com conversas e histórico comercial;
2. schema `whatsapp`, com material necessário para restaurar sessões do `zapo`;
3. banco `evolution`, com as sessões do gateway (só no transporte
   `evolution_go`);
4. volume de uploads, com mídia enviada e recebida.

Restaurar somente o schema `public` preserva o histórico, mas pode exigir novo
pareamento. Restaurar somente o material técnico (schema `whatsapp` ou banco
`evolution`) preserva credenciais, mas não recupera conversas comerciais nem
vínculos.

Um detalhe que só aparece na hora errada: os segredos das instâncias da
Evolution GO estão cifrados com a `WHATSAPP_CRYPTO_KEY`. Restaurar o banco sem
restaurar essa variável deixa as instâncias inalcançáveis — o caminho então é
reconectar cada uma, que gera token e segredo novos.

