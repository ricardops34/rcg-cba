# Referência de endpoints do WhatsApp

Todos os caminhos da API abaixo partem de `/api/v1`. Salvo indicação contrária,
exigem `Authorization: Bearer <JWT>` e passam por RLS da empresa ativa.

## Permissões

| Permissão | Finalidade |
|---|---|
| `whatsapp-config.visualizar` | Ler configuração da empresa |
| `whatsapp-config.editar` | Alterar configuração e gerenciar instâncias |
| `whatsapp-conversas.visualizar` | Ver a própria sessão e conversas |
| `whatsapp-conversas.cadastrar` | Enviar, reagir e agendar mensagens |
| `whatsapp-conversas.editar` | Parear, desconectar, vincular e sincronizar |
| `whatsapp-equipe.visualizar` | Incluir sessões/conversas da equipe no escopo de leitura |

As ações comerciais dentro da conversa exigem as permissões dos respectivos
módulos, não apenas a permissão do WhatsApp.

## API para navegador

### Configuração e instâncias

| Método | Caminho | Permissão | Descrição |
|---|---|---|---|
| GET | `/whatsapp/config` | `whatsapp-config.visualizar` | Obtém ou cria a configuração singleton |
| PUT | `/whatsapp/config` | `whatsapp-config.editar` | Atualiza ativo, transporte, worker, DDD, retenção e dias de histórico |
| GET | `/whatsapp/sessao` | `whatsapp-conversas.visualizar` | Sessão do vendedor logado |
| POST | `/whatsapp/sessao/conectar` | `whatsapp-conversas.editar` | Inicia pareamento com aceite obrigatório |
| GET | `/whatsapp/sessao/pareamento` | `whatsapp-conversas.visualizar` | Estado e QR atual |
| DELETE | `/whatsapp/sessao` | `whatsapp-conversas.editar` | Desconecta a própria sessão |
| GET | `/whatsapp/sessoes` | `whatsapp-conversas.visualizar` | Lista sessões dentro do escopo de equipe |
| POST | `/whatsapp/config/sessoes/:id/reconectar` | `whatsapp-config.editar` | Reabre instância existente no worker |
| DELETE | `/whatsapp/config/sessoes/:id` | `whatsapp-config.editar` | Encerra e marca como desconectada, preservando histórico |
| DELETE | `/whatsapp/config/sessoes/:id/conversas` | `whatsapp-config.editar` | Apaga o histórico da instância: conversas, mensagens, reações, agendamentos, ações e as notificações que apontavam para elas. Os contatos ficam |
| DELETE | `/whatsapp/config/sessoes/:id/instancia` | `whatsapp-config.editar` | Apaga a linha da instância. Recusa com 400 se ela não estiver desconectada ou se ainda houver conversas |
| POST | `/whatsapp/config/sessoes/:id/historico` | `whatsapp-config.editar` | Importa o histórico do aparelho dentro de `historicoDias`. Exige instância conectada e o parâmetro acima de zero |

Corpo de conexão:

```json
{
  "aceite": true,
  "aceiteVersao": "2026-08-14"
}
```

Corpo de configuração, com todos os campos opcionais:

```json
{
  "ativo": true,
  "transporte": "zapo",
  "workerUrl": "http://rcgcba-whatsapp-worker:3100",
  "dddPadrao": "67",
  "retencaoDias": 365
}
```

### Conversas e mensagens

| Método | Caminho | Permissão | Descrição |
|---|---|---|---|
| GET | `/whatsapp/conversas` | `whatsapp-conversas.visualizar` | Lista paginada; aceita busca, arquivadas, sem vínculo e vendedor |
| POST | `/whatsapp/conversas` | `whatsapp-conversas.cadastrar` | Inicia conversa por cliente, JID ou telefone |
| GET | `/whatsapp/conversas/:id/mensagens` | `whatsapp-conversas.visualizar` | Histórico por cursor |
| GET | `/whatsapp/conversas/:id/eventos` | `whatsapp-conversas.visualizar` | Eventos comerciais internos, separados das mensagens enviadas ao cliente |
| POST | `/whatsapp/conversas/:id/mensagens` | `whatsapp-conversas.cadastrar` | Envia texto e, opcionalmente, responde outra mensagem |
| POST | `/whatsapp/conversas/:id/arquivos` | `whatsapp-conversas.cadastrar` | Envia multipart no campo `arquivo`, máximo 16 MiB |
| PUT | `/whatsapp/conversas/:id/vinculo` | `whatsapp-conversas.editar` | Vincula, desvincula ou ignora contato |
| POST | `/whatsapp/conversas/:id/mensagens/:mensagemId/reacao` | `whatsapp-conversas.cadastrar` | Adiciona/troca reação; emoji vazio remove |
| POST | `/whatsapp/conversas/:id/lida` | `whatsapp-conversas.visualizar` | Zera não lidas e envia recibo ao aparelho |

Exemplos:

