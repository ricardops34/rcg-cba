# Arquitetura e fluxos do `zapo-js`

## 1. Fronteiras de segurança

Existem três fronteiras distintas:

1. O navegador chama a API em `/api/v1/whatsapp/*` com JWT. `JwtAuthGuard` e
   `PermissionsGuard` aplicam autenticação, horário de trabalho e RBAC.
2. A API chama o worker usando `Authorization: Bearer
   <WHATSAPP_WORKER_TOKEN>`. O worker recusa subir se o segredo estiver vazio.
3. O worker retorna eventos para `/api/v1/whatsapp/interno/*` usando o mesmo
   segredo. Essas rotas não usam JWT e não aparecem no Swagger público.

O worker não deve ser publicado no Traefik. No stack de produção ele é acessível
apenas pela rede Docker compartilhada.

## 2. Bancos e isolamento

### Dados comerciais

As tabelas no schema `public` usam `empresaId` e RLS:

- `whatsapp_config`
- `whatsapp_sessoes`
- `whatsapp_contatos`
- `whatsapp_conversas`
- `whatsapp_mensagens`
- `whatsapp_reacoes`
- `whatsapp_mensagens_agendadas`
- `whatsapp_acoes`

Todo acesso passa por `PrismaService.withTenant(empresaId, ...)`, que executa
`SET LOCAL app.current_empresa_id` na transação.

### Estado criptográfico da sessão

O `@zapo-js/store-postgres` persiste chaves Signal, contatos e estado técnico no
schema `whatsapp`. O role `whatsapp_store`:

- é dono apenas desse schema;
- possui `USAGE` e `CREATE` nele porque a biblioteca executa DDL;
- não possui acesso ao schema comercial `public`;
- não é superuser e não possui `BYPASSRLS`.

O parâmetro `?schema=whatsapp` na URL não é interpretado pelo driver `pg` da
biblioteca. A migration define `ALTER ROLE whatsapp_store SET search_path =
whatsapp` para garantir o schema correto.

## 3. Configuração da empresa

`whatsapp_config` é singleton por empresa e nasce sob demanda. Os campos atuais
são:

| Campo | Uso |
|---|---|
| `ativo` | Bloqueia ou libera novas conexões e o atendimento |
| `transporte` | Atualmente deve ser `zapo` |
| `workerUrl` | URL interna do worker, por exemplo `http://rcgcba-whatsapp-worker:3100` |
| `dddPadrao` | Completa telefones locais sem DDD; nulo impede adivinhação |
| `retencaoDias` | Decisão registrada; o expurgo automático ainda não existe |

## 4. Pareamento e ciclo da sessão

1. O usuário precisa estar ligado a um cadastro de vendedor.
2. `POST /whatsapp/sessao/conectar` registra o aceite de privacidade e cria ou
   atualiza uma sessão única por `(empresaId, vendedorId)`.
3. A API chama `POST /sessoes` no worker.
4. `ZapoTransport.iniciar()` cria o cliente com store PostgreSQL e inicia a
   conexão sem esperar o QR ser lido.
5. O evento `auth_qr` atualiza o QR em memória.
6. A tela consulta `GET /whatsapp/sessao/pareamento` a cada poucos segundos; a
   API consulta o worker e devolve o QR atual.
7. `auth_paired` identifica o número e `connection` informa o estado real.
8. O worker envia o estado espontaneamente para
   `POST /whatsapp/interno/sessao-estado`.

Existe uma sessão por vendedor. Para trocar o número, a sessão anterior deve ser
desconectada antes.

### Reinício e reconexão

Ao subir, o worker consulta `GET /whatsapp/interno/sessoes-ativas` e tenta
restaurar cada sessão ativa sem exigir novo QR. A consulta usa retry indefinido,
com espera crescente limitada a cinco minutos, porque API e worker podem subir
juntos durante o deploy.

Quedas transitórias disparam reconexão automática com backoff. Motivos que
indicam credencial inválida não entram em loop: o estado passa a exigir novo
pareamento.

