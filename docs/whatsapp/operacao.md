# Operação do WhatsApp

A plataforma opera com o **Gateway Evolution GO** como transporte único para o Atendimento por WhatsApp (suportando os modos Não Oficial via QR Code e Oficial via Cloud API da Meta).

## Controle de ativação por empresa

O canal de WhatsApp possui ativação master por tenant (`ativo: boolean`), configurado na tela **Administração > WhatsApp** (`/admin/whatsapp`), alinhado aos canais de E-mail (`EMAIL_ATIVO`) e SMS (`SMS_ATIVO`).

Quando desativado:
- O pareamento de novas sessões é bloqueado;
- O envio e recebimento de mensagens são desabilitados para a empresa;
- Notificações de aviso são exibidas nas telas de atendimento.

## Variáveis de ambiente

### API (`rcgcba-api`)

| Variável | Obrigatória | Uso |
|---|---:|---|
| `WHATSAPP_CRYPTO_KEY` | sim | 32 bytes em base64. Cifra a chave do gateway, o token de cada instância e o segredo do webhook. Sem ela, gravar a chave do gateway é recusado |
| `WHATSAPP_EVOLUTION_WEBHOOK_BASE_URL` | não | Endereço com que o gateway chama a API de volta; padrão `http://api:3001` (ou `http://rcgcba-api:3001` em produção) |
| `WHATSAPP_EVOLUTION_TIMEOUT_MS` | não | Timeout das chamadas API→gateway; padrão 15 s |
| `WHATSAPP_EVOLUTION_MAX_RESPOSTA_BYTES` | não | Teto do corpo devolvido pelo gateway; padrão 32 MB |

### Gateway Evolution GO (`rcgcba-evolution-go`)

| Variável | Obrigatória | Uso |
|---|---:|---|
| `EVOLUTION_GO_IMAGE` | sim | Tag fixa da imagem (ex.: `evoapicloud/evolution-go:0.7.2`). Sem valor padrão de propósito |
| `EVOLUTION_DATABASE_URL` | sim | Banco técnico exclusivo do gateway. O stack injeta em `POSTGRES_DB`, `POSTGRES_AUTH_DB` e `POSTGRES_USERS_DB` (o serviço exige as três DSNs) |
| `EVOLUTION_GLOBAL_API_KEY` | sim | Chave administrativa global. O **mesmo** valor deve ser cadastrado na tela de Administração > WhatsApp |
| `SERVER_PORT` | não | Porta HTTP interna do gateway; padrão `8080` |
| `WEBHOOK_FILES` | não | Fixado em `false`: a API decide se persiste e baixa arquivos |
| `DATABASE_SAVE_MESSAGES` | não | Fixado em `false`: a retenção e persistência são geridas pela plataforma |

## Valores esperados em produção

No stack principal (`stack.rcgcba.prod.yml` / Portainer):

```env
WHATSAPP_CRYPTO_KEY="32_BYTES_EM_BASE64"
WHATSAPP_EVOLUTION_WEBHOOK_BASE_URL="http://rcgcba-api:3001"
```

No stack de serviços (`stack.servicos.prod.yml` / Portainer):

```env
EVOLUTION_GO_IMAGE="evoapicloud/evolution-go:0.7.2"
EVOLUTION_DATABASE_URL="postgresql://evolution:SENHA_FORTE@postgres:5432/evolution?sslmode=disable"
EVOLUTION_GLOBAL_API_KEY="SEGREDO_ALEATORIO_FORTE_EVOLUTION"
```

Na configuração da empresa (**Administração → WhatsApp**):

```text
Ativo: Habilitado (switch ligado)
Gateway URL: http://rcgcba-evolution-go:8080
Chave de API: o mesmo valor de EVOLUTION_GLOBAL_API_KEY
Versão homologada: 0.7.2
DDD padrão: 67 (ou o da empresa)
```

A chave é gravada cifrada e nunca é devolvida pela API — a tela exibe apenas a confirmação e os últimos 4 dígitos.

## Banco técnico do Gateway

O gateway roda migrations próprias e gerencia credenciais de sessão. Ele deve usar um banco e role dedicados no PostgreSQL:

```sql
CREATE ROLE evolution WITH LOGIN PASSWORD 'SENHA_FORTE_AQUI';
CREATE DATABASE evolution OWNER evolution;
```

## Pareamento e uso

1. O administrador configura os parâmetros em **Administração → WhatsApp** e salva;
2. Para instâncias de vendedores, o vendedor abre **Comercial → Atendimento**, aceita os termos e lê o QR Code;
3. Para o número institucional, o administrador conecta pela aba **Institucional**;
4. No modo oficial da Meta via Evolution GO, a conexão é configurada diretamente com as credenciais da Meta no gateway.

## Diagnóstico

### Tela recusa gravar a chave da Evolution GO
- `WHATSAPP_CRYPTO_KEY` ausente ou inválida. Devem ser exatamente 32 bytes codificados em base64 na API.
- Gerar nova chave: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

### Erro 502 ao salvar ou testar gateway
- Confirme se o serviço `evolution-go` está rodando e acessível na rede Docker interna (`http://rcgcba-evolution-go:8080`).
- Verifique a saúde do serviço: `GET http://rcgcba-evolution-go:8080/server/ok`.
- Se a versão da imagem exigir licença (ex.: 0.7.2), verifique `GET http://rcgcba-evolution-go:8080/license/status`. `{"status":"inactive"}` exige ativação no `/manager/login`.

### Instância conectada mas mensagens não chegam na plataforma
- Verifique a URL do webhook registrada na instância. A URL deve apontar para o host interno da API (ex.: `http://rcgcba-api:3001/api/v1/whatsapp/evolution/webhook/:empresaId/:sessaoId`). Se estiver como `localhost`, o webhook tentará chamar o próprio container do gateway.
- Verifique se a empresa está com WhatsApp ativo (`ativo: true`).
- Nos logs da API, confira se chegam chamadas no `WhatsappEvolutionController`. Status `401` indica divergência no segredo do webhook da instância (reparar reconectando a sessão).

### Mídia recebida não baixa
- A plataforma só baixa mídia de conversas com clientes vinculados.
- Verifique o diretório de uploads persistente (`/app/apps/api/uploads`).
- Verifique se o gateway consegue devolver a mídia pela rota `POST /message/downloadmedia`.

## Backup e recuperação

O backup do WhatsApp envolve:
1. Schema `public` do banco comercial: armazena conversas, mensagens, vínculos com clientes, recibos e auditoria;
2. Banco `evolution`: armazena as instâncias, tokens e sessões do gateway;
3. Volume de uploads da API (`uploads`): armazena áudios, imagens e documentos trafegados;
4. A variável `WHATSAPP_CRYPTO_KEY`: necessária para decifrar as credenciais gravadas. Se for perdida, as instâncias precisarão ser reconectadas.