```json
// Enviar texto
{ "texto": "Olá!", "respondeuA": null }

// Vincular contato
{ "clienteId": "UUID_DO_CLIENTE", "ignorar": false }

// Iniciar conversa
{ "clienteId": "UUID_DO_CLIENTE" }

// Reagir ou remover reação
{ "emoji": "👍" }
```

No envio de arquivo, os campos adicionais são `legenda` e `ptt`; `ptt=true`
faz o áudio aparecer como mensagem de voz.

### Agenda do aparelho

| Método | Caminho | Permissão | Descrição |
|---|---|---|---|
| GET | `/whatsapp/agenda/contatos?busca=` | `whatsapp-conversas.visualizar` | Agenda transitória cruzada com clientes |
| GET | `/whatsapp/agenda/conversas` | `whatsapp-conversas.visualizar` | Conversas existentes no aparelho |
| POST | `/whatsapp/agenda/sincronizar` | `whatsapp-conversas.editar` | Refaz agenda e conversas a partir do aparelho |

### Ações comerciais

| Método | Caminho | Permissão |
|---|---|---|
| POST | `/whatsapp/conversas/:id/acoes/titulos` | `titulos-receber.visualizar` |
| GET | `/whatsapp/conversas/:id/acoes/titulos` | `titulos-receber.visualizar` |
| POST | `/whatsapp/conversas/:id/acoes/notas` | `notas-saida.visualizar` |
| GET | `/whatsapp/conversas/:id/acoes/notas` | `notas-saida.visualizar` |
| POST | `/whatsapp/conversas/:id/acoes/danfe` | `notas-saida.visualizar` |
| POST | `/whatsapp/conversas/:id/acoes/boleto` | `titulos-receber.visualizar` |
| POST | `/whatsapp/conversas/:id/acoes/agendar` | `atividades.cadastrar` |
| GET | `/whatsapp/conversas/:id/acoes/orcamentos` | `orcamentos.visualizar` |
| POST | `/whatsapp/conversas/:id/acoes/orcamento` | `orcamentos.visualizar` |
| POST | `/whatsapp/conversas/:id/acoes/orcamento/novo` | `orcamentos.cadastrar` |

### Agendamentos

| Método | Caminho | Permissão | Descrição |
|---|---|---|---|
| POST | `/whatsapp/conversas/:id/agendamentos` | `whatsapp-conversas.cadastrar` | Agenda mensagem de texto |
| GET | `/whatsapp/conversas/:id/agendamentos` | `whatsapp-conversas.visualizar` | Lista agendamentos da conversa |
| DELETE | `/whatsapp/conversas/:id/agendamentos/:agendamentoId` | `whatsapp-conversas.cadastrar` | Cancela apenas se ainda estiver pendente |

## API interna: worker para API

Base: `/api/v1/whatsapp/interno`. Exige
`Authorization: Bearer <WHATSAPP_WORKER_TOKEN>` e fica excluída do Swagger.

| Método | Caminho | Origem do evento |
|---|---|---|
| GET | `/sessoes-ativas` | Boot do worker; sessões a restaurar |
| POST | `/sessao-estado` | Mudança espontânea de conexão |
| POST | `/mensagem` | Mensagem ou eco enviado pelo celular |
| POST | `/mensagem-arquivo` | Bytes Base64 após autorização da API |
| POST | `/reacao` | Reação recebida ou removida |
| POST | `/recibo` | Entrega ou leitura de mensagens de saída |

## API privada do worker

Base configurada em `workerUrl`, normalmente porta 3100. Todas as rotas exigem
o mesmo Bearer token. O serviço não implementa CORS nem deve ser exposto ao
navegador.

| Método | Caminho | Corpo/resultado |
|---|---|---|
| POST | `/sessoes` | `{ sessaoId, empresaId, transporte, arquivarMensagens? }`; inicia ou restaura |
| GET | `/sessoes/:id/pareamento` | Estado, QR, número e erro |
| DELETE | `/sessoes/:id` | Desconecta e limpa o cliente em memória |
| POST | `/sessoes/:id/mensagens` | `{ jid, texto, respondeuA? }` |
| POST | `/sessoes/:id/arquivos` | `{ jid, tipo, nome, mime, conteudoBase64, legenda?, ptt? }` |
| POST | `/sessoes/:id/lida` | `{ jid, externoId }` |
| POST | `/sessoes/:id/reacoes` | `{ jid, alvoExternoId, alvoNosso, emoji }` |
| GET | `/sessoes/:id/contatos?busca=` | Contatos do store |
| GET | `/sessoes/:id/conversas?limite=` | Conversas do store |
| POST | `/sessoes/:id/agenda/sincronizar` | Solicita sincronização completa |
| POST | `/sessoes/:id/historico/importar` | `{ dias }`; devolve `{ encontradas, conversas }` e segue entregando em segundo plano |
| GET | `/saude` | `{ "ok": true }` |

Erros do worker usam JSON `{ "erro": "..." }`. A API converte indisponibilidade,
timeout ou resposta não 2xx em `502 Bad Gateway` para o navegador.
