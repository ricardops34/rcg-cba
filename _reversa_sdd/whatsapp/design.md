# whatsapp — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `whatsapp`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `Grupo` | `Rotas` | `Permissão` | 200 OK |
| `Configuração` | ``GET/PUT config`, templates, `testar-gateway`` | ``whatsapp-config.visualizar/editar`` | 200 OK |
| `Status` | ``GET integracao`, `GET meu-numero`` | `**sem permissão** (só JWT), de propósito` | 200 OK |
| `Recados internos` | ``GET/POST/PUT/DELETE recados…`, `PATCH recados/:id/lido`` | ``whatsapp-recados.*`` | 200 OK |
| `Minha sessão` | ``GET sessao`, `POST sessao/conectar`, `GET sessao/pareamento`, `DELETE sessao`, foto, `GET sessoes`` | ``whatsapp-conversas.*`` | 200 OK |
| `Número institucional` | ``config/sessao-empresa…`` | ``whatsapp-config.*`` | 200 OK |
| `Institucional de outra empresa` | ``config/empresas/:empresaId/…`` | ``whatsapp-config.*` + `PlatformAdminGuard`` | 200 OK |
| `Administração de instâncias` | ``config/sessoes/:id/{reconectar, conversas, instancia, instancia-e-historico, historico}`` | ``whatsapp-config.editar/excluir`` | 200 OK |
| `Conversas` | ``GET conversas`, `GET conversas/:id(/mensagens,/eventos)`, `POST conversas`, mensagens, interativa, arquivos, template, editar, apagar, reação, presença, vínculo, foto, `lida`, anotações, agendamentos, `assumir`, `encerrar`, `sugerir-resposta`` | ``whatsapp-conversas.*`` | 200 OK |
| `Ações` | ``conversas/:id/acoes/{titulos, notas, danfe, boleto, agendar, orcamentos, orcamento, orcamento/novo, fichas, ficha}`` | `a rotina dona do dado (`titulos-receber`, `notas-saida`, `atividades`, `orcamentos`, `produtos`)` | 200 OK |
| `Agenda do aparelho` | ``agenda/{contatos, conversas, sincronizar, importar}`` | ``whatsapp-conversas.*`` | 200 OK |
| `Gerencial` | ``gerencial/{filtros, conversas, conversas/:id/mensagens, conversas/:id/eventos}`` | ``whatsapp-historico.visualizar`` | 200 OK |
| `Indicadores` | ``atendimento/nao-lidas`, `atendimento/indicadores`` | ``whatsapp-conversas.visualizar`` | 200 OK |
| `Respostas rápidas` | `CRUD `respostas-rapidas`` | ``whatsapp-conversas.*`` | 200 OK |
| `Webhook` | ``POST whatsapp/evolution/webhook/:empresaId/:sessaoId`` | `sem JWT; segredo da instância` | 200 OK |

## Fluxo Principal

### 1. 3.1 Webhook da Evolution GO

- Empresa e sessão vêm na URL, porque com RLS a API não acharia a sessão sem o tenant.
- **O segredo é por instância**, guardado cifrado (`WHATSAPP_CRYPTO_KEY`, separada da
  chave do agente). É aceito em `?secret=`, no header `apikey`, como `Bearer` ou como
  senha de `Basic`. A comparação é `timingSafeEqual`. Sessão inexistente responde 401,
  não 404.
- Tipo do evento por substring, sem diferenciar maiúsculas, tolerando as variações de
  nome entre versões: `recibo`, `apelido`, `conexao` (inclui `connected` e `loggedout`,
  que eram perdidos), `historico` e `mensagem`. Evento desconhecido responde 200 para
  não haver reentrega infinita.
- Lote processado mensagem a mensagem; a falha de uma vai para o log e não derruba as
  outras.
- A mídia só é baixada **depois** de a API confirmar a gravação.

### 2. 3.2 `receber` — gravação da mensagem

1. Descarta grupo (`@g.us`), lista de transmissão, status e canal (`@newsletter`).
2. Telefone: o resolvido pelo evento; o do `jid` só quando não é `@lid` (opaco).
3. Contato: procura primeiro pelo `telefoneNormalizado` (evita duas conversas para
   `@lid` e `@s.whatsapp.net`); senão faz upsert por `(empresaId, jid)`. **Na criação**,
   tenta `casarCliente` (§3.3). O apelido só preenche nome vazio; o nome da agenda do
   celular pode corrigir.
