# Operação do worker `zapo-js`

## Variáveis de ambiente

### API

| Variável | Obrigatória | Uso |
|---|---:|---|
| `WHATSAPP_WORKER_TOKEN` | sim para integração | Segredo compartilhado com o worker |
| `WHATSAPP_WORKER_TIMEOUT_MS` | não | Timeout das chamadas API→worker; padrão 10 s |

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
2. schema `whatsapp`, com material necessário para restaurar sessões;
3. volume de uploads, com mídia enviada e recebida.

Restaurar somente o schema `public` preserva o histórico, mas pode exigir novo
pareamento. Restaurar somente o schema `whatsapp` preserva credenciais técnicas,
mas não recupera conversas comerciais nem vínculos.

