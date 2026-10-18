# agente — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `agente`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `Grupo` | `Rotas` | `Permissão` | 200 OK |
| `Uso` | ``GET apresentacao`, `GET resumo-diario`, `POST resumo-diario/:data/exibido`, `GET ferramentas-disponiveis`` | ``agente.visualizar`` | 200 OK |
| `Conversa` | ``GET conversas`, `GET conversas/:id`, `POST conversas/mensagens`, `POST conversas/mensagens/stream` (SSE), `POST anexos`, `POST conversas/:id/confirmar/:pendenciaId`, `POST conversas/:id/cancelar/:pendenciaId`` | ``agente.visualizar`` | 200 OK |
| `Configuração` | ``GET/PUT config`, `POST config/testar`, `config/oauth/{iniciar, concluir, importar, desconectar}`` | ``agente-config.visualizar/editar`` | 200 OK |
| `Governança` | ``GET ferramentas`, `PUT ferramentas/:chave`, `GET/POST ferramentas/termos`, `POST ferramentas/restaurar-todos`, `POST ferramentas/:chave/restaurar`, `GET ferramentas/auditoria`` | ``agente-config.*`` | 200 OK |
| `Prompt` | ``POST prompt/previa` (sem custo), `POST prompt/testar` (consome tokens)` | ``agente-config.visualizar/editar`` | 200 OK |

## Fluxo Principal

### 1. 3.1 O turno — `AgenteChatService.enviar`

1. `config.paraUso` (credencial em claro, só em memória); confere o anexo (`anexos.meu`)
   **antes** de criar a conversa.
2. A conversa é sempre do usuário (`minhaConversa`: `usuarioId`; nem o admin lê a dos
   outros). Na primeira mensagem, título = 60 primeiros caracteres.
3. Grava a mensagem do usuário (**sem máscara**: texto livre vai ao provedor como foi
   digitado).
4. `governanca.filtroPara` (config da empresa + perfil + WhatsApp vinculado) **antes**
   do contexto, para a lista no prompt bater com o catálogo enviado.
5. Na conversa nova, `aberturaDoDia` (`AgenteMeuDiaService`: agenda, meta, sino e
   aniversário, cada bloco só com a permissão de origem).
6. `montarContexto`: system prompt da empresa + bloco do servidor (nome e e-mail do
   usuário, data de hoje em `America/Campo_Grande`, ferramentas liberadas, regra das
   referências `«CLI:…»`, "não afirme que gravou", "não invente número") + instruções
   por ferramenta + `REGRAS_FIXAS_AGENTE_INTERNO` + as últimas `historicoMensagens`.
7. Até `maxIteracoesFerramentas` voltas (padrão 5). Em cada chamada:
   - ferramenta inexistente → erro ao modelo;
   - **segunda trava**: `garantirPermissao` **e** estar entre as `disponiveisPara` (pega
     a ferramenta desligada que o modelo "lembra" do histórico);
   - `referencias.resolverIds`: troca `«CLI:código»` pelo id real nos argumentos;
   - `usaAnexo`: o `anexoId` é **injetado pelo servidor**, sobrescrevendo o que o modelo
     tenha inventado;
   - `escrita: true` → **não executa**: grava `AgenteMensagem` com `pendente=true`,
     argumentos e resumo, e diz ao modelo que nada foi gravado;
   - leitura → `executarLeitura`; erro de negócio volta como resultado; grava a
     auditoria com o **resumo mascarado**, não o payload cru (`posicao_cliente` tinha
     ~400 KB).
8. Sem texto final nas voltas → mensagem fixa "não consegui concluir…".
9. A resposta é gravada **mascarada** e devolvida remontada (`remontarTexto`) com até 2
   destinos (botões de tela, montados pelo servidor a partir do resultado real).

### 2. 3.2 Fronteira de dados — `anonimizar-agente.ts`

Mascara **por nome de chave conhecida** (não por heurística de texto): nome de cliente,
produto e vendedor viram `«CLI:código»`, `«PRD:código»`, `«VND:código»` (determinístico,
pelo código ERP, sem mapa por conversa); CNPJ/CPF, e-mail, telefone, endereço e contato
não vão. Valores, quantidades e datas **vão** (decisão de 25/08/2026). A ordem é
mascarar → podar listas (`limiteItens`, padrão 8; profundidade 4) → `garantirMascarado`
(falha a resposta se um campo de identificação escapou) → cortar no teto (padrão 4.000
caracteres). Exceção única: `identificacaoPublica` (só `consultar_cnpj`), cujo bloco
`receitaFederal` passa inteiro; o resto do payload continua sob a trava, e
`agente-tools.permissao.spec.ts` reprova se outra ferramenta declarar a exceção.

### 3. 3.3 Confirmação — `confirmar` / `cancelar`

`confirmar`: a conversa é do usuário, a pendência existe nela e ainda está `pendente`, a
ferramenta existe e `garantirPermissao` continua valendo. Executa
`ferramenta.executar(argumentos gravados)` e marca `pendente=false`, `confirmadaEm`,
`confirmadaPor` e `resultado`. `cancelar` só fecha a pendência e anota "(cancelada)".

### 4. 3.4 Catálogo e alcance

- **31 ferramentas** no código: 22 de leitura e 9 de escrita (4 exigem WhatsApp
  pareado, 2 exigem anexo). A doc lista 30; `consultar_feriados`
  (`atividades.visualizar`, leitura) não está na tabela.
- `disponiveisPara` = RBAC (`isAdmin` ou permissão) ∧ config da empresa (desligada vale
  até para o admin; restrição por perfil não vale para o admin; sem config carregada, o
  catálogo é puro) ∧ `exigeWhatsapp` (**fail-closed**) ∧ `usaAnexo` (só com arquivo no
  turno).