4. Conversa: upsert por `(empresaId, sessaoId, contatoId)`; a nova no institucional nasce
   `bot`, a do aparelho nasce `humano`. A mensagem de saída do celular não conta como não
   lida; histórico também não. O histórico só adianta `ultimaMensagemEm` se for mais novo.
5. Idempotência: `(empresaId, conversaId, externoId)` único; a mensagem gravada antes
   como `outro` é corrigida se agora o tipo for reconhecido.
6. Mensagem nova grava `registrarAtendimentoWhatsapp`: uma atividade concluída por
   cliente por dia, só com cliente e vendedor.
7. Institucional `encerrada` que recebe mensagem nova do cliente **reabre em `bot`** e
   zera atendente, assunto e saudação.
8. Devolve `triagem: true` quando é institucional em `bot`, mensagem nova, do cliente e
   não histórico. Mensagem recebida não toca o sino (decisão de 08/10/2026); conta no
   ícone pelo `naoLidas`.

### 3. 3.3 Vínculo automático com cliente — `casarCliente`

Na criação do contato: compara os **últimos 8 dígitos** do telefone com `telefone`,
`telefone2` e `celular` dos clientes. No aparelho do vendedor, só dentro da carteira
dele; **no institucional, na base inteira** (`vendedorId` nulo). Exatamente um candidato
→ grava `clienteId` no contato (sem `vinculadoPor`); dois ou mais → não vincula.

### 4. 3.4 Escopo de leitura e escrita

- **Atendimento** (`filtroSessao` / `conversaNoEscopo`): só a sessão do usuário logado:
  `tipo='vendedor'`, vendedor do usuário e `sessao.usuarioId = usuário`
  (`sessaoDoUsuarioWhere`, decisão de 06/10/2026). Sem cadastro de vendedor, não vê nada.
  Fora do escopo dá 404. Vale para lista, mensagens, envio, ações, agendamento, não lidas.
- **Gerencial** (`escopoHistoricoWhatsapp`): admin ou perfil `carteiraCompleta` vê tudo;
  os demais veem a própria árvore (CTE recursiva por `superiorId`, inclusive vendedores
  inativos). Só leitura.
- **Indicadores do institucional** (`filtroSessaoEquipe`): o escopo antigo, de equipe.
  A conversa em `bot` não é de ninguém; a direcionada é de quem recebeu; a fila sem dono
  aparece para todos que atendem.
- `escopoLeituraWhatsapp` (função solta): usado fora do módulo (Posição de Cliente);
  exige `whatsapp-equipe.visualizar` para ver o time.

### 5. 3.5 Triagem do institucional

`WhatsappTriagemService.processar` nunca lança: falha vira log e `paraFila` (a conversa
fica `aguardando`, sem dono, e quem está trabalhando é avisado).

1. Contexto: só sessão `empresa` com a conversa em `bot`. Carrega a ficha da empresa (do
   **cadastro**), as informações e a saudação da config, os vendedores presentes e as 12
   últimas mensagens.
2. IA desligada (`atendimentoIaAtivo=false`) → fila.
3. **Funcionário?** `WhatsappFuncionarioService.identificar`: os últimos 8 dígitos
   filtram, a **chave com DDD** decide, o vínculo usuário×empresa precisa estar ativo e a
   resposta precisa ser única. Pendente → `parear` (código de 6 dígitos, válido 10 min,
   5 tentativas, mostrado só em `GET meu-numero`); confirmado (30 dias) →
   `atenderFuncionario`, com catálogo próprio e só leitura. Falha **não** vai para a
   fila.
4. Saudação literal (sem passar pelo modelo) na primeira vez.
5. Agente da empresa (`AgenteConfigService.paraUso`); sem agente → fila.
6. Catálogo `ferramentasDaTriagem(temCliente)` **fail-closed**: sem cliente vinculado, as
   ferramentas de dado nem são descritas ao modelo, e o executor confere de novo
   (`clienteId` nulo → erro).