## 5. Recebimento de mensagens

```text
WhatsApp → evento zapo-js → worker → POST /whatsapp/interno/mensagem → API
```

O worker normaliza:

- `sessaoId` e `empresaId`;
- `externoId`;
- JID e telefone;
- direção (`minha`);
- nome de exibição;
- texto e tipo;
- metadados de arquivo;
- mensagem respondida.

### Regra de privacidade

A plataforma só persiste o conteúdo quando o contato está vinculado a um
cliente. Para contato sem vínculo:

- contato e conversa podem existir para permitir o vínculo posterior;
- o conteúdo da mensagem não é gravado;
- a mídia não é baixada;
- não existe recuperação retroativa depois do vínculo.

O worker primeiro envia apenas os metadados. Só quando a API responde
`arquivoNecessario: true` ele baixa os bytes e chama
`POST /whatsapp/interno/mensagem-arquivo`. Isso evita armazenar mídia pessoal de
contatos não vinculados.

### Idempotência

Reconexões podem repetir eventos. A chave única
`(empresaId, conversaId, externoId)` e o uso de `upsert` impedem duplicação da
mensagem e das notificações associadas.

### JIDs modernos

JIDs `@s.whatsapp.net` carregam o número. JIDs `@lid` são opacos; para eles o
worker resolve o telefone pela agenda persistida pelo store. A API tenta casar
clientes pelo telefone e só vincula automaticamente quando existe uma única
correspondência válida na carteira.

## 6. Envio

No envio de texto ou arquivo:

1. a API valida tenant, permissão, proprietário da sessão, vínculo e estado;
2. chama o worker;
3. o worker envia pelo cliente `zapo-js` conectado;
4. somente após confirmação do worker a API grava a mensagem e o `externoId`.

Gravar depois do provedor evita exibir como enviada uma mensagem que nunca saiu.
Arquivos têm limite de 16 MiB. O tráfego API→worker usa JSON com Base64; uploads
do navegador para a API usam `multipart/form-data`.

## 7. Reações e recibos

Reações chegam como addons de mensagem. O worker trata tanto eventos decifrados
quanto `message_addon`. Uma reação vazia representa remoção. A tabela usa uma
linha por `(empresaId, mensagemId, deQuem)`, de forma que reagir novamente
substitui o emoji anterior.

Recibos de entrega/leitura atualizam apenas mensagens de saída. A atualização é
monotônica: uma mensagem já lida não volta para entregue quando chega um evento
atrasado.

## 8. Agenda

A agenda e a lista de conversas são lidas do store do aparelho pelo worker. A
API cruza o resultado com a carteira do vendedor, mas não copia toda a agenda
pessoal para as tabelas comerciais. Somente vínculos confirmados entram em
`whatsapp_contatos`.

Grupos (`@g.us`) não participam da agenda usada para vínculo de clientes.

## 9. Mensagens agendadas

A API mantém um timer que procura mensagens vencidas. Como as tabelas têm RLS,
ela percorre empresas e abre uma transação tenant por empresa. Uma atualização
condicional de `pendente` para `enviando` impede duas réplicas da API de enviarem
a mesma mensagem.

Se a sessão estiver desconectada ou o envio falhar, o agendamento fica em estado
de erro e uma notificação é criada; ele não desaparece silenciosamente.

## 10. Limitações conhecidas

- Integração não oficial sujeita a quebra e banimento.
- Worker obrigatoriamente com uma réplica.
- O QR e estados de conexão vivem em memória do worker.
- Desconectar encerra o cliente, mas o adaptador atual não expurga explicitamente
  o material Signal persistido pelo `@zapo-js/store-postgres`; isso precisa de
  uma operação própria antes de ser tratado como exclusão definitiva da credencial.
- O corpo JSON da API aceita até 24 MB para comportar mídia Base64 de até 16 MB.
- `retencaoDias` ainda não executa expurgo.
- A disponibilidade depende da compatibilidade entre a versão do WhatsApp e a
  versão instalada do `zapo-js`.