- `filtroCarteira`: só o vendedor "puro" (`tipo='vendedor'`) ganha `vendedorId` explícito;
  supervisor, gerente, diretor, admin e quem não tem cadastro ficam no escopo do service.
  É defesa em profundidade, porque o service já aplica `resolverEscopoVendedores`.
  `garantirClienteNoAlcance` e `garantirOportunidadeNoAlcance` barram o vendedor puro em
  id alheio (403).
- WhatsApp pelo agente: cada um lê **só a própria conexão**, inclusive supervisor
  (`mensagensDaPropriaConexao`, `historicoDoClienteNaPropriaConexao`).

### 5. 3.5 Governança — `AgenteFerramentasService`

Uma linha por (empresa, ferramenta): `ativa`, `nome`, `descricao`, `instrucoes`,
`versaoPrompt`, perfis. **Só restringe, nunca amplia.** Editar texto exige aceite dos
termos (`termosPromptAceitosEm/Por`); toda mudança grava `AgenteFerramentaAuditoria`
(campo, valor anterior e novo, autor). Versões (`agente-prompt-versoes.ts`): a v1 é o
texto do catálogo; `versaoPrompt` nulo acompanha a mais recente, preenchido trava;
reescrita da empresa vence a versão. Prévia do prompt (sem custo) e teste (consome
tokens).

### 6. 3.6 Provedores e credenciais

- `AgenteCredencial` por (empresa, provedor): trocar de provedor mantém as duas chaves e
  o modelo de cada um. A chave é cifrada (AES-256-GCM, chave mestra própria do agente,
  separada da do WhatsApp); a leitura só mostra os últimos 4 caracteres.
- **Codex por OAuth** (assinatura ChatGPT): usa o `CLIENT_ID` do CLI oficial e o
  `redirect_uri` fixo `localhost:1455`. O fluxo é em duas etapas: o administrador cola a
  URL de retorno, e o `code_verifier` do PKCE nunca sai da API. O refresh token é
  cifrado e a renovação é antecipada pela `tokenExpiraEm`.
- **Embeddings**: endpoint OpenAI-compatível opcional; sem configuração, `disponivel()`
  = false e a busca segue só lexical (decisão de 05/09/2026, infraestrutura desligada).

### 7. 3.7 Anexos

Material de passagem: o modelo lê uma vez (o PDF vira Markdown na ficha técnica, a foto
vai para o produto). Travas em código: `withTenant`, `usuarioId` (`meu`), `consumidoEm`
(não reusa o upload), `usaAnexo` (some do catálogo sem arquivo) e lista branca de MIME.
O anexo vale para a conversa até ser consumido (`doTurno`). A OpenAI-compatível não lê
PDF e recusa com mensagem clara.

### 8. 3.8 Achados

- 🟡 **Confirmação não é atômica.** `confirmar` lê `pendente=true`, executa e só depois
  grava `pendente=false`, sem trava. Dois cliques ou duas abas confirmando a mesma
  pendência ao mesmo tempo executam **duas vezes** (dois orçamentos, duas atividades,
  duas mensagens agendadas). Falta um `updateMany … where pendente=true` antes de
  executar.
- 🟡 **A confirmação revalida só a permissão.** A doc diz que "na confirmação tudo é
  revalidado", mas `confirmar` não reconfere a governança da empresa (ferramenta
  desligada ou restrita por perfil depois de preparada) nem `exigeWhatsapp`. Os services
  de destino ainda aplicam escopo, então o efeito é limitado à governança.
- 🟡 **Pendência sem validade.** Uma ação preparada semanas atrás continua confirmável
  com os argumentos da época (data de agendamento no passado, preço antigo).
- 🟡 **Nome e e-mail do usuário vão ao provedor**, no bloco de contexto. O nome do
  vendedor é mascarado nos resultados, mas o de quem está logado vai em claro.
- 🟡 **Hora do agendamento sem fuso.** O prompt informa a data em Campo Grande, mas
  `agendar_atividade` faz `new Date('AAAA-MM-DDTHH:mm')` no fuso do processo (ver
  `atividades` §3.7).
- 🟡 **Codex com o cliente OAuth do CLI oficial** num backend: depende de restrições de
  um cliente que não é nosso (redirect fixo, possível revogação) e do uso da assinatura
  ChatGPT fora do CLI. Isso é risco operacional e contratual a avaliar.
- 🟡 `todas()` recria as 31 ferramentas (com closures) a cada `buscar`/`disponiveisPara`,
  várias vezes por turno.
- 🟡 A doc lista 30 ferramentas; o código tem 31 (`consultar_feriados`).
- 🟡 `AgenteConversa` não tem índice por `(empresaId, usuarioId)`, a chave da listagem.

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`ConsultasService, ClientesService, ProdutosService, ProdutoRelacionadosService, OrcamentosService, TitulosReceberService, SugestaoCompraService, ObjetivosService, EnriquecimentoService, AtividadesService, OportunidadesService, VendedoresService, MeusAtendimentosService, ProdutoFichasService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`WhatsappConversasService, WhatsappAcoesService, WhatsappAgendamentoService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/cripto/segredo-cifrado`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`Anthropic / OpenAI-compativel / Codex (externos)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/agente` | 🟢 |

## Estado Interno e Entidades

- **`AgenteConfig`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`AgenteCredencial`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`AgenteConversa`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`AgenteMensagem`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`AgenteFerramenta`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`AgenteFerramentaPerfil`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`AgenteFerramentaAuditoria`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`AgenteAnexo`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`AgenteResumoExibido`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.