7. Até `MAX_VOLTAS` = 4 rodadas de ferramenta; ao direcionar, o modelo para de falar.
8. Ferramentas que valem citar:
   - `identificar_cliente`: por CNPJ/CPF ou nome (≥ 3 letras); devolve só `encontrado` e
     um `vendedorId` opaco;
   - `direcionar_para_vendedor` / `direcionar_para_administrativo`: o `vendedorId` do
     modelo é conferido (existe, da empresa, ativo); senão, fila sem dono. Grava
     `aguardando`, `atendenteVendedorId`, `assunto` (até 200) e `direcionadaEm`, e avisa:
     o destinatário escolhido ou, sem dono, quem está em expediente com sessão aberta;
   - `avisar_equipe`: o destino é um **papel**, nunca um número; até 3 por conversa;
     assinado como automático;
   - `registrar_lead`: a única que grava (ver módulo `leads`);
   - `sobre_produto`: dossiê **sem preço por construção** (`ProdutoParaAgenteService`);
   - documentos (boleto, DANFE, pedido): três travas em série — o catálogo, a resolução
     número → id recortada pelo cliente da conversa e o gerador recortando de novo por
     `QuemPede`.

### 6. 3.6 Ciclo do institucional

`bot` → `aguardando` (direcionada) → `humano` (`assumir`, só sessão `empresa`, não em
`bot`, sem tomar de quem está atendendo) → `encerrada` (`encerrar` ou inatividade).
Mensagem nova depois de `encerrada` volta a `bot`. `WhatsappInatividadeService` roda a
cada 5 min e encerra conversas `bot` paradas há `atendimentoInatividadeMin` (padrão 30;
0 desliga), até um lote por empresa.

### 7. 3.7 Rotinas agendadas

- **Mensagem agendada** (`WhatsappAgendamentoService`, a cada 60 s): autorizada na
  criação; no envio não há usuário. A trava é `updateMany pendente → enviando`. Falha vira
  `erro` visível; nada some em silêncio. Sessão desconectada não envia.
- **Recado interno** (`WhatsappRecadoService`): para a equipe, pelo número institucional;
  nunca alcança cliente.
- As duas, mais a inatividade, varrem empresa a empresa (`empresas` não tem RLS) e
  guardam timers em memória.

### 8. 3.8 Exclusão de histórico

`apagar-conversas.ts`: ponto único, atrás de `whatsapp-config.excluir`. Apaga em cascata
mensagens, reações, agendamentos e ações; apaga a notificação do sino
(`referenciaId`); o lead **fica** sem `conversaId`; as atividades ficam. A mídia em
disco/MinIO é apagada **depois** do commit.

### 9. 3.9 Achados

- 🔴 **A triagem por IA não roda desde 01/10/2026.** O commit `d7d3205` ("evogo")
  removeu `whatsapp-interno.controller.ts`, que chamava `triagem.processar()` depois de
  `receber`. O `WhatsappEvolutionController` só usa `arquivoNecessario`, e nada no código
  chama `WhatsappTriagemService.processar` (o service continua registrado no módulo).
  Efeito no número institucional: a mensagem é gravada e fica em `bot`, sem saudação,
  sem resposta, sem direcionamento, sem lead e sem aviso a ninguém, até a varredura de
  inatividade encerrá-la (30 min). O atendimento a funcionário (pareamento e consultas)
  e a captação de leads param junto. Os specs (`seguranca.spec.ts` etc.) testam o
  service isolado e continuam passando.
- 🔴 **Vínculo automático com cliente pelos 8 últimos dígitos, na base inteira.** A
  documentação (`docs/ferramentas/whatsapp-cliente.md`) diz que o vínculo número ↔
  cliente "é feito por um vendedor, na tela, e é ele que autoriza tudo o que vem depois —
  inclusive mandar boleto e nota fiscal para aquele número". O código vincula
  **sozinho**, na criação do contato, quando os 8 últimos dígitos casam com exatamente um
  cliente. No institucional a busca é na base inteira, sem DDD. Um número de outro DDD
  com o mesmo final, um número de celular reciclado pela operadora ou o telefone do
  contador cadastrado no cliente ganham as ferramentas de cliente: títulos, 2ª via de
  boleto, DANFE, pedidos. A identificação de funcionário, no mesmo módulo, exige a chave
  **com DDD** justamente por isso. O vínculo automático não grava `vinculadoPor`, então
  dá para distingui-lo do manual. Requer decisão: restringir ao vínculo manual nas
  ferramentas de documento, ou exigir DDD.
