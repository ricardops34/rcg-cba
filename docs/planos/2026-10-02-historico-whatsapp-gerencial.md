# Plano: histórico permanente do WhatsApp no Gerencial

> **Status (02/10/2026): concluído e verificado.**

## Pedido (usuário, 02/10/2026)

O histórico das mensagens não pode ser apagado, nem sumir com a desconexão do
número ou com a remoção do vínculo usuário × vendedor. Manter o histórico por
**número / vendedor / conversa**, de todo o período de uso da plataforma, para
consulta e acompanhamento, numa **rotina específica do módulo Gerencial**,
respeitando a hierarquia.

## Diagnóstico (02/10/2026)

O que **apaga** de verdade:

1. **Administração > WhatsApp > "Limpar conversas"**
   (`WhatsappSessaoService.limparConversas`) — `deleteMany` nas conversas, com
   cascade em mensagens, reações, agendamentos e ações. Sem volta.
2. **"Excluir instância"** exige limpar antes (o banco tem `ON DELETE
   RESTRICT` da conversa para a sessão) — então apagar a instância passa,
   obrigatoriamente, pelo item 1.

O que **some da tela** sem ser apagado:

3. **Desconectar** não apaga linhas, mas grava `numero = null` na sessão. A
   sessão é uma por vendedor (`@@unique([empresaId, vendedorId])`): ao
   reconectar com **outro número**, a mesma sessão é reaproveitada e as
   conversas dos dois números se misturam, sem registro de qual número foi
   usado em cada período.
4. **Tela de Atendimento** mostra só "Seu WhatsApp não está conectado" quando
   a sessão não está conectada — o vendedor perde o acesso ao próprio
   histórico enquanto estiver desconectado.
5. **Hierarquia**: `resolverEscopoDoUsuario` monta o time só com vendedores
   `deletedAt IS NULL`. Vendedor inativado sai do escopo do supervisor, e o
   histórico dele deixa de aparecer para quem o supervisionava.
6. **Vínculo usuário × vendedor**: o histórico é ligado ao **vendedor**, não ao
   usuário, então remover o vínculo não apaga nada — só tira o acesso do
   usuário (correto). Para o supervisor, continua visível enquanto o vendedor
   estiver ativo (ver item 5).

## Proposta

- **Fim da exclusão**: remover "Limpar conversas" (API e tela). "Excluir
  instância" com histórico passa a desligar e arquivar a sessão, sem apagar.
- **Períodos de conexão**: tabela nova `whatsapp_sessao_periodos`
  (sessão, vendedor, número, conectado em, desconectado em). Grava a cada
  conexão/desconexão; responde "qual número esse vendedor usou, e quando".
- **Número em cada mensagem**: coluna com o número da sessão no momento do
  envio/recebimento, para separar as conversas de números diferentes do mesmo
  vendedor. Mensagens antigas recebem o número atual da sessão, quando houver
  (melhor esforço — o passado não registrou isso).
- **Rotina Gerencial > Histórico WhatsApp** (somente leitura): filtros por
  vendedor, número, cliente/contato e período; lista de conversas e leitura
  das mensagens. Sem envio.
- **Hierarquia**: mesma regra do sistema (Administrador/carteira completa veem
  tudo; supervisor vê o time), mas **incluindo vendedores inativos** abaixo
  dele — o histórico de quem saiu continua com quem o supervisionava.
- Permissão nova da rotina, por migration (ver memória: permissão que só vive
  no seed some).

## Decisões (usuário, 02/10/2026)

1. **"Limpar conversas" sai de vez.** Ninguém apaga histórico. "Excluir
   instância" com conversas não apaga a linha da sessão (o histórico depende
   dela); o caminho é desconectar.
2. **Vendedor desconectado vê o próprio histórico, só leitura**, no
   Atendimento. A rotina Gerencial é para gestores.
3. **Supervisor vê o histórico de vendedores inativados do time**, pelo último
   superior cadastrado.