- 🔴 **A fila do institucional não tem caminho de atendimento** (conhecido: o
  institucional "ficou fora" da revisão de 06/10/2026). `conversaNoEscopo` só aceita
  sessão `tipo='vendedor'` do próprio usuário, e `assumirAtendimento` exige
  `sessao.tipo === 'empresa'` depois disso, então nunca passa (404). A conversa
  institucional direcionada não aparece na lista, não abre, não é assumida nem
  encerrada pela tela. No Gerencial só o admin ou `carteiraCompleta` a vê (a sessão não
  tem `vendedorId`). Os avisos de "cliente aguardando" levam a uma conversa que o
  destinatário não abre.
- 🟡 **`identificar_cliente` ainda é um oráculo.** O nome do cliente e o do vendedor não
  voltam ao modelo, mas `encontrado: true/false` por CNPJ confirma quem é cliente. A busca
  por nome usa `contains` com 3 letras e `findFirst`, então "mercado" acha um cliente
  qualquer e direciona a conversa ao vendedor dele.
- 🟡 **Contato único por empresa, vínculo decidido uma vez.** `WhatsappContato` é único
  por `(empresaId, jid)` e compartilhado entre as sessões. `casarCliente` só roda na
  **criação**, com o recorte da sessão que viu o número primeiro: se foi um vendedor sem o
  cliente na carteira, o institucional nunca o reconhece depois. Além disso, a busca do
  contato existente é pela **igualdade** do telefone normalizado; com e sem 9º dígito ou
  DDI viram dois contatos.
- 🟡 **Segredo do webhook aceito na query string** (`?secret=`): ele acaba nos logs de
  acesso do proxy e do gateway.
- 🟡 **Quatro rodadas sem texto final.** Se o modelo usa as 4 voltas chamando ferramentas
  sem direcionar nem responder, nada é enviado ao cliente e a conversa fica em `bot` até a
  inatividade encerrá-la.
- 🟡 **Triagem em paralelo** (quando voltar a ser chamada): nada serializa por conversa;
  duas mensagens seguidas disparariam duas execuções, com respostas duplicadas ou
  direcionamentos concorrentes.
- 🟡 **Comentários desatualizados.** O cabeçalho do webhook diz que "conversa de contato
  sem cliente vinculado não é gravada", mas desde 05/10 tudo é gravado. O de
  `WhatsappSessaoService` e o de `WhatsappAgendaService` ainda falam do supervisor lendo
  a equipe pelo Atendimento, o que acabou em 06/10.
- 🟡 Os timers de retomada, agendamento, recado e inatividade ficam em memória e varrem
  todas as empresas em série. Com mais de uma instância da API rodando, a inatividade e
  o recado dependem das próprias travas para não duplicar.
- 🟡 `ultimaMensagemEm` usa `new Date()` no update e `quando` (a data do WhatsApp) na
  criação.

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`TitulosReceberModule`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`NotasSaidaModule`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`AtividadesModule`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`OrcamentosModule`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`ProdutosModule (ProdutoParaAgenteService)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`ProvedorIaModule / AgenteConfigService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/escopo/escopo-vendedores, quem-pede`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/atividades/registrar-atendimento-whatsapp`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`armazenamento (disco/MinIO)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`notificacoes/registrar-notificacao`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`Evolution GO 0.7.2 (externo)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/whatsapp` | 🟢 |

## Estado Interno e Entidades

- **`WhatsappSessao`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`WhatsappSessaoPeriodo`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`WhatsappContato`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`WhatsappConversa`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`WhatsappMensagem`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`WhatsappReacao`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`WhatsappMensagemAgendada`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`WhatsappRecadoInterno`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`WhatsappRecadoDestinatario`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`WhatsappAcaoRegistro`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`WhatsappVinculoFuncionario`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`WhatsappConfig`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`WhatsappTemplate`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`WhatsappRespostaRapida`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.