## Implementação concluída (02/10/2026)

- **Banco & RLS**: Migration `20261002120000_whatsapp_historico_permanente` aplicada:
  - Tabela `whatsapp_sessao_periodos` com RLS habilitado e policy multi-tenant (`tenant_isolation_whatsapp_sessao_periodos`).
  - Coluna `numeroSessao` em `whatsapp_mensagens` com backfill do número da sessão.
  - Períodos iniciais populados.
  - Menu `seed-menu-whatsapp-historico` e rotina `whatsapp-historico` criados e liberados para perfis de gestão (Administrador, Diretoria, Gerente, Supervisor).
- **Permanência do histórico**:
  - `limparConversas` desativado na API (`BadRequestException`) e botão removido de `admin/whatsapp`.
  - `excluirInstancia` com conversas arquiva a sessão e limpa credenciais externas, preservando o histórico permanentemente.
  - Rastreamento automático de períodos em conexões e desconexões (`whatsapp_sessao_periodos`).
  - Gravação de `numeroSessao` em mensagens enviadas, recebidas e com arquivos/templates.
- **Hierarquia com inativos**:
  - `escopoHistoricoWhatsapp` implementado em `escopo-whatsapp.ts` com CTE recursiva que inclui vendedores inativados (`deletedAt IS NOT NULL`) do time do supervisor.
- **Endpoints de auditoria**:
  - `GET /whatsapp/gerencial/filtros` (vendedores do escopo incluindo inativos, e números registrados)
  - `GET /whatsapp/gerencial/conversas` (lista paginada com busca e filtros)
  - `GET /whatsapp/gerencial/conversas/:id/mensagens` (rolo cronológico somente leitura)
- **Atendimento para vendedor desconectado**:
  - Permite visualizar conversas anteriores e mensagens em modo somente leitura com faixa de alerta ("WhatsApp desconectado") e botão de reconexão.
- **Nova rotina no Gerencial (`/gerencial/whatsapp`)**:
  - Interface master-detail seguindo padrões do monorepo (`CrudHeader`, `FiltersPopover`: Vendedor com tag de inativo, Número de WhatsApp, Intervalo de datas).
  - Rolo de mensagens estilo WhatsApp em modo somente leitura com suporte a mídias, áudios, anexos, status de entrega e reações.

## Exceção: exclusão pelo administrador (usuário, 05/10/2026)

O histórico continua permanente para todos, **menos** para quem tem a permissão
`whatsapp-historico.excluir` — concedida pela migration
`20261005200000_perm_whatsapp_historico_excluir` só aos perfis `sistemaBase`
(Administrador Empresa e Administrador da Plataforma). Separada de
`whatsapp-config.editar` de propósito: quem configura o WhatsApp não apaga
histórico. O Diretor não recebe (`ACOES_FORA_DO_DIRETOR` no catálogo, aplicado
pelo seed e pelo `sincronizar-catalogo`).

Três exclusões, todas sem volta e todas pelo helper único `apagarConversas`
(sino apagado, lead preservado sem o ponteiro, atividades do cliente ficam):

| O quê | Onde | Rota |
|---|---|---|
| Uma conversa | Gerencial → Histórico do WhatsApp, "Excluir conversa" | `DELETE /whatsapp/gerencial/conversas/:id` (mesmo escopo da leitura) |
| Histórico de uma instância | Administração → WhatsApp → Instâncias, "Limpar conversas" | `DELETE /whatsapp/config/sessoes/:id/conversas` |
| Instância com histórico | idem, "Excluir instância e histórico" (só desconectada) | `DELETE /whatsapp/config/sessoes/:id/instancia-e-historico` |

Sem auditoria em tabela: cada exclusão deixa uma linha `warn` no log da API com
quem apagou e quanto. Quem já estava logado precisa sair e entrar de novo para
o menu enxergar a permissão nova.
