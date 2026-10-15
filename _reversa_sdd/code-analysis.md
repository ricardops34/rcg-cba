# Análise de Código — plataforma-comercial (rcg)

> Gerado pelo Archaeologist. Nível de documentação: **detalhado**.
> Escala de confiança: 🟢 CONFIRMADO (extraído direto do código) · 🟡 INFERIDO (padrão, pode estar errado) · 🔴 LACUNA (requer validação humana)

---

## Módulo `auth`

**Caminho:** `apps/api/src/modules/auth/`
**Arquivos:** `auth.module.ts`, `auth.controller.ts`, `auth.service.ts`, `dto/auth.dto.ts`, `strategies/jwt.strategy.ts`, `auth.service.spec.ts`, `auth-whatsapp.spec.ts`, `first-access.spec.ts`

### 1. Responsabilidade 🟢

Autenticação (login/logout/refresh), sessão única por usuário, emissão e validação de
JWT, troca de empresa ativa, primeiro acesso, troca de senha e dados do próprio perfil
(`me`, avatar, tela inicial). É o módulo que resolve, a cada requisição, **quem** é o
usuário e **o que** ele pode fazer (lista de permissões embutida no token).

### 2. Fluxo de controle — funções principais 🟢

| Função | Entrada | Saída | Complexidade |
|---|---|---|---|
| `login(input, meta)` | email, senha, alias opcional da empresa | `{accessToken, refreshToken, expiresIn, mustChangePassword}` | Alta — 7 pontos de falha sequenciais |
| `refresh(input, meta)` | refreshToken | novo par de tokens | Alta — valida sessão, expiração, revogação, expediente |
| `logout(input)` | refreshToken | `{success}` | Baixa |
| `switchEmpresa(usuarioId, empresaId, meta, sessaoAtual?)` | ids | novo par de tokens | Média |
| `me(usuarioId, empresaAtivaId)` | ids | perfil completo + permissões + empresas vinculadas | Alta — cálculo de permissões e rota inicial |
| `completeFirstAccess(usuarioId, empresaId, input)` | dados pessoais | perfil atualizado (via `me`) | Média — propaga para `vendedor` |
| `changePassword(usuarioId, input)` | senha atual + nova | `{success}` | Média — valida política + histórico |
| `buildAccessToken(usuarioEmpresaId, empresaId, sessaoId)` (privado) | ids | `{accessToken, vinculo}` | Alta — monta a lista de permissões |
| `computeMustChangePassword(usuario)` (privado) | usuário | boolean | Baixa |
| `uploadOwnAvatar` / `selectDefaultAvatar` | arquivo / enum | `me()` atualizado | Baixa/Média |
| `updateOwnProfile` / `gravarDataNascimento` | campos do perfil | `me()` atualizado | Média — propaga data de nascimento para `vendedor` em todas empresas do grupo |
| `updateRotinaInicial` | rotinaId | `me()` atualizado | Média — valida permissão `.visualizar` |
| `telasIniciais` | ids | lista de rotinas elegíveis como tela inicial | Média |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Montagem do token de acesso (`buildAccessToken`) 🟢

- Perfis com `sistemaBase: true` (admin do sistema) recebem `permissoes: []` no payload —
  o `PermissionsGuard` libera por `isAdmin`, sem precisar embutir a lista. Isso reduz o
  JWT de ~16 KB para ~400 bytes (comentário explícito no código: evita erro HTTP 431).
- Para os demais perfis, a lista de permissões é filtrada por `rotinaNoAr()` (ver 3.2) e
  nunca inclui rotinas do módulo `seed-modulo-administracao` (constante
  `MODULO_ADMINISTRACAO_ID`), mesmo que o perfil tenha a permissão cadastrada.
- Formato de cada item: `"<codigo-da-rotina>.<acao>"`.
- `expiresIn` do access token lê `JWT_ACCESS_EXPIRES_IN` com fallback `'15m'` usando `||`
  (não `??`) de propósito — comentário no código explica que o Portainer sempre define a
  variável, mas pode chegar vazia (`""`), que `??` aceitaria e o `jsonwebtoken` rejeitaria.

#### 3.2 Visibilidade de rotina (`rotinaNoAr`) 🟢

Uma rotina só é incluída na lista de permissões se **todos** estes forem verdadeiros:
1. `rotina.ativo`
2. `menu.ativo`
3. `menu.modulo.ativo` (catálogo global, controlado pelo administrador da plataforma)
4. `menuPai.ativo` (se houver menu pai)
5. Módulo não desligado pela empresa (`empresaModulo.ativo = false`)
6. Menu não desligado pela empresa (`empresaMenu.ativo = false`)
7. Menu pai não desligado pela empresa

Comentário no código explicita a motivação: desligar um módulo na tela de Estrutura
precisa remover o acesso de verdade (a URL digitada à mão não passa pelo menu), então a
poda acontece na origem da lista de permissões — a API responde 403 e o item some do
menu lateral com uma regra só. Quem já está logado mantém o token antigo até expirar
(15 min).

#### 3.3 Login (`login`) — sequência de validações 🟢

Ordem exata das checagens (interrompe no primeiro erro):
1. Usuário existe e está ativo → senão `UnauthorizedException` (mensagem genérica
   "Credenciais inválidas" tanto para e-mail inexistente quanto usuário inativo —
   não revela qual).
2. `bloqueadoAte` no futuro → `HttpException` 423 LOCKED.
3. Senha correta (`bcrypt.compare`) → se não, incrementa `tentativasFalhas`; ao atingir
   `tentativasAntesBloqueio` (da política de senha vigente) zera o contador e seta
   `bloqueadoAte = agora + minutosBloqueio`.
4. Se veio `empresaAlias` na URL: busca a empresa **sem filtrar situação** e só então
   aplica `motivoBloqueio()` — comentário explica que filtrar direto devolveria "sem
   acesso" para uma empresa suspensa, mascarando a causa real.
5. Vínculo ativo do usuário com a empresa (`findVinculoAtivo`) — resolvido pelo alias ou
   pela primeira empresa ativa (`orderBy createdAt asc`).
6. Expediente de trabalho (`horarios.verificar`) — avaliado **depois** da senha (para não
   revelar nada a quem errou a senha) e **depois** de saber a empresa (feriado é por
   empresa).
7. Abre sessão (`acessos.abrirSessao`) e **encerra todas as outras sessões abertas do
   usuário** (`encerrarSessoes`, motivo `MOTIVO_NOVO_ACESSO`) — regra de **sessão única
   por usuário** (decisão datada de 30/09/2026 no comentário). Abas do mesmo navegador
   compartilham a mesma sessão.
8. Emite access + refresh token, recalcula `mustChangePassword`, zera tentativas falhas e
   registra `login_sucesso`.

Todo caminho de falha grava um evento em `acessos` (`login_falha`, `login_bloqueado`,
`login_fora_horario`) — rastro de auditoria completo mesmo em tentativas negadas.

#### 3.4 Refresh token (`refresh`) 🟢

- Hash do token recebido (SHA-256, `hashToken`) é a chave de busca — o token em texto
  claro nunca é persistido.
- Se a sessão vinculada ao refresh token foi encerrada por `MOTIVO_NOVO_ACESSO` ou
  `MOTIVO_DESCONECTADO`, lança `SessaoEncerradaException` com o motivo (em vez de um
  "token inválido" genérico) — permite à UI explicar por que caiu.
- Valida existência, não-revogação e não-expiração do token armazenado.
- **Revoga o token usado imediatamente**, mesmo antes de validar expediente — rotação
  estrita, sem reuso possível em nenhum cenário.
- Reavalia expediente de trabalho; se fora, chama `encerrarAcessoPorHorario` (revoga todos
  os refresh tokens abertos do usuário + encerra sessões) — comentário explica que, sem
  essa trava, bastaria manter a aba aberta para renovar indefinidamente após o fim do
  turno (a rota de refresh não passa pelo `JwtAuthGuard`).
- Mantém a mesma empresa ativa da sessão original; só cai para "primeira empresa
  disponível" se aquele vínculo específico não existir mais.

#### 3.5 Sessão única / troca de empresa (`switchEmpresa`) 🟢

Trocar de empresa **não abre uma nova sessão** — reaproveita a sessão do token atual
(já validada pelo `JwtAuthGuard`); token legado sem `sid` cai na última sessão aberta do
usuário, e só abre uma nova se não houver nenhuma. Isso mantém o tempo de uso contínuo
na tela de Acessos mesmo ao trocar de empresa.

#### 3.6 Cálculo de `me()` 🟢

- Permissões recalculadas do zero a cada chamada (não reaproveita o token) — garante que
  mudanças de perfil/módulo desligado refletem sem precisar de novo login.
- `rotinaInicialRota`: usa a escolha pessoal do usuário (`vinculo.rotinaInicial`) **se**
  ele ainda tiver a permissão `.visualizar` sobre ela; caso contrário cai para a rotina
  inicial padrão do perfil. A gravação da escolha pessoal não é apagada quando perde
  validade temporariamente — volta a valer se o acesso for restaurado.
- `administradorPlataforma` só é `true` se houver empresa ativa com vínculo (`ativo`) —
  comentário reforça: sem acesso à empresa ativa, nenhuma autoridade.

#### 3.7 Primeiro acesso incompleto (`precisaCompletarPrimeiroAcesso`) 🟢

Função pura exportada (fora da classe). Não basta checar
`primeiroAcessoConcluidoEm IS NOT NULL`: usuários migrados antes da introdução do fluxo
podem ter o marco preenchido mas faltar telefone/data de nascimento. A função valida
reaplicando `completeFirstAccessSchema` (Zod) sobre os dados atuais — se o schema rejeita,
o formulário volta a aparecer mesmo com o marco já setado.

#### 3.8 Upload de avatar (`uploadOwnAvatar`) 🟢

- Limite de 2 MB, validado por **assinatura binária** do arquivo (magic bytes), não pela
  extensão declarada: PNG (`89 50 4E 47 0D 0A 1A 0A`), JPEG (`FF D8 FF`), WEBP (`RIFF` +
  `WEBP` nos offsets corretos). Qualquer outro formato é rejeitado com 400.
- Nome do arquivo gerado por `randomBytes(16).toString('hex')` — sem relação com o nome
  original, evita colisão e path traversal.
- Se a escrita no banco falhar após o arquivo já ter sido salvo em disco, o arquivo é
  removido (`unlink`) antes de repropagar o erro — evita arquivo orfão.

#### 3.9 Troca de senha (`changePassword`) 🟢

Exige a senha atual (bcrypt.compare), delega a validação da política e do reuso para
`PoliticaSenhaService` (`validarSenhaDoUsuario`, `validarReuso`), grava o histórico da
senha antiga **dentro da mesma transação** que grava a nova — garante consistência entre
histórico e senha vigente mesmo em falha no meio do processo.

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `auth`.

### 5. Metadados e configurações 🟢

| Constante | Valor | Uso |
|---|---|---|
| `SALT_ROUNDS` | 12 | custo do bcrypt para hash de senha |
| `REFRESH_TTL_MS` | 7 dias | validade do refresh token |
| `MODULO_ADMINISTRACAO_ID` | `'seed-modulo-administracao'` | id fixo (seed) excluído da lista de permissões de não-admins |
| `JWT_ACCESS_SECRET` (env) | obrigatória, sem fallback | falha no boot se ausente (ver `jwt.strategy.ts`) |
| `JWT_ACCESS_EXPIRES_IN` (env) | fallback `'15m'` | TTL do access token |
| Access token TTL | 15 minutos (hardcoded em `expiresIn: 15 * 60` nas respostas) | |

### 6. Segurança 🟢

- `JwtStrategy.validate` popula o `contextoBanco()` (AsyncLocalStorage) com
  `empresaId`, `plataforma` (modo sistema) e `usuarioId` — é o que faz o `PrismaService`
  aplicar a policy de RLS correta em toda a cadeia de serviços da requisição, sem precisar
  passar esses valores explicitamente por parâmetro.
- `JWT_ACCESS_SECRET` sem valor default — falha alto e cedo no boot (`throw` no
  constructor da strategy) em vez de aceitar um secret público conhecido.
- Rate limit dedicado em `/auth/login`: 10 tentativas/min por IP (mais rígido que o
  default global de 200/min) — cobre credential stuffing distribuído entre contas, como
  complemento ao lockout por conta já existente.

### 7. Dependências do módulo 🟢

`PrismaService`, `JwtService` (`@nestjs/jwt`), `PoliticaSenhaService`, `AcessosService`,
`HorarioTrabalhoService`, contrato `@plataforma/contracts` (schemas Zod de input/output),
`gravarWhatsappDoUsuario` (helper compartilhado em `common/usuarios`).

### 8. Cobertura de testes 🟢

3 arquivos de spec: `auth.service.spec.ts`, `auth-whatsapp.spec.ts`, `first-access.spec.ts`.

---

## Módulo `clientes`

**Caminho:** `apps/api/src/modules/clientes/`
**Arquivos (18):** `clientes.module.ts`, `clientes.controller.ts`, `clientes.service.ts`
(1627 linhas), `cliente-alteracoes.controller.ts`, `cliente-alteracoes.service.ts` (954
linhas), `cliente-cnaes.controller.ts`, `cliente-cnaes.service.ts`,
`clientes-receita-lote.service.ts` (511 linhas), `comodato-baixas.controller.ts`,
`comodato-baixas.service.ts`, `comodato-sql.ts`, `enriquecimento.service.ts`,
`endereco-equivalente.ts`, `registrar-atividade-alteracao-cliente.ts`, DTOs (4 arquivos),
3 arquivos de spec.

### 1. Responsabilidade 🟢

É o módulo mais extenso do sistema (quase 5.000 linhas). Cobre: CRUD de cliente com
escopo hierárquico de carteira, fila de aprovação de alterações cadastrais (manual, ERP,
Receita Federal, agente de IA), enriquecimento via Receita Federal (MinhaReceita), CNAEs
do cliente, Posição de Cliente (tela agregada de vendas/títulos/comodato/mix), e baixas de
equipamento em comodato.

### 2. Fluxo de controle — serviços e funções principais 🟢

| Serviço | Responsabilidade |
|---|---|
| `ClientesService` | CRUD, Posição de Cliente, mix de produtos, listagem com filtros avançados, titularidade (anti-duplicidade), escopos de filtro (vendedor/UF/município) |
| `ClienteAlteracoesService` | Fila de aprovação de alterações (diff, aplicação, histórico, aprovação campo a campo, envio ao ERP) |
| `EnriquecimentoService` | Consulta de CNPJ na MinhaReceita (API pública) e normalização do retorno |
| `ClientesReceitaLoteService` | Atualização em lote de clientes pela Receita, em background, com regra de preenchimento vs. proposta |
| `ClienteCnaesService` | CRUD dos vínculos cliente×CNAE, incluindo CNAE principal |
| `ComodatoBaixasService` | Baixa/desfazimento de saldo de equipamento em comodato |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Escopo de carteira (hierárquico) 🟢

Praticamente toda consulta do módulo passa por `resolverEscopoVendedores()` (helper
compartilhado em `common/escopo/escopo-vendedores`, usado também por Notas de
Saída/Títulos a Receber). Retorna `null` (sem restrição, ex. admin) ou uma lista de
`vendedorId` alcançáveis pelo usuário — vendedor vê só a própria carteira,
supervisor/gerente veem o time. Clientes fora da carteira respondem **404** (nunca 403) —
política deliberada: não confirmar nem a existência do registro para quem está fora do
escopo. 🟢

#### 3.2 Exceção deliberada: `verificarTitularidade` e `titularidadePorCnpj` 🟢

Duas únicas rotas do módulo que **ignoram o escopo de propósito**: resolvem "este cliente
já existe, e é de quem?" sem filtrar por carteira — para o vendedor não prospectar um
cliente que já é de um colega. Em compensação, a resposta é deliberadamente pobre: nunca
devolve valores, contato, histórico; `clienteId` (a chave de qualquer outra ferramenta) só
sai quando o cliente está de fato no escopo de quem perguntou. Comentário explícito no
código alerta que qualquer campo novo ali "vira dado de carteira alheia visível".

#### 3.3 Fila de aprovação de alterações (`ClienteAlteracoesService`) 🟢

- `calcularDiff`: compara só os ~34 campos de `CAMPOS_ACOMPANHADOS` (+ 2 campos virtuais
  `cnaes`/`cnaePrincipal`) entre o cliente atual e o payload; ignora campo ausente do
  payload (update parcial) e usa `mesmoValor()` para não considerar alteração diferenças
  de grafia (endereço, telefone, texto livre — ver 3.4).
- Quem tem `clientes.aprovar` (ou `isAdmin`) aplica a mudança **na hora**, mas a
  solicitação ainda é criada com `status: 'aprovada'` e `analisadoPor = autorId` — todo
  caminho fica no mesmo rastro de auditoria, sem bypass silencioso.
- Sem permissão de aprovar: cria/atualiza uma `ClienteAlteracao` pendente. Dedupe por
  `(empresaId, clienteId, origem, status='pendente')` — reenvio do ERP com o mesmo
  cadastro atualiza a pendência existente em vez de empilhar.
- `aprovar(id, campos?)`: aprovação **campo a campo**. Campos fora da lista escolhida vão
  para o histórico como `status: 'reprovado'` (não descartados em silêncio). Antes de
  aplicar, revalida que o valor atual do cliente ainda bate com o `de` do diff
  (`conflitos`) — se o cadastro mudou entre a solicitação e a aprovação, lança
  `ConflictException` em vez de sobrescrever às cegas.
- `aplicarNoCliente`: ponto único onde o cadastro muda de verdade — por isso é também
  onde nasce o item da fila de envio ao ERP (`enfileirarEnvioErp`) e a notificação de
  "cliente entrou na sua carteira" quando `vendedorId` muda.
- CNAEs no diff **só acrescentam** (nunca removem) — decisão deliberada: sincronizar
  apagando o que ficou de fora arriscaria remover um ramo cadastrado manualmente que a
  Receita não conhece.

#### 3.4 Equivalência de endereço/telefone/texto (`endereco-equivalente.ts`) 🟢

Normaliza para comparação: remove acento (NFD + regex `\p{M}`), maiúsculas, remove
pontuação, abrevia tipo de logradouro ("AVENIDA" → "AV.") via tabela de 11 tipos
conhecidos com múltiplas grafias cada. Telefone compara sem o zero do DDD. Motivação
explícita: sem essa equivalência, a consulta à Receita Federal propunha "mudar" quase
todo cadastro só por diferença de grafia.

#### 3.5 Atualização pela Receita Federal — regra por campo 🟢

Mesma regra usada tanto na consulta de 1 cliente (`ClientesService.atualizarPelaReceita`)
quanto no lote (`ClientesReceitaLoteService.aplicarReceita`):
- Campo **vazio** no cadastro → preenche direto (autoaprovado), **exceto** se o campo
  estiver travado na config da empresa (`ClienteCampoConfigService`), caso em que vira
  proposta mesmo estando vazio.
- Campo **com valor diferente** (após normalização) → vira proposta na fila.
- Campo que a Receita devolve vazio nunca é usado para apagar valor existente.
- CNAEs: cliente sem nenhum CNAE recebe principal + secundários direto; cliente com
  CNAEs recebe a união como proposta (nunca substituição).
- Código CNAE sem referência local (sync do IBGE atrasado) não vira vínculo — aparece como
  aviso (`cnaesSemReferencia`) em vez de desaparecer silenciosamente.

#### 3.6 Lote de atualização pela Receita (`ClientesReceitaLoteService`) 🟢

- Processamento assíncrono "fire and forget" (`void this.executar(...)`), uma execução
  por empresa (índice único — segunda tentativa concorrente recebe 409).
- Execução "rodando" há mais de 3h é considerada órfã (provável reinício da API) e marcada
  como falha ao iniciar uma nova.
- Entre clientes: 1s de cortesia com o serviço público; em falha, 1 nova tentativa após
  10s; 20 falhas consecutivas interrompem o lote inteiro (fonte externa indisponível).
- Progresso gravado a cada 10 clientes processados, para a tela acompanhar.
- Ao final, gera **uma única notificação** resumindo o resultado (nunca uma atividade de
  agenda por cliente — isso inundaria a agenda de quem aprova).

#### 3.7 Posição de Cliente (`posicao`) 🟢

Tela agregada: cliente + notas de venda (`NOTA_DE_VENDA`: ativa, não-comodato, tipo 'N',
com condição de pagamento) + comodatos + devoluções (tipo 'D') + títulos a receber (com
status recalculado via calendário útil da empresa) + mix de produtos + equipamentos em
comodato + conversas de WhatsApp (se o usuário tiver permissão). Nota inativa/cancelada no
ERP nunca entra em nenhuma aba — comentário no código menciona "o legado tem muita nota
inativa zerada". Devolução **não abate** `totalComprado` (quem abate é o `vlrDev` da
própria nota, para não contar a mesma devolução duas vezes).

#### 3.8 Equipamentos em comodato — saldo e aviso "sem consumo" 🟢

`comodato-sql.ts` centraliza 4 expressões SQL reaproveitadas por 3 consumidores (listagem,
aba Equipamentos, ferramenta do agente) para nunca divergirem:
- `saldoComodatoSql`: enviado (remessa) − devolvido (retorno) − baixado (`ComodatoBaixa`
  vigente).
- `comprouAplicavelSql`: cliente comprou algum produto "aplicável" ao equipamento
  (`produto_relacionados.tipo='aplicacao'`) nos últimos 30 dias — conta qualquer nota
  normal, inclusive bonificação.
- `comodatoSemConsumoSql`: equipamento ativo com aplicáveis cadastrados, em poder do
  cliente, sem nenhuma compra aplicável no período. Reescrita deliberadamente como
  `cliente.id IN (subquery sem correlação)` em vez de `EXISTS` correlacionado por
  performance: a versão correlacionada levava 5,9s na listagem e estourava o timeout de
  5s da transação.
- `comodatoEmPoderSql`: saldo positivo de qualquer produto saído em remessa, com ou sem
  aplicáveis cadastrados — a base de "comodato sem compra" mesmo antes de existir cadastro
  de aplicáveis.
- Baixa de comodato (`ComodatoBaixasService`) zera o **saldo inteiro atual** do produto no
  cliente (não uma quantidade parcial); remessa futura forma saldo novo. Baixar/desfazer
  grava uma `Atividade` já concluída no histórico do vendedor titular do cliente (se
  houver).

#### 3.9 Listagem de Posição de Cliente — SQL bruto para ordenação por coluna agregada 🟢

`listagemPosicao` monta a query inteira em `Prisma.sql` (não query builder): colunas como
venda dos últimos 30/90 dias são agregações calculadas ao vivo, e o Prisma não suporta
`ORDER BY` por coluna agregada antes do `LIMIT`. `sortBy`/condições de filtro usam
whitelists explícitas (`LISTAGEM_POSICAO_SORT_EXPR`, `SORT_FIELDS`) — nunca interpola
entrada do usuário direto na query.

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `clientes`.

### 5. Metadados e configurações 🟢

| Constante | Valor | Uso |
|---|---|---|
| `NOTA_DE_VENDA` / `NOTA_DE_VENDA_SQL` | ativa, não-comodato, tipo 'N', com condição de pagamento | definição única de "venda" em Posição de Cliente e Consultas |
| `CAMPOS_ACOMPANHADOS` | ~34 campos | campos do cliente monitorados pela fila de aprovação |
| `CAMPOS_ENVIO_ERP` | mapa campo→nome ERP | whitelist do que volta à SA1 (BJPLA004) |
| `COMODATO_DIAS_SEM_CONSUMO` | 30 dias | janela do aviso "sem consumo" |
| `INTERVALO_MS` (lote Receita) | 1000ms | cortesia entre chamadas à MinhaReceita |
| `MAX_FALHAS_SEGUIDAS` (lote Receita) | 20 | aborta o lote |
| `EXECUCAO_ORFA_MS` | 3h | marca execução travada como falha |

### 6. Segurança / integridade 🟢

- Escopo de carteira aplicado em **toda** consulta/mutação (exceto as duas exceções
  deliberadas e documentadas da seção 3.2).
- Reforço server-side da configuração de campos editáveis
  (`ClienteCampoConfigService`) em `update`, `ClienteCnaesService` e na aplicação da
  Receita — travar um campo na tela não é controle de acesso; a trava real é no serviço.
- Cliente de origem ERP (tem `chave` ou `codigoErp`) não pode ser excluído pela API —
  só inativado — porque a próxima carga do ERP o traria de volta e órfãos (orçamento,
  título) perderiam o cadastro.
- `titularidadePorCnpj` usa `regexp_replace` no SQL para comparar CNPJ por dígitos,
  evitando falso-negativo por máscara.

### 7. Dependências do módulo 🟢

`PrismaService`, `ClienteCampoConfigService`, `ClienteAlteracoesService`,
`EnriquecimentoService`, `ClientesReceitaLoteService`, `ExternalHttpService` (chamada à
MinhaReceita), `resolverEscopoVendedores`/`combinarFiltroVendedor` (common/escopo),
`calcularStatusTituloReceber`/`podeEmitirBoleto` (titulos-receber), `comFlagXml`
(notas-saida), `resolverTabelaPrecoCliente` (common/precos), `sessaoDoUsuarioWhere`
(whatsapp), `registrarNotificacao` (notificacoes), `@plataforma/contracts`.

### 8. Cobertura de testes 🟢

3 arquivos de spec: `cliente-alteracoes.diff.spec.ts` (regras de diff/equivalência),
`endereco-equivalente.spec.ts`.

---

## Módulo `empresas`

**Caminho:** `apps/api/src/modules/empresas/`
**Arquivos:** `empresas.module.ts`, `empresas.controller.ts` (256 linhas),
`empresas.service.ts` (321 linhas), `dto/empresa.dto.ts`, `empresa-plano-grupo.spec.ts`.

### 1. Responsabilidade 🟢

Cadastro de empresas (tenants). Cada empresa pertence a um `GrupoEconomico`. Controla
quem pode criar/editar empresa dentro do próprio grupo vs. a administração global da
plataforma, campos exclusivos da plataforma (situação de assinatura, teto de usuários),
upload de logo/banner/logo-DANFE, e exclusão (soft delete).

### 2. Fluxo de controle — funções principais 🟢

| Função | Observação |
|---|---|
| `findAll(query, user?)` | admin da plataforma vê todas; demais só as empresas do próprio grupo econômico (ou as vinculadas, se não for admin) |
| `findOneDoAtor(id, user)` | valida escopo antes de devolver o detalhe (rota pública ao usuário logado) |
| `create` / `createDoAtor` | `create` é uso interno (sem validação de ator); `createDoAtor` é o caminho da API — exige `isAdmin` ou `administradorPlataforma` |
| `update` | remove campos exclusivos da plataforma do payload se o ator não for admin de plataforma |
| `setLogo` / `setLogoDanfe` / `setBanner` | grava caminho do upload, remove arquivo anterior do disco (best-effort) |
| `remove` | soft delete + `situacao: 'cancelada'` |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Escopo de acesso a empresas (`garantirEscopo`) 🟢

- Administrador da plataforma (`administradorPlataforma`): acesso irrestrito a qualquer
  empresa.
- Administrador comum (`isAdmin`, perfil `sistemaBase`): só acessa empresas do **próprio
  grupo econômico** (resolvido via `usuario.grupoEconomicoId`).
- Qualquer outro usuário: só a própria `empresaAtivaId` da sessão.
- Comentário explícito no código registra uma correção de bug de segurança: antes desta
  checagem, a permissão `empresas.editar` (que o perfil Administrador tem) valia para
  **todas** as empresas da base, porque o service nunca comparava o id recebido com o da
  sessão — ou seja, um admin de uma empresa podia editar qualquer outra empresa do
  sistema só por ter essa permissão no próprio perfil.

#### 3.2 Campos exclusivos da plataforma (`CAMPOS_DA_PLATAFORMA`) 🟢

`ePlataforma`, `situacao`, `testeExpiraEm`, `limiteUsuarios` são removidos do payload de
`update` antes de chegar ao Prisma, a menos que `user.administradorPlataforma === true`.
Comentário no código: um administrador de empresa que alcançasse esses campos "se
liberaria sozinho" — estenderia o próprio período de teste, sairia do estado suspenso ou
apagaria o próprio teto de usuários. Por isso a exclusão é feita no payload, não apenas
escondida na tela (reforço server-side).

#### 3.3 Criação de empresa dentro de um grupo (`createDoAtor`) 🟢

- Só admin (de empresa ou plataforma) pode criar; admin de empresa precisa já pertencer
  a um grupo econômico.
- CNPJ é validado como único **na base inteira**, não só no grupo — consulta em "modo
  sistema" (`withSistema`, sem filtro de tenant) porque unicidade de CNPJ é uma regra
  global, não uma regra de carteira.
- `garantirVagaDeEmpresa` (helper externo, `common/empresa/limite-empresas`) confere se o
  grupo ainda tem vaga no plano contratado antes de criar.
- A nova empresa herda a situação da assinatura do grupo: `teste` (com o mesmo
  `testeExpiraEm` da empresa de origem) ou `ativa`, nunca gera cobrança nova — "utiliza o
  contrato do grupo" (comentário explícito).
- Após criar, executa `SELECT set_config('app.current_empresa_id', ...)` dentro da mesma
  transação — necessário porque o restante da transação (criação do `UsuarioEmpresa`)
  roda sob RLS e a policy de tenant exige esse contexto de sessão do Postgres.
- Vínculo `UsuarioEmpresa` criado sem perfil: perfil é do usuário (global), só o acesso à
  nova empresa precisa ser registrado.

#### 3.4 Unicidade de alias (`ensureAliasDisponivel`) 🟢

Alias é a URL de login (`?empresa=<alias>`) e precisa ser único **na base inteira**
(modo sistema), não só no grupo/empresa — dois tenants não podem compartilhar a mesma
URL de entrada.

#### 3.5 Upload de logo/banner/logo-DANFE 🟢

Os três seguem o mesmo padrão: grava o novo caminho, e se havia um arquivo anterior,
tenta removê-lo do disco de forma best-effort (`unlink` sem `await`, erro ignorado) —
evita acumular arquivos órfãos sem bloquear a resposta em caso de falha na remoção.
`setBanner` não liga a faixa automaticamente — enviar a imagem e publicá-la
(`bannerAtivo`) são ações separadas, decisão explícita no comentário.

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `empresas`.

### 5. Metadados e configurações 🟢

| Constante | Observação |
|---|---|
| `CAMPOS_DA_PLATAFORMA` | `ePlataforma`, `situacao`, `testeExpiraEm`, `limiteUsuarios` |
| `SORT_FIELDS` | whitelist de ordenação: `razaoSocial`, `nomeFantasia`, `cnpj`, `situacao`, `createdAt` |

### 6. Segurança 🟢

- `garantirEscopo` é chamado em toda operação de leitura/escrita que recebe um `id` de
  empresa vindo da API — ponto único de correção do bug de escopo descrito em 3.1.
- Rota `DELETE /empresas/:id` tem `@UseGuards(PlatformAdminGuard)` adicional — só a
  administração da plataforma exclui empresa, mesmo que um perfil tenha
  `empresas.excluir`.
- `GET /empresas/ativa` deliberadamente **sem** `@RequirePermission` — qualquer usuário
  autenticado pode ler os dados da própria empresa ativa (usado no cabeçalho do PDF de
  orçamento); comentário no código avisa para não adicionar a permissão ali.

### 7. Dependências do módulo 🟢

`PrismaService`, `garantirVagaDeEmpresa` (common/empresa/limite-empresas),
`validarDocumentoEmpresa` (common/empresa/documento-empresa), `EnriquecimentoService`
(consulta de CNPJ, reaproveitado do módulo `clientes`), uploads config
(`common/uploads/uploads.config`).

### 8. Cobertura de testes 🟢

`empresa-plano-grupo.spec.ts` (criação de empresa dentro de grupo/plano).

---

## Módulo `grupos-economicos`

**Caminho:** `apps/api/src/modules/grupos-economicos/`
**Arquivos:** `grupos-economicos.module.ts`, `grupos-economicos.controller.ts`,
`grupos-economicos.service.ts` (280 linhas, sem spec próprio).

### 1. Responsabilidade 🟢

Hierarquia Grupo Econômico → Empresa. Gerencia composição de empresas no grupo (mover
empresa de um grupo para outro), usuários do grupo (perfil é da conta, válido em todas as
empresas do grupo) e remoção de acesso de um usuário a uma empresa específica. É o módulo
com a lógica transacional mais delicada do sistema — concorrência entre operações que
recompõem grupos.

### 2. Fluxo de controle — funções principais 🟢

| Função | Observação |
|---|---|
| `contexto(user)` | lista grupos visíveis + empresas "disponíveis" (de outros grupos, candidatas a mover) |
| `salvar(id, input, user)` | cria ou edita grupo — a função mais complexa do módulo (ver 3.2) |
| `usuarios(id, user)` | lista contas do grupo com seus vínculos por empresa |
| `salvarUsuario(id, input, user)` | cria usuário novo no grupo ou dá acesso a um existente, com mesmo perfil em todas as empresas do vínculo |
| `removerAcesso(id, usuarioId, empresaId, user)` | desativa o vínculo `UsuarioEmpresa` (não apaga a conta) |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Escopo de administração (`exigirAdmin`, `empresasAdministradas`) 🟢

- Só `isAdmin` (perfil `sistemaBase`) gerencia grupos.
- Administrador da plataforma: sem restrição (`empresasAdministradas` retorna `null`).
- Administrador de empresa: só administra as empresas às quais tem vínculo ativo com
  perfil `sistemaBase` — `empresasAdministradas` retorna a lista explícita de ids.

#### 3.2 Recomposição de grupo (`salvar`) — a operação mais delicada do sistema 🟢

Como "toda empresa tem grupo" (invariante do domínio), incluir uma empresa num grupo é
sempre **mover** essa empresa de onde ela estava. A função:

1. Confere que só administradores da plataforma podem **criar** grupo novo.
2. Para cada empresa a incluir que não estava antes no grupo, exige que o ator administre
   essa empresa diretamente — impede "roubar" empresa de outro administrador.
3. Toda a recomposição roda em `withSistema` (modo sistema) — porque a operação atravessa
   múltiplos grupos e a RLS por grupo não permitiria ver/mover uma empresa de outro grupo
   a partir do contexto de uma única empresa ativa.
4. **Lock explícito com `SELECT ... FOR UPDATE`** no próprio grupo e em todas as empresas
   envolvidas (ordenado por id, para evitar deadlock entre duas chamadas concorrentes que
   tocam os mesmos registros em ordem diferente) — serializa recomposições concorrentes.
5. Confere vaga no plano do grupo (`garantirVagaDeEmpresa`) antes de mover empresa nova
   para dentro (exceto para admin da plataforma).
6. Para cada empresa que muda de grupo: usuários com vínculo **ativo** nela acompanham a
   empresa para o novo grupo — mas só se o `grupoEconomicoId` atual do usuário for nulo,
   o grupo de origem da empresa, ou o grupo de destino; senão lança `ConflictException`
   ("usuário vinculado a outro grupo. Revise os vínculos antes de agrupá-la") — proteção
   contra mover silenciosamente a conta de alguém que pertence a um terceiro grupo.
7. Perfis acompanham a empresa: `planejarPerfisParaGrupo`/`aplicarPerfisNoGrupo`
   (helper em `common/perfil/perfil-do-grupo`) resolve, pelo nome, o perfil equivalente
   no grupo de destino — planejado **antes** da troca de grupo (enquanto a RLS de
   `Perfil` ainda mostra o grupo de origem) e aplicado **depois**.
8. Empresa que é **removida** do grupo atual ganha um grupo próprio (novo, com o nome
   dela como descrição) e é marcada `situacao: 'suspensa'` + `testeExpiraEm: null` —
   nunca fica sem grupo.
9. Grupo de origem que ficar sem nenhuma empresa é soft-deletado.
10. Transação com timeout estendido (`20_000`ms) — operação com múltiplas idas ao banco
    por empresa envolvida.

#### 3.3 Perfil é do usuário, não do vínculo (`salvarUsuario`) 🟢

- Todos os vínculos informados (`input.vinculos`) devem ter o **mesmo** `perfilId` —
  reforça a decisão de 30/09/2026 de que o perfil é da conta, válido em todas as empresas
  do grupo que ela acessa.
- `validarPerfil`: perfil deve existir, pertencer ao grupo da empresa de referência
  (`garantirPerfilDoGrupo`), e só a administração da plataforma pode atribuir ou já ter
  atribuído o perfil "Administrador da Plataforma" (`administraPlataforma: true`).
- Usuário novo: e-mail único **na base inteira** (`withSistema`), valida a senha contra
  a política de **cada** empresa do vínculo, `deveTrocarSenha: true` forçado.
- Reaproveitamento de cadastro de vendedor: se já existe um `Vendedor` sem `usuarioId`
  com o mesmo e-mail em alguma das empresas do vínculo, os dados dele (nome, telefone,
  etc. via `dadosDoVendedor`) alimentam o novo usuário, e o vendedor é vinculado
  (`usuarioId`) ao final — evita duplicar identidade entre o cadastro comercial e o
  login.
- Locks explícitos (`FOR UPDATE`) no grupo e em cada empresa do vínculo, processados em
  ordem determinística (`sort` por id) — mesma proteção contra deadlock de `salvar`.
- `garantirVagaDeUsuario` só é chamado quando o vínculo **não estava ativo antes** — reativar
  um vínculo existente não deveria contar contra o teto se já contava antes 🟡 (inferido
  da condição `if (!atual?.ativo)`).

#### 3.4 Remoção de acesso (`removerAcesso`) 🟢

- Usuário não pode remover o próprio acesso por esta tela (proteção contra lockout
  acidental).
- `validarPerfil` é chamado de novo aqui — mesma trava: não é possível desativar o
  acesso de um Administrador da Plataforma por esta rota (só a própria plataforma).
- Ao desativar, também remove `WhatsappVinculoFuncionario` do usuário naquela empresa —
  evita vínculo de atendimento órfão apontando para quem perdeu acesso.

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `grupos-economicos`.

### 5. Metadados e configurações 🟢

Transações de `salvar` e `salvarUsuario` usam `timeout: 20_000` (ms) — maior que o
default do Prisma, por envolverem múltiplas idas ao banco por empresa.

### 6. Segurança / integridade 🟢

- `withSistema` (bypass de RLS por tenant) é usado deliberadamente em operações que
  atravessam grupos — mas sempre **depois** de uma checagem de autorização já feita no
  contexto normal (`grupo()`, `empresasAdministradas()`), nunca para contornar a
  autorização em si.
- Locks `FOR UPDATE` ordenados por id — mitigação explícita de deadlock em operações
  concorrentes sobre os mesmos grupos/empresas.
- Dupla validação de perfil (`validarPerfil`) impede escalonamento para "Administrador
  da Plataforma" por quem não é administrador da própria plataforma.

### 7. Dependências do módulo 🟢

`PrismaService`, `PoliticaSenhaService`, `garantirVagaDeUsuario`
(common/empresa/limite-usuarios), `garantirVagaDeEmpresa` (common/empresa/limite-empresas),
`aplicarPerfisNoGrupo`/`garantirPerfilDoGrupo`/`planejarPerfisParaGrupo`
(common/perfil/perfil-do-grupo), `dadosDoVendedor` (common/usuarios/dados-do-vendedor).

### 8. Cobertura de testes 🔴

Nenhum arquivo de spec dedicado encontrado para este módulo — lacuna notável dado o nível
de complexidade transacional da função `salvar`.

---

## Módulo `usuarios`

**Caminho:** `apps/api/src/modules/usuarios/`
**Arquivos:** `usuarios.module.ts`, `usuarios.controller.ts`, `usuarios.service.ts`,
`dto/usuario.dto.ts`, `common/usuarios/whatsapp-do-usuario.ts`,
`common/usuarios/dados-do-vendedor.ts`
**Testes relacionados (em `common/usuarios/`):** `dados-do-vendedor.spec.ts`,
`whatsapp-do-usuario.spec.ts`

### 1. Responsabilidade 🟢

CRUD da conta `Usuario` dentro do escopo da empresa ativa, gestão de vínculo
usuário×empresa (`UsuarioEmpresa`) com atribuição de perfil/superior/dados pessoais,
reset de senha por administrador e cadastro de horário de trabalho (restrição de
expediente). Não cobre login/token/próprio perfil — isso é `auth` (ver módulo `auth`).

### 2. Fluxo de controle — funções principais 🟢

| Função | Entrada | Saída | Complexidade |
|---|---|---|---|
| `findAll(empresaId, query)` | filtros (perfilId, ativo, search), paginação | lista paginada + `vinculoId` | Média — roda dentro de `withTenant` por causa de RLS em `usuarioEmpresas`/`perfil` |
| `findOne(id, empresaAtivaId?)` | id, empresa ativa opcional | usuário sem `senhaHash` + `usuarioEmpresas` resolvidos por empresa | Alta — lê vínculo empresa a empresa no alcance do grupo, sem empresa cai em `withUsuario` |
| `create(input, empresaId, actorId, atorEhAdminPlataforma)` | dados + senha | usuário criado | Alta — checagem de perfil restrito, unicidade de e-mail por `withSistema`, vaga de licença, hash bcrypt, herda dados de `Vendedor` pré-existente e o vincula |
| `update(id, input, actorId)` | campos simples | usuário atualizado | Baixa — não altera senha nem vínculos |
| `resetSenha(id, input, actorId)` | nova senha | `{success}` | Média — valida política + reuso, grava histórico, zera lockout |
| `remove(id, actorId)` | id | `{success}` | Baixa — soft delete + `ativo: false` |
| `vincularEmpresa(usuarioId, empresaId, input, actorId, atorEhAdminPlataforma)` | perfilId, superiorId, dados pessoais | vínculo criado/reativado (upsert) | Alta — valida grupo econômico único, perfil restrito, superior no mesmo grupo, vaga de licença, grava WhatsApp |
| `obterHorarios` / `salvarHorarios(id, input, actorId)` | faixas por dia da semana | horários + flag `restringirHorario` | Média — substitui em bloco (delete+create) dentro de transação, invalida cache do guard |
| `desvincularEmpresa(usuarioId, empresaId, actorId, empresaAtivaId)` | ids | `{success}` | Média — `empresaId` só é aceita se estiver no alcance (grupo) de `empresaAtivaId` |
| `empresasNoAlcance(empresaAtivaId)` (privado) | empresa ativa | lista de ids (ela + grupo) | Baixa |
| `garantirPodeAtribuirPerfil(...)` (privado) | perfil novo/atual, flag admin plataforma, empresaId | lança `ForbiddenException` ou retorna | Média — ver 3.1 |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Trava de escalonamento de perfil (`garantirPodeAtribuirPerfil`) 🟢

Impede conceder **ou retirar** um perfil com `administraPlataforma: true` por quem não é
ele mesmo administrador da plataforma — fecha uma rota de escalonamento que
`usuarios.editar` (permissão que Administrador Empresa tem) deixaria aberta ao atribuir
um `perfilId` existente a um vínculo, já que a tela de Perfis tem `PlatformAdminGuard`
mas esta rota não. Antes dessa checagem, para qualquer ator: o perfil precisa ser da
plataforma ou do grupo econômico da empresa (`garantirPerfilDoGrupo`).

#### 3.2 Conta única por grupo econômico (`vincularEmpresa`, `create`) 🟢

Decisão de 30/09/2026: uma conta pertence a um grupo econômico só. `vincularEmpresa`
recusa (`ConflictException`) vincular a uma empresa de grupo diferente do já registrado
em `usuario.grupoEconomicoId`, e exige que o `superiorId` informado seja usuário do
mesmo grupo. `create` grava o grupo da empresa no momento da criação.

#### 3.3 Herança de dados de `Vendedor` pré-existente (`create`) 🟢

Ao criar um usuário, busca `Vendedor`s sem `usuarioId` com o mesmo e-mail na empresa e:
(a) usa `dadosDoVendedor()` para herdar `codigoErp`/`nomeReduzido`/`telefone`/
`dataNascimento` (só se o valor for único entre os vendedores encontrados — ver 3.5);
(b) após criar o usuário, vincula esses `Vendedor`s a ele (`usuarioId`). Sem isso, o
acesso nasceria sem carteira (o escopo hierárquico busca `Vendedor` pelo `usuarioId`).

#### 3.4 Resolução de vínculos no alcance do grupo (`findOne`) 🟢

`usuario_empresas` tem RLS por tenant — um `include` direto sem `withTenant` definido
mostraria "nenhuma empresa vinculada" para qualquer usuário. A função lê vínculo por
vínculo, uma chamada `withTenant` por empresa no alcance (a empresa ativa + demais do
mesmo grupo), e descarta os que não existem. Sem `empresaAtivaId` (uso interno), lê o
usuário via `withUsuario` e devolve sem vínculos resolvidos.

#### 3.5 Unificação de dados divergentes (`dadosDoVendedor`, em `common/usuarios/`) 🟡

Quando há mais de um `Vendedor` candidato com valores diferentes para o mesmo campo
(ex. dois `codigoErp` diferentes), a função descarta o campo (retorna `null`) em vez de
escolher um arbitrariamente — comentário explícito no código: "dados da conta são
únicos no grupo: não escolhe arbitrariamente uma empresa".

#### 3.6 WhatsApp replicado para `Vendedor` do grupo (`gravarWhatsappDoUsuario`) 🟢

Ao gravar celular/telefone do usuário (via `vincularEmpresa`), propaga o número
normalizado (`normalizarWhatsapp`, só dígitos) para o campo `telefone` de **todos** os
`Vendedor`es do usuário em todas as empresas do grupo — trocando o `app.current_empresa_id`
da sessão Postgres a cada empresa (RLS de `vendedor`) e restaurando a empresa de origem
no `finally`. Se o número mudou, apaga `WhatsappVinculoFuncionario` (precisa revincular).
Lança `ForbiddenException` se a empresa informada não estiver entre as do grupo do
usuário.

#### 3.7 Substituição em bloco do horário de trabalho (`salvarHorarios`) 🟢

Em vez de diff linha a linha, apaga todas as faixas do usuário e recria a partir do
payload (no máximo 7, uma por dia da semana), dentro de uma transação — uma falha no
meio não pode deixar `restringirHorario: true` com só parte da semana cadastrada (isso
trancaria o usuário fora do sistema em dias sem faixa). Após salvar, invalida o cache de
1 minuto do guard de horário (`horarioTrabalho.invalidar`) para a mudança valer
imediatamente.

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `usuarios` (`UsuarioHorario`; `Usuario` e
`UsuarioEmpresa` já documentados na seção `auth`).

### 5. Metadados e configurações 🟢

`SALT_ROUNDS = 12` (bcrypt). `SORT_FIELDS` restringe a ordenação de `findAll` a
`nome`, `email`, `ativo`, `ultimoLogin`, `createdAt` — qualquer outro valor cai no
default `nome`.

### 6. Segurança / integridade 🟢

- `create` usa `withSistema` só para checar unicidade de e-mail (global, cruza grupos) —
  depois disso, toda a criação roda sob o tenant da empresa.
- A verificação de vaga de licença (`garantirVagaDeUsuario`) roda **dentro** da mesma
  transação do `create`/`vincularEmpresa`, não antes — evita que dois cadastros
  simultâneos passem pela mesma última vaga disponível.
- `desvincularEmpresa` valida que a `empresaId` da URL está no alcance (grupo) de quem
  pede, antes dessa checagem a RLS sozinha devolvia 500 em vez de 404 para empresa de
  fora.

### 7. Dependências do módulo 🟢

`PrismaService`, `PoliticaSenhaService` (validação de senha e reuso),
`HorarioTrabalhoService` (acessos — cache de restrição de expediente),
`garantirVagaDeUsuario` (common/empresa/limite-usuarios),
`garantirPerfilDoGrupo`/`grupoDaEmpresa` (common/perfil/perfil-do-grupo),
`gravarWhatsappDoUsuario`/`dadosDoVendedor` (common/usuarios/), `AuthModule` (importado
só para expor fluxos de foto/tela-inicial reaproveitados do próprio perfil), `bcryptjs`.

### 8. Cobertura de testes 🟡

Sem spec dedicado para `usuarios.service.ts`; as únicas coberturas tocam os helpers em
`common/usuarios/` (`dados-do-vendedor.spec.ts`, `whatsapp-do-usuario.spec.ts`) — a
lógica de orquestração do service (criação, vínculo, trava de perfil) não tem teste
próprio 🔴.

---

## Módulo `perfis`

**Caminho:** `apps/api/src/modules/perfis/`
**Arquivos:** `perfis.module.ts`, `perfis.controller.ts`, `perfis.service.ts`,
`dto/perfil.dto.ts`, `perfis.service.spec.ts`

### 1. Responsabilidade 🟢

CRUD do catálogo de perfis RBAC (`Perfil`) e das permissões por rotina/ação
(`PerfilPermissao`). Resolve a visibilidade e as travas de edição entre perfil "da
plataforma" (modelo global, `grupoEconomicoId` nulo) e perfil "do grupo econômico"
(cópia/personalização por grupo) — ver 3.1.

### 2. Fluxo de controle — funções principais 🟢

| Função | Entrada | Saída | Complexidade |
|---|---|---|---|
| `findAll(query, user)` | filtros + paginação | perfis visíveis para o ator | Média — monta `where` combinando `visiveis()` com os filtros |
| `findOne(id, user)` | id | perfil + permissões + rotina inicial, ou 404 | Média — 404 também para perfil de outro grupo (ver 3.2) |
| `create(input, user)` | dados do perfil | perfil criado | Média — decide o dono (`grupoEconomicoId`) pelo papel do ator |
| `update(id, input, user)` | campos | perfil atualizado | Baixa — delega a trava a `garantirPodeAlterar` |
| `remove(id, user)` | id | soft delete | Baixa — recusa perfil `sistemaBase` |
| `updatePermissoes(id, input, user)` | lista `{rotinaId, acao, permitido}` | permissões atualizadas | Média — upsert em lote + trava de rotina administrativa |
| `visiveis(user)` (privado) | user | filtro Prisma (`Prisma.PerfilWhereInput`) | Média — ver 3.1 |
| `garantirPodeAlterar(id, user)` (privado) | id, user | perfil ou `ForbiddenException` | Baixa |
| `grupoDoAtor(user)` (privado) | user | grupo econômico da empresa ativa | Baixa |
| `formatPerfil` (função livre) | perfil com `rotinaInicial` | perfil achatado (`rotinaInicialNome`/`rotinaInicialRota`) | Baixa |
| `nomeRepetido(err)` (função livre) | erro | boolean (`P2002`) | Baixa |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Visibilidade perfil-da-plataforma × perfil-do-grupo (`visiveis`) 🟢

`Perfil` não tem RLS — é lido no login, antes de existir empresa ativa na sessão — então
o corte de visibilidade é feito inteiramente em código, em `visiveis()`:
- Quem **não** é administrador da plataforma vê os perfis da plataforma (`grupoEconomicoId`
  nulo) **exceto** os que têm um homônimo no grupo da empresa ativa — a migration que
  introduziu "perfil por grupo" deu a cada grupo uma cópia dos perfis que ele já usava, e
  mostrar os dois duplicaria a opção "Vendedor", por exemplo.
- Quem **não** é administrador da plataforma também nunca vê perfil com
  `administraPlataforma: true` — não por risco de leitura, mas para nem aparecer como
  opção no select de vínculo de quem não pode concedê-lo (a trava de atribuição em si
  mora em `UsuariosService.garantirPodeAtribuirPerfil`, módulo `usuarios`).
- Administrador da plataforma vê todos os da plataforma, mesmo havendo homônimo no
  grupo — são os que ele administra.

#### 3.2 Perfil de outro grupo responde 404 (`findOne`, `garantirPodeAlterar`) 🟢

Perfil de um grupo econômico diferente do da empresa ativa não gera 403, gera 404 —
"como se não existisse" (comentário explícito no código). `garantirPodeAlterar` reusa
`findOne` (que já aplica esse filtro) e só adiciona uma segunda trava: perfil da
plataforma (`grupoEconomicoId` nulo) só é alterável por administrador da plataforma,
mesmo que o ator o enxergue na listagem.

#### 3.3 Dono do perfil decidido na criação (`create`) 🟢

Administrador da plataforma cria sempre com `grupoEconomicoId: null` (perfil-modelo,
disponível a todos os grupos). Qualquer outro ator cria no grupo da empresa ativa — e
se a empresa ativa não pertencer a grupo nenhum, `ForbiddenException`. Não há como criar
perfil com `administraPlataforma: true` por essa rota (o campo nem está em
`PerfilCreate`/`PerfilUpdate` — só seed e migration concedem).

#### 3.4 Trava de rotina administrativa fora do perfil base (`updatePermissoes`) 🟢

Perfis que não são `sistemaBase` não podem receber permissão (`permitido: true`) para
nenhuma rotina do módulo `seed-modulo-administracao` (constante
`MODULO_ADMINISTRACAO_ID`) — mesmo corte usado em `auth.buildAccessToken` (`rotinaNoAr`,
módulo `auth`) para nunca listar essas rotinas no token de quem não é admin. Aqui a
checagem é preventiva: barra a gravação, não só a exibição.

#### 3.5 Upsert em lote de permissões (`updatePermissoes`) 🟢

Substitui por upsert (`perfilId_rotinaId_acao` como chave composta) só as combinações
rotina+ação presentes no payload — as demais permissões do perfil permanecem como
estavam (documentado também no Swagger do controller). Não roda em transação: as
chamadas de `upsert` disparam em paralelo via `Promise.all` 🟡 (uma falha no meio deixa
permissões parcialmente gravadas).

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `perfis` (`Perfil`, `PerfilPermissao`).

### 5. Metadados e configurações 🟢

`SORT_FIELDS` restringe ordenação de `findAll` a `nome`, `ativo`, `sistemaBase`,
`createdAt`. `MODULO_ADMINISTRACAO_ID = 'seed-modulo-administracao'` — id fixo de seed,
replicado também em `auth.service.ts` (ver 3.4).

### 6. Segurança / integridade 🟢

- Nome único por dono: `@@unique([grupoEconomicoId, nome])` no schema cobre o caso geral,
  mas perfis da plataforma (grupo nulo) dependem de um índice parcial criado via SQL na
  migration (`perfis_nome_plataforma_key`), porque o Prisma não representa índice
  parcial e nulos não colidem num `@@unique` comum — documentado em comentário no schema.
- `nomeRepetido` traduz a violação desse índice (`P2002`) em `ConflictException` tanto em
  `create` quanto em `update`.
- `remove` recusa (`NotFoundException`, não 403) excluir perfil `sistemaBase` — mensagem
  deliberadamente genérica.

### 7. Dependências do módulo 🟢

`PrismaService`, `grupoDaEmpresa` (common/perfil/perfil-do-grupo), `Prisma` (namespace,
para `Prisma.PerfilWhereInput` e detecção de `PrismaClientKnownRequestError`).

### 8. Cobertura de testes 🟢

`perfis.service.spec.ts` cobre as duas frentes centrais: a trava de rotina administrativa
(3.4 — perfil não-admin barrado, perfil admin base liberado) e o corte dono-do-perfil
(3.1/3.2/3.3 — admin de empresa altera perfil do próprio grupo mas não o da plataforma,
perfil de outro grupo não é encontrado, admin da plataforma altera perfil da plataforma,
perfil nasce no dono certo conforme quem cria). `updatePermissoes` sem transação (3.5)
não tem teste cobrindo falha parcial 🔴.

---

## Módulo `acessos`

**Caminho:** `apps/api/src/modules/acessos/`
**Arquivos:** `acessos.module.ts`, `acessos.controller.ts`, `uso-rotina.controller.ts`,
`acessos.service.ts`, `horario-trabalho.service.ts`, `dto/acesso.dto.ts`
**Dependência direta:** `common/horario/horario-trabalho.ts` (`dentroDoExpediente`,
`momentoLocal`, `ForaDoExpedienteException`)

### 1. Responsabilidade 🟢

Duas frentes dentro do mesmo módulo: (a) auditoria de acesso só-leitura — eventos de
login/logout/falha (`AcessoLog`), sessões com tempo de uso (`Sessao`) e uso por rotina
(`UsoRotina`), consumidas pela tela Administração > Acessos; (b) a restrição de
expediente (`HorarioTrabalhoService`) que o `JwtAuthGuard` consulta a cada requisição
para decidir se o usuário pode acessar agora. Quem grava os eventos de auditoria é o
fluxo de autenticação (`auth`), nunca esta API — `AcessosController` é só leitura.

### 2. Fluxo de controle — funções principais 🟢

| Função | Entrada | Saída | Complexidade |
|---|---|---|---|
| `registrar(dados)` | evento, email, ids opcionais | grava `AcessoLog`, nunca lança | Baixa — try/catch que vira log de servidor |
| `abrirSessao` / `tocarSessao` / `encerrarSessao` | ids, empresa | sessão criada/atualizada/fechada | Baixa |
| `situacaoSessao(sessaoId)` | id | `{aberta, motivo}`, com cache de 10s | Média |
| `encerrarSessoes(filtro, motivo)` | usuarioId + `manter`/`sessaoId` | sessões fechadas + refresh tokens revogados | Média — transação dupla (sessao + refreshToken) |
| `registrarUso(empresaId, usuarioId, caminho)` | caminho da tela (web) | `{registrado}` | Média — resolve rotina pela rota do menu (ver 3.1), upsert por dia |
| `usoPorRotina(empresaId, query)` | filtros + período | ranking de rotinas (acessos, usuários distintos, último acesso) | Média — agregação em memória |
| `desconectar(empresaId, ator, sessaoId)` | id da sessão | `{success, jaEncerrada}` | Média — recusa a própria sessão do ator |
| `encerrarSessoesDoUsuario(usuarioId, motivo)` | id, motivo | todas as sessões abertas fechadas | Baixa — usado no corte por fim de expediente |
| `listarEventos` / `listarSessoes` | filtros + paginação | listas paginadas | Média — `where` monta o corte de tenant (ver 3.2) |
| `resumo(empresaId, user, query)` | filtros + período | cartões + tempo de uso por usuário | Alta — agregação dupla (sessões + eventos de falha) em memória, ver 3.4 |
| `HorarioTrabalhoService.verificar(usuarioId, empresaId?, agora?)` | ids, instante | `{dentro, motivo}` | Média — cache de 1 min + feriado do dia |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Resolução de rota → rotina (`rotinasPorRota`, `registrarUso`) 🟢

O catálogo rota→rotina é lido do `Menu` (`rota`) e cacheado em memória por 5 minutos
(muda só quando o catálogo é resincronizado). Quando um `Menu` tem mais de uma `Rotina`
associada (ex.: "Empresas" + "Base de Demonstração"), a rotina "principal" é escolhida
por prioridade: (1) rotina de mesmo nome do menu; (2) rotina cujo `codigo` aparece como
segmento da rota; (3) a primeira da lista. As rotas são ordenadas por tamanho
decrescente antes da busca, para que um prefixo mais específico
(`/comercial/produtos/fichas`) vença um mais genérico (`/comercial/produtos`).
`registrarUso` ignora silenciosamente caminho que não bate com nenhuma rota — é medição,
não pode derrubar a navegação.

#### 3.2 Isolamento sem RLS via filtro em código (`usuariosDaEmpresa`, `whereEventos`, `whereSessoes`) 🟢

`AcessoLog` e `Sessao` não têm RLS por tenant — são escritos no login, antes de existir
empresa ativa (comentário explícito no schema). O isolamento por empresa é inteiramente
em código: toda consulta restringe a `usuarioId IN (vínculos ativos da empresa)`. Exceção
documentada: tentativa de login com e-mail que não existe no cadastro (`usuarioId` nulo)
não pertence a empresa nenhuma e só aparece para quem tem `isAdmin` (perfil de sistema)
— sem essa trava, o admin da empresa A leria tentativas de e-mail contra a empresa B.

#### 3.3 Sessão "viva" sem fechamento explícito (`sessaoAtiva`, `MINUTOS_SESSAO_VIVA`) 🟢

Uma sessão sem `encerradaEm` só conta como ativa se `ultimaAtividadeEm` estiver a menos
de 40 minutos do agora. O valor é o dobro do ciclo de refresh (~15 min, com folga) —
navegador fechado sem logout explícito não renova o token e "envelhece" sozinho até sair
da janela, em vez de aparecer como ativo para sempre.

#### 3.4 Agregação dupla sessões+eventos em memória (`resumo`) 🟢

Constrói um mapa por `usuarioId` em duas passadas: primeiro todas as sessões do período
(sessões, minutos totais, último acesso), depois os eventos de falha do período —
usuário que só tentou e nunca entrou não tem sessão, então nasce no mapa já na segunda
passada, zerado. `usuariosDistintos` é contado **antes** da segunda passada de propósito
(comentário no código) — só conta quem efetivamente acessou, não quem só tentou. O
agregado roda em memória (não em SQL) porque a duração de cada sessão depende de
`encerradaEm ?? ultimaAtividadeEm`, calculada em JS, e o volume mensal por empresa é
pequeno.

#### 3.5 Cache de 1 minuto + feriado do dia (`HorarioTrabalhoService.verificar`) 🟢

Roda em toda requisição autenticada (via guard), então o TTL de 1 min equilibra custo
(uma consulta extra por request seria caro) com responsividade (quem edita o horário
chama `invalidar()` para valer na hora — ver `usuarios.salvarHorarios`). O feriado do dia
só é consultado (outro cache, 10 min) quando `restringirHorario` está ligado, e falha ao
lê-lo vira log + `null`, nunca 500 — login não pode cair por causa do feriado. A
comparação de horário é textual (`"08:00" <= hora < "18:00"`), válida porque o formato é
sempre `HH:MM` de largura fixa; faixa que atravessa meia-noite não é suportada (recusada
no cadastro).

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `acessos` (`Sessao`, `AcessoLog`, `UsoRotina`,
`AcessoEvento`). `UsuarioHorario` já documentado na seção `usuarios`.

### 5. Metadados e configurações 🟢

`DIAS_PADRAO = 30` (período default das consultas). `MINUTOS_SESSAO_VIVA = 40`.
`CACHE_SESSAO_MS = 10_000` (situação de sessão). `TTL_MS = 60_000`
(`HorarioTrabalhoService`, expediente) e `10 * TTL_MS` (feriado). `SORT_FIELDS_EVENTO` /
`SORT_FIELDS_SESSAO` restringem ordenação. `HORARIO_TIMEZONE = 'America/Campo_Grande'`
(fixo, não por empresa — comentário no código já antecipa a extensão).

### 6. Segurança / integridade 🟢

- `desconectar` recusa (`BadRequestException`) que o ator encerre a própria sessão atual
  — existe "Sair" para isso.
- Caches em memória (`situacaoCache`, `mapaRotas`, `feriadoCache` em
  `HorarioTrabalhoService`) têm limite de tamanho com `clear()` total ao estourar (ex.:
  10.000 sessões) — proteção simples contra crescimento ilimitado, ao custo de um pico de
  releituras logo depois 🟡.
- `registrar` (log de auditoria) nunca propaga exceção — falha de escrita no rastro não
  pode derrubar login/logout.

### 7. Dependências do módulo 🟢

`PrismaService`, `common/horario/horario-trabalho.ts` (`dentroDoExpediente`,
`momentoLocal`, `HORARIO_TIMEZONE`), `common/sessao/sessao-encerrada.exception.ts`
(`MOTIVO_DESCONECTADO`), `AuthenticatedUser` (current-user decorator).

### 8. Cobertura de testes 🔴

Nenhum arquivo de spec dedicado encontrado para `acessos.service.ts` nem
`horario-trabalho.service.ts` — lacuna notável dado o papel de
`HorarioTrabalhoService.verificar` em toda requisição autenticada e a agregação não
trivial de `resumo`.

---

## Módulo `produtos`

**Caminho:** `apps/api/src/modules/produtos/`
**Arquivos (18):** `produtos.module.ts`, `produtos.controller.ts`, `produtos.service.ts`,
`produto-relacionados.service.ts`, `produto-fichas.service.ts`,
`ficha-importacao.controller.ts`, `ficha-importacao.service.ts`,
`ficha-embedding.service.ts`, `partir-ficha.ts`, `sem-preco.ts`,
`produto-fotos-importacao.controller.ts`, `produto-fotos-importacao.service.ts`,
`produto-para-agente.service.ts`, `dto/produto.dto.ts`, 4 arquivos de spec.

### 1. Responsabilidade 🟢

CRUD do catálogo de produtos (origem ERP ou nascido na plataforma), com trava de edição
nos campos que o import do Protheus sobrescreveria; preços por tabela; fotos (upload
manual e importação em lote por nome de arquivo); fichas técnicas em PDF com extração de
Markdown por IA (manual ou importação em lote por conteúdo), indexação semântica dessas
fichas; produtos relacionados (similares e aplicação, usado também por Equipamentos de
Comodato); e o recorte do que a IA pode falar sobre um produto — nunca preço.

### 2. Fluxo de controle — serviços e funções principais 🟢

| Serviço | Responsabilidade |
|---|---|
| `ProdutosService` | CRUD, listagem com filtros/busca, preços por tabela (`precos`), opções de filtro, fotos (upload, principal, remoção) |
| `ProdutoRelacionadosService` | CRUD de similares/aplicação, lidos dos dois lados; recusa produto de categoria "equipamento de comodato" como aplicável |
| `ProdutoFichasService` | CRUD de ficha técnica (PDF + Markdown), delega reindexação ao `FichaEmbeddingService` |
| `FichaImportacaoService` | Fila de importação de fichas por PDF: upload grava e devolve, varredura (`setInterval`) lê cada PDF via provedor de IA e vincula ao produto pelo conteúdo |
| `FichaEmbeddingService` | Parte a ficha em trechos (`partirFicha`), indexa (apaga e refaz) e vetoriza os pendentes em lote |
| `ProdutoFotosImportacaoService` | Importação de fotos em lote, vínculo por código extraído do nome do arquivo |
| `ProdutoParaAgenteService` | Busca híbrida (lexical + semântica) e dossiê de produto para a IA — nunca lê `ultimoPreco` |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Trava de campos do ERP (`CAMPOS_DO_ERP`) 🟢

`update` só compara e bloqueia os campos de `CAMPOS_DO_ERP` quando o produto tem `chave`
(veio do import) **e** o valor enviado difere do gravado — o formulário manda o objeto
inteiro, então comparar evita recusar um "salvar" que não tocou em nada do ERP. Produto
sem `chave` (nascido na plataforma) é editável por inteiro. `remove` aplica a mesma régua:
produto com `chave` não pode ser excluído pela API (`BadRequestException`) porque o
próximo import o recriaria — a exclusão real é no Protheus. 🟢

#### 3.2 Preço por tabela com herança de regra de desconto (`precos`) 🟢

Monta, por item de tabela de preço ativa, a regra de desconto que vale naquela linha, na
mesma precedência do orçamento (`resolverRegrasDescontoDosItens`): produto → item da
tabela → categoria do produto → regra padrão da empresa. Comentário no código registra que
a precedência "produto antes da tabela" é decisão do usuário de 2026-10-13 — mudou de
ordem em algum momento.

#### 3.3 Fichas técnicas — extração por IA e corte de preço (`FichaImportacaoService`,
`ProdutoFichasService`, `sem-preco.ts`) 🟢

- **Upload não processa**: grava os PDFs (`ProdutoFichaImportacao`) e devolve; uma
  varredura própria (`setInterval` de 5s, com trava de reentrada `rodando`) lê 1 PDF por
  vez por empresa, com até 3 tentativas antes de marcar `erro` — chamada cara a provedor
  de IA, lote não cabe numa requisição HTTP.
- **Quem decide o produto é o servidor, não o modelo**: o provedor devolve código e nome
  lidos do documento; `procurarProduto` busca no catálogo por código (fornecedor, ERP,
  barras — exato) e só cai para nome (com `sem_acento`, mínimo 4 caracteres) se nenhum
  código bateu. Um resultado → vincula e grava a ficha; zero ou mais de um → situação
  `sem_correspondencia`/`ambiguo`, decisão fica para uma pessoa na tela. Motivação
  explícita no código: se o modelo devolvesse um id, bastaria alucinar um para pendurar a
  ficha no produto errado, sem ninguém perceber até um vendedor mandar a ficha errada a um
  cliente.
- **`sem-preco.ts` — regra "a IA nunca passa preço" é código, não prompt**: `linhaTemPreco`
  reconhece `R$`/`US$`, palavras-chave (`preço`, `custo`, `desconto`, `condição de
  pagamento`...) e remove a linha inteira; deliberadamente **não** inclui "valor" sozinho
  (apareceria em "valor de pH", removeria conteúdo técnico legítimo). Comentário no código
  é explícito sobre a escolha de errar removendo demais — ver a doc do arquivo.
  `FichaEmbeddingService.indexar` vetoriza o Markdown **depois** do `semPreco`;
  `ProdutoParaAgenteService.detalhar` aplica `semPreco` de novo no conteúdo devolvido à IA
  — defesa em duas camadas (o que é indexado e o que é lido).
- **Reindexação é apagar e refazer** (`FichaEmbeddingService.indexar`): guardar diff entre
  versões de Markdown custaria mais do que regerar, e um trecho velho sobrevivendo à edição
  deixaria buscável um texto que a pessoa acabou de remover.
- **Vetorização tolerante a ausência de provedor**: sem embeddings configurados, os trechos
  ficam só com texto (busca lexical atende); `vetorizarPendentes` varre depois, em lote de
  32, teto de 200 por chamada.

#### 3.4 `partir-ficha.ts` — particionamento de Markdown para embedding 🟢

Alvo de ~800 caracteres por trecho (equilíbrio entre contexto suficiente e diluição do
vetor), corte por `\n\n` (respeita a estrutura do documento), blocos menores que 120
caracteres grudam no trecho anterior/seguinte (título de seção sozinho não responde nada),
blocos muito grandes (>1,5× o alvo) são cortados por linha. Teto de 60 trechos por ficha.
O título do documento é repetido no início de cada trecho que não já o contém, para o
vetor do trecho apontar ao produto certo mesmo isolado do resto.

#### 3.5 Busca híbrida para a IA (`ProdutoParaAgenteService.procurarHibrido`/`procurar`) 🟢

- **Lexical "candidatos primeiro, pontuação depois"**: cada termo da busca gera um braço de
  `UNION ALL` (descrição/marca/código/categoria do produto, campos complementares visíveis
  ao agente, texto de ficha visível ao agente), usando `sem_acento(...) ILIKE` (não
  `unaccent`, que não usa o índice GIN de trigramas da migration `20260906000000`) —
  medido em dev: 1139ms pontuando tudo vs. 0,8ms por candidatos primeiro, com 4.000
  produtos/fichas.
- **`palavrasDaBusca`**: remove conectivos/pronomes e palavras do próprio domínio (lista
  `VAZIAS`, ~60 termos) que casariam com o catálogo inteiro; teto de 6 palavras; busca só de
  palavras vazias cai para o texto inteiro (evita devolver o catálogo sem filtro).
  Pontuação por produto = nº de palavras que casaram (não exige todas, para não perder o
  produto certo por uma palavra solta da frase).
  🟢 (testado em `palavras-da-busca.spec.ts`)
- **Semântica**: distância de cosseno (`<=>`, índice HNSW) sobre `produto_ficha_trechos`,
  `DISTINCT ON (produtoId)` para uma ficha longa não ocupar o resultado com vários trechos
  do mesmo produto; filtra só trechos vetorizados e fichas `visivelAgente`.
- **Combinação**: soma por posição (`1/(posição+1)`, não pela distância bruta — cosseno e
  contagem de palavras não são comparáveis), semântica pesando 1,3× a lexical. Sem
  provedor de embeddings, `gerarUm` devolve `null` e sobra só a lexical.

#### 3.6 Similares e aplicação — leitura dos dois lados, regra de categoria (`ProdutoRelacionadosService`) 🟢

- `listar`/`listarTx` junta as relações que partem do produto e as que chegam, marcando
  `origem` — sem isso quem abre o "produto B" não veria que A o usa.
  `similar` é simétrico (gravado uma vez, lido nos dois lados; `criar` rejeita duplicar o
  inverso com `ConflictException`); `aplicacao` é direcional (mesma relação, rótulo
  diferente em cada ponta: "usa"/"usado em").
  `remover` aceita o id pela ponta aberta na tela, seja origem ou destino.
- `recusarCategoriaDeEquipamento`: um produto marcado como categoria/subcategoria de
  "equipamento de comodato" não pode entrar como `aplicacao` (o dispenser não "usa" outro
  dispenser) — decisão do usuário, 2026-10-07. Mora aqui e não na tela de Equipamentos de
  Comodato porque o card "Relacionados" do produto grava a mesma relação; pôr a regra só
  numa tela deixaria a outra como atalho.

#### 3.7 Importação de fotos por nome de arquivo (`codigosDoNome`) 🟢

Extrai candidatos do nome do arquivo (sem extensão) e uma variante sem sufixo
`_2`/` principal`, com precedência para o nome completo (só cai para a variante sem
sufixo quando a correspondência exata não achou nada). Critério de busca é parametrizável
(`codigo_erp`, `codigo_fornecedor`, `manual`); zero ou mais de um produto encontrado grava
a foto sem vínculo (`produtoId: null`), pendente de decisão manual.

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `produtos`.

### 5. Metadados e configurações 🟢

| Constante | Valor | Uso |
|---|---|---|
| `CAMPOS_DO_ERP` | 14 campos | trava de edição em produto com `chave` |
| `SORT_FIELDS` | 5 campos | whitelist de ordenação da listagem |
| `ALVO` / `MINIMO` / `MAXIMO_TRECHOS` (`partir-ficha.ts`) | 800 / 120 / 60 | tamanho-alvo do trecho, limiar de "grudar", teto por ficha |
| `INDICIOS` (`sem-preco.ts`) | 10 regex | o que denuncia preço numa linha de ficha |
| `FichaImportacaoService.INTERVALO_MS` / `POR_RODADA` / `MAX_TENTATIVAS` | 5000ms / 1 / 3 | cadência e paralelismo da varredura de PDFs |
| `FichaEmbeddingService.LOTE` | 32 | trechos por chamada ao provedor de embeddings |
| `VAZIAS` (`produto-para-agente.service.ts`) | ~60 palavras | stop-words da busca da IA |

### 6. Segurança / integridade 🟢

- `ProdutoParaAgenteService` nunca lê `ultimoPreco` do banco — seleção positiva, não poda
  depois da leitura: não há o que o modelo possa deixar escapar porque ele nunca recebeu.
  Caso concreto de "acesso é código" do inventário de ferramentas de IA do projeto.
- `sem-preco.ts` é defesa em duas camadas (indexação e leitura), explicitamente descrita no
  código como "rede, não barreira": heurística sobre texto livre, não garantia — a tela do
  produto permite editar/revisar o Markdown, e `visivelAgente: false` tira a ficha do
  alcance da IA sem apagá-la.
  🟡 (eficácia da heurística depende do texto real; não testável em abstrato)
- `FichaImportacaoService.varrer` precisa iterar empresas por `empresa.findMany` (sem RLS)
  antes de `withTenant` por empresa — comentário no código registra que esquecer isso
  deixa a fila "pendente" para sempre, sem erro, por RLS filtrar tudo (ver também `acessos`
  e `notificacoes`, mesmo padrão de varredura).
- Upload de foto/ficha sem produto correspondente (`setFoto`) remove o arquivo do disco
  (`unlink`) antes de lançar `NotFoundException` — evita lixo órfão em disco.

### 7. Dependências do módulo 🟢

`PrismaService`, `ProvedorIaModule`/`ProvedorFactory` e `AgenteConfigService` (módulo
`agente`, importado sem o `AgenteModule` inteiro para não fechar ciclo de import),
`EmbeddingsService` (módulo `agente`), `common/uploads/uploads.config`
(`PRODUTOS_DIR`, `FICHAS_DIR`, `FICHAS_IMPORTACAO_DIR`), `common/empresa/situacao-empresa`
(`whereEmpresaAcessivel`), `@plataforma/contracts`. Consumido por `whatsapp` (triagem/
pré-atendimento, via `ProdutoParaAgenteService`) e por `equipamentos-comodato` (via
`ProdutoRelacionadosService`, tipo `aplicacao`).

### 8. Cobertura de testes 🟡

4 arquivos de spec: `palavras-da-busca.spec.ts`, `partir-ficha.spec.ts`,
`sem-preco.spec.ts` (as três funções puras de parsing/heurística), e
`produto-relacionados.service.spec.ts`. Sem spec dedicado para `ProdutosService`
(trava de campos do ERP, `precos`), `FichaImportacaoService` (varredura, decisão
servidor-side) nem `ProdutoParaAgenteService.procurarHibrido`/`procurar` (combinação de
pesos) — lacuna notável dado que estas são as rotinas com a lógica de negócio mais densa
do módulo.

---

## Módulo `produto-campos`

**Caminho:** `apps/api/src/modules/produto-campos/`
**Arquivos (5):** `produto-campos.module.ts`, `produto-campos.controller.ts`,
`produto-campos.service.ts`, `normalizar-valor.ts`, `dto/produto-campo.dto.ts`, 1 spec.

### 1. Responsabilidade 🟢

Campos complementares de produto: o cadastro das definições (o que cada empresa decide
guardar — diluição, tensão, pictograma de risco etc., já que uma coluna nova em `produtos`
por empresa não escala) e o preenchimento desses campos por produto, com validação e
normalização de valor por tipo.

### 2. Fluxo de controle — serviços e funções principais 🟢

| Função | Responsabilidade |
|---|---|
| `listar` | Definições ativas (ou todas) da empresa, ordenadas por `ordem`/`nome` |
| `criar`/`atualizar`/`remover` | CRUD da definição; chave imutável; trava de mudança de tipo com valores preenchidos |
| `valoresDoProduto`/`valoresDoProdutoTx` | Formulário do produto: **toda** definição ativa + valor quando houver; recortes `apenasAgente`/`apenasPreenchidos` |
| `gravarValores` | Grava o formulário inteiro, validando e normalizando cada valor contra o tipo da definição |
| `normalizarValorDoCampo` | Texto digitado → formato canônico por tipo (número, booleano, data, lista) |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Chave única mesmo para excluídos (`criar`) 🟢

A constraint `@@unique([empresaId, chave])` não distingue excluído: tentar recriar uma
chave de um campo soft-deleted falha no banco. O serviço antecipa isso com uma consulta
própria e devolve mensagem diferente conforme o achado esteja ou não excluído — evita o
usuário tentar de novo a mesma chave sem entender por quê.

#### 3.2 Trava de mudança de tipo com valores preenchidos (`atualizar`) 🟢

Mudar o `tipo` de um campo já preenchido (`texto` → `numero`, por exemplo) quebraria a
leitura em quem já confia no formato canônico (tela, IA, relatório). `atualizar` conta
`produtoCampoValor` pelo campo antes de aceitar a troca de tipo; havendo qualquer valor
gravado, recusa com `ConflictException` e orienta a criar um campo novo em vez de migrar o
existente. Campo `lista` sempre precisa de ao menos 1 opção (validado tanto aqui quanto no
schema Zod, nas duas entradas — criação e atualização).

#### 3.3 Normalização de valor por tipo (`normalizar-valor.ts`) 🟢

Módulo isolado "para poder ser testado direto — é a regra mais fácil de quebrar sem
ninguém perceber" (comentário do autor). Entrada tolera o formato local; saída é sempre o
canônico:
- **número**: aceita `1.234,5` (ponto = milhar, vírgula = decimal, formato brasileiro) —
  `Number("1.234,5")` direto daria `NaN`, e sem remover o ponto de milhar o valor sairia
  mil vezes menor. Saída: `Number` convertido para string (ponto decimal).
- **booleano**: aceita `sim/não/s/n/1/0/x/true/false` (case-insensitive); saída sempre
  `"true"`/`"false"` literal.
- **data**: aceita `DD/MM/AAAA` (o que a pessoa digita) e ISO (o que `<input type="date">`
  manda); valida que a data não "rolou" — `new Date('2026-02-31')` não lança em JS, apenas
  avança para 03/03, então o código recompara o ISO resultante com o original para pegar
  dias inexistentes.
- **lista**: compara a opção sem diferenciar maiúscula, mas grava **como cadastrada** —
  evita o mesmo valor aparecer de formas diferentes ao filtrar depois.
- Qualquer valor que não valida lança `BadRequestException` com o nome do campo na
  mensagem — nunca grava um valor que não bate com o tipo.

#### 3.4 `gravarValores` — formulário inteiro, apagar por valor vazio 🟢

Recusa (não ignora) campo inexistente/excluído/desativado referenciado no payload — do
contrário a tela diria "salvo" com o valor não gravado. Valor vazio e campo obrigatório →
`BadRequestException`; valor vazio e campo opcional → `deleteMany` do valor (limpar um
campo não precisa de rota própria). Valor não vazio passa por `normalizarValorDoCampo`
antes do `upsert` (chave composta `empresaId_produtoId_campoId`).

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `produto-campos`.

### 5. Metadados e configurações 🟢

| Constante/Regra | Valor | Uso |
|---|---|---|
| `produtoCampoTipoSchema` | `texto`/`texto_longo`/`numero`/`booleano`/`data`/`lista` | tipos de campo complementar |
| `produtoCampoChaveSchema` (regex) | `^[a-z0-9]+(-[a-z0-9]+)*$`, 2–40 chars | formato da chave estável, referenciada pela IA/integrações |
| `opcoes` | máx. 50, cada até 60 chars | opções de campo `lista` |
| `produtoCamposGravarSchema.valores` | máx. 200 itens, `valor` até 2000 chars | tamanho do payload de gravação em lote |

### 6. Segurança / integridade 🟢

- `visivelAgente` por campo é o mesmo mecanismo de recorte "acesso é código" usado em
  `produtos` (fichas técnicas) — campo de uso interno (custo, margem) não sai no
  `apenasAgente: true`.
- 🟡 **Duas leituras independentes do mesmo recorte**: `ProdutoCamposService.valoresDoProdutoTx`
  filtra `visivelAgente` para a ferramenta de IA, mas `ProdutoParaAgenteService.camposVisiveis`
  (módulo `produtos`) refaz a mesma consulta (`produtoCampo`/`produtoCampoValor` com
  `visivelAgente: true`) em vez de reaproveitar este serviço — duas cópias da mesma regra
  de acesso correm o risco de divergir se uma for alterada sem a outra.
- Exclusão de definição é lógica e não apaga `ProdutoCampoValor` — o cadastro do produto
  sobrevive à restauração do campo; só a tela de preenchimento some.

### 7. Dependências do módulo 🟢

`PrismaService`, `@plataforma/contracts`. Exportado para `produtos`
(`ProdutoParaAgenteService`, lido de forma paralela — ver 6) e para a ferramenta de IA via
`ProdutoCamposService` (export do módulo).

### 8. Cobertura de testes 🟢

1 arquivo de spec: `normalizar-valor.spec.ts`, cobrindo os 4 tipos com conversão
(número com formato brasileiro, booleano, data com rolagem inválida, lista). Sem spec para
`ProdutoCamposService` (trava de tipo com valores preenchidos, `gravarValores`).

---

## Módulo `cliente-campo-config`

**Caminho:** `apps/api/src/modules/cliente-campo-config/`
**Arquivos (4):** `cliente-campo-config.module.ts`, `cliente-campo-config.controller.ts`,
`cliente-campo-config.service.ts`, `dto/cliente-campo-config.dto.ts`. Sem spec.

### 1. Responsabilidade 🟢

Módulo pequeno e de propósito único: quais campos do cadastro de Cliente a empresa decide
travar para edição (ex.: "razão social" e "CNPJ/CPF" só o ERP altera). Não é RBAC — é
configuração por empresa, consultada por qualquer usuário autenticado (o próprio
formulário de Cliente a usa para desabilitar campo na tela) e **reforçada no servidor**
pelos serviços de `clientes` que de fato gravam.

### 2. Fluxo de controle — serviços e funções principais 🟢

| Função | Responsabilidade |
|---|---|
| `obterConfig` | Mapa campo → editável para toda a lista canônica de campos configuráveis; campo sem linha = editável (default) |
| `atualizar` | Upsert por campo (`empresaId_campo`) e devolve a config recalculada |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Lista canônica derivada do schema de Cliente (`CAMPOS_CLIENTE_CONFIGURAVEIS`) 🟢

Em `@plataforma/contracts`, a lista de campos configuráveis é `Object.keys(clienteCreateSchema.shape)`
mais `"cnaes"` (que não é coluna do cliente, mas a pergunta "quem pode mexer nisso?" é a
mesma). Decisão deliberada contra duplicar nomes de campo à mão: um campo novo no schema
de Cliente aparece aqui automaticamente, sem exigir um segundo lugar para lembrar de
atualizar.

#### 3.2 "Sem configuração = editável" (rollout sem quebra) 🟢

`obterConfig` usa `porCampo.get(campo) ?? true` — campo sem linha gravada em
`ClienteCampoConfig` é tratado como editável. Isso permite a lista canônica crescer (novo
campo no cliente) sem precisar de uma migration de dados que insira uma linha para cada
empresa existente; o travamento é opt-in, por empresa.

#### 3.3 Reforço server-side, e não só na tela 🟢

Quem de fato aplica a trava não é este módulo — é cada serviço de `clientes` que grava
(`ClientesService.update`, `ClienteCnaesService`, `ClientesReceitaLoteService`). O padrão
observado em `ClientesService.update` é **filtrar em silêncio**: campos com
`config[campo] === false` são removidos do `input` antes de aplicar a alteração — a
chamada não falha, apenas ignora o campo travado. Comentário explícito no código do módulo
`clientes` registra que isso existe justamente para quem tentasse forçar via API direta,
não só pela UI.

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `cliente-campo-config`.

### 5. Metadados e configurações 🟢

| Constante | Valor | Uso |
|---|---|---|
| `CAMPOS_CLIENTE_CONFIGURAVEIS` | chaves de `clienteCreateSchema` + `"cnaes"` | universo de campos que podem ser travados |

### 6. Segurança / integridade 🟢

- `GET /clientes-config/campos` é deliberadamente **sem** `@RequirePermission` (comentário
  explícito no controller) — qualquer usuário autenticado consulta, porque o próprio
  formulário de Cliente precisa saber o que desabilitar antes de qualquer ação de escrita.
- `PATCH /clientes-config/campos` exige `clientes-config.editar` — só quem administra a
  empresa decide o que trava.
- A trava em si não é controle de acesso a dado (RLS) — é regra de negócio consultada e
  aplicada por código em cada serviço consumidor; este módulo não impede nada por conta
  própria, só guarda a configuração. Risco correspondente: um novo caminho de escrita em
  `clientes` que esqueça de chamar `obterConfig` reabriria a edição do campo travado — ver
  também a nota equivalente em `produtos.CAMPOS_DO_ERP`, mesmo padrão.

### 7. Dependências do módulo 🟢

`PrismaService`, `@plataforma/contracts` (`CAMPOS_CLIENTE_CONFIGURAVEIS`,
`clienteCreateSchema` indiretamente). Consumido por `clientes`
(`ClientesService`, `ClienteCnaesService`, `ClientesReceitaLoteService`).

### 8. Cobertura de testes 🔴

Nenhum arquivo de spec. Módulo pequeno, mas a regra "sem configuração = editável" e o
upsert por `empresaId_campo` não têm teste dedicado.

---

## Módulo `estoque`

**Caminho:** `apps/api/src/modules/estoque/`
**Arquivos (4):** `estoque.module.ts`, `estoque.controller.ts`, `estoque.service.ts`,
`dto/estoque.dto.ts`, 1 spec.

### 1. Responsabilidade 🟢

Consulta **só-leitura** de saldo de estoque — "nada de create/update/delete manual"
(comentário explícito no código): o saldo entra só pelo import do legado (e no futuro por
API externa de manutenção). Listagem agregada por produto (soma em todos os armazéns de
revenda, ou só no armazém filtrado) e detalhe por produto aberto por armazém.

### 2. Fluxo de controle — serviços e funções principais 🟢

| Função | Responsabilidade |
|---|---|
| `findAll` | Listagem agregada por produto, com filtro de armazém/categoria/busca/`comSaldo`, ordenação incluindo por saldo agregado |
| `findByProduto` | Detalhe de um produto aberto por armazém (não some do total) |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Regra de "armazém de revenda" como filtro universal 🟢

`estoqueFilter`/`AND: [{ armazem: { revenda: true } }]` é aplicado em toda leitura de
estoque da plataforma (listagem, detalhe, ordenação por saldo) — decisão de negócio
datada de 29/09/2026 no comentário do código: só conta o estoque dos armazéns marcados
pelo ERP como de revenda (`MV_BJAPI16` no Protheus). Um armazém não-revenda com saldo
positivo não aparece em lugar nenhum da tela de Estoque.

#### 3.2 Visibilidade de armazém/produto inativo condicionada a saldo 🟢

Duplo filtro "inativo só aparece com saldo":
- **Armazém**: `OR: [{ armazem: { ativo: true } }, { armazem: { ativo: false }, saldo: { gt: 0 } }]`
  — uma linha de armazém desativado só entra na conta se ainda tiver saldo positivo
  (zerar o saldo tira a linha da leitura, mesmo sem reativar o armazém).
- **Produto**: mesma lógica — produto inativo só aparece na listagem/detalhe se tiver
  saldo em algum armazém de revenda; sem saldo, comporta-se como se não existisse
  (`findByProduto` lança `NotFoundException` mesmo existindo o cadastro).
- Produto também precisa estar em categoria `usado: true` **e** `ativo: true` (marcação
  da plataforma + status do ERP) para entrar na listagem — categoria não "usada" ou
  inativa no ERP tira o produto inteiro, independente de saldo.

#### 3.3 `comSaldo` — três modos de filtro sobre a mesma relação `estoques` 🟢

- `comSaldo === false`: produto cuja **toda** linha que conta (dentro de `estoqueFilter`)
  está zerada — combinação `some: estoqueFilter` + `every: { OR: [{ NOT: estoqueFilter },
  { saldo: { lte: 0 } }] }` (comentário do código resume como "toda linha que conta está
  zerada"; linha fora do filtro — não-revenda, por exemplo — não entra na verificação).
- `comSaldo === true`: ao menos uma linha dentro do filtro com saldo positivo.
- Sem `comSaldo` mas com `armazemId`: ao menos uma linha no armazém filtrado (sem exigir
  saldo positivo).

#### 3.4 Ordenação por saldo agregado — paginação em SQL cru 🟢

`sortBy === 'saldoTotal'` não é ordenável pelo Prisma (`ORDER BY` por soma agregada antes
do `LIMIT`): o service primeiro busca os ids candidatos respeitando o `where` de
visibilidade, depois roda um `$queryRaw` que agrega `SUM(e.saldo)` por produto com os
mesmos critérios de armazém revenda/ativo, pagina ali (`LIMIT`/`OFFSET`) e por fim busca
os produtos completos pelos ids ordenados, reordenando o resultado em memória
(`posicoes.get(a.id)! - posicoes.get(b.id)!`) porque o segundo `findMany` não garante a
ordem do `IN`. Testado em `estoque.service.spec.ts` (verifica o SQL gerado e a
reordenação, para `asc`/`desc`).

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `estoque`.

### 5. Metadados e configurações 🟢

Nenhuma constante de módulo — toda regra de negócio ("revenda", visibilidade por saldo) é
expressa diretamente nos filtros Prisma/SQL, documentada em comentário no topo do service.

### 6. Segurança / integridade 🟢

- Módulo é deliberadamente read-only: controller só expõe `GET`s, e o comentário no
  service reforça que não deve existir mutação manual de saldo — qualquer gravação é
  responsabilidade do import/API de integração (fora deste módulo).
- Mesmo critério de "categoria usada e ativa" e "produto com saldo mesmo inativo" é
  citado no módulo `produtos` (`query.categoriaAtiva`) como o mesmo da Consulta de
  Estoque — duas implementações independentes da mesma regra (🟡 risco de divergência se
  uma mudar sem a outra, mesmo padrão já anotado em `produto-campos`/`produtos`).

### 7. Dependências do módulo 🟢

`PrismaService`, `common/pagination/paginate` (`buildPaginatedResult`,
`paginationToSkipTake`), `@plataforma/contracts`. Sem dependência de outros módulos de
domínio — é consumido pela tela de Estoque e, por critério equivalente (não por import de
código), pela listagem de `produtos` com `categoriaAtiva`.

### 8. Cobertura de testes 🟡

1 spec (`estoque.service.spec.ts`), focado exclusivamente na ordenação por saldo agregado
e paginação via SQL cru. Sem spec para os filtros de visibilidade (revenda, inativo com
saldo, `comSaldo`) nem para `findByProduto`.

---

## Módulo `estrutura`

**Caminho:** `apps/api/src/modules/estrutura/`
**Arquivos (4):** `estrutura.module.ts`, `estrutura.controller.ts`,
`estrutura.service.ts`, `dto/estrutura.dto.ts`. Sem spec.

### 1. Responsabilidade 🟢

Catálogo global do menu lateral (Módulo → Menu/Submenu → Rotina) e o liga/desliga desse
catálogo por empresa e por plano de assinatura. Dois públicos bem distintos: administrador
da **plataforma** mantém o catálogo (cria módulo, menu, rotina — `PlatformAdminGuard`);
administrador da **empresa** decide o que a empresa usa dentro do que o plano permite
(`EmpresaModulo`/`EmpresaMenu`/`EmpresaRotina`).

### 2. Fluxo de controle — serviços e funções principais 🟢

| Função | Responsabilidade |
|---|---|
| `listModulos` | Árvore do menu para montar a navegação — só o que está ativo (catálogo + empresa + plano) |
| `listArvore` | Mesma árvore, mas **com** o que está inativo, marcado em `ativoNaEmpresa` — para a tela de administração religar |
| `desativadosDaEmpresa` | Calcula os sets de módulos/menus/rotinas desativados, combinando `Empresa*` (exceção manual) com o plano da assinatura (allowlist) |
| `definirModuloDaEmpresa`/`definirMenuDaEmpresa`/`definirRotinaDaEmpresa` | Upsert do liga/desliga por empresa |
| `createModulo`/`updateModulo`/`removeModulo`, idem `Menu`/`Rotina` | CRUD do catálogo global (sem `empresaId` — não passa por `withTenant`) |
| `validarMenuPai` | Regras de hierarquia de menu (máx. 2 níveis, não auto-referência, mesmo módulo) |

### 3. Algoritmos e lógica não-trivial

#### 3.1 "Ausência de linha = ligado" (dupla camada: exceção manual + allowlist do plano) 🟢

`desativadosDaEmpresa` combina duas fontes independentes num só conjunto de ids
desativados:
- **Exceção manual**: linha em `EmpresaModulo`/`EmpresaMenu`/`EmpresaRotina` com
  `ativo: false` — "ausência de linha significa ligado" (comentário explícito no schema),
  decisão para não precisar gravar uma linha por empresa × módulo a cada módulo novo, e
  para o módulo recém-criado já nascer disponível para todo mundo.
- **Allowlist do plano**: se a assinatura tem um plano com `planoModulos.size > 0` (plano
  restringe módulos), **todo** módulo que não está na lista do plano entra no conjunto de
  desativados, mesmo sem linha em `EmpresaModulo` — plano vazio (`size === 0`) não
  restringe nada (interpretado como "sem restrição definida", não "nada permitido").
  Mesma lógica independente para menus e rotinas.
- As duas fontes se somam (`Set.add`), nunca se cancelam: módulo banido pelo plano não
  pode ser reativado pela exceção manual da empresa (a exceção manual só liga/desliga
  dentro do que o plano já permite — o código não verifica essa precedência
  explicitamente, mas a soma dos sets garante o efeito). 🟡 (a precedência não é
  verificada por teste automatizado)

#### 3.2 `listModulos` filtra em cascata; `listArvore` só marca 🟢

`listModulos` remove do retorno módulo/menu/submenu/rotina desativados (filtro recursivo
nos 4 níveis) — é o que monta o menu lateral de verdade. `listArvore` devolve a árvore
**inteira**, incluindo inativos no catálogo global (`deletedAt: null` sem `ativo: true`),
e anota `ativoNaEmpresa` em cada nível — sem isso a tela de administração não teria como
religar o que foi desligado (um item filtrado não aparece para ser clicado de novo).

#### 3.3 Hierarquia de menu — máximo 2 níveis (`validarMenuPai`) 🟢

Regras, na ordem: não pode ser pai de si mesmo; o pai precisa existir; o pai precisa estar
no **mesmo módulo** do filho (`updateMenu` propaga a troca de módulo do pai para todos os
submenus via `updateMany`, para não deixar submenu órfão de módulo); o pai não pode já ser
submenu de outro (`pai.menuPaiId` truthy); e o menu que está se tornando submenu não pode
já ter os próprios submenus — a hierarquia trava em 2 níveis por construção, não por
constraint de banco.

#### 3.4 Exclusão de menu bloqueada por submenu (`removeMenu`) 🟢

Menu com submenus ativos não pode ser excluído (`BadRequestException`) — força "exclua ou
mova os submenus antes", em vez de um soft delete em cascata que deixaria submenu
apontando para um pai inexistente na prática.

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `estrutura`.

### 5. Metadados e configurações 🟢

Nenhuma constante de módulo além de `ROTINA_SELECT` (projeção fixa de campos de rotina
reaproveitada nas duas árvores).

### 6. Segurança / integridade 🟢

- `PlatformAdminGuard` (`user.administradorPlataforma`) protege toda mutação do catálogo
  global (`createModulo`/`updateModulo`/`removeModulo`, idem `Menu`/`Rotina`) —
  administrador de empresa comum não altera o que é compartilhado entre todos os
  tenants, mesmo tendo a permissão `estrutura.*` do próprio perfil. É o único módulo do
  inventário até aqui com guard de "administrador global" separado de RBAC por empresa.
- `definirModuloDaEmpresa`/`definirMenuDaEmpresa` (liga/desliga **da empresa**)
  deliberadamente **não** passam por `PlatformAdminGuard` — comentário explícito no
  controller: é controle do administrador da empresa, não do catálogo global.
- CRUD do catálogo (`Modulo`/`Menu`/`Rotina`) não usa `withTenant` — são entidades sem
  `empresaId`, sem RLS; `EmpresaModulo`/`EmpresaMenu`/`EmpresaRotina` têm `empresaId` e
  usam `withTenant`.

### 7. Dependências do módulo 🟢

`PrismaService`, `PlatformAdminGuard`, `@plataforma/contracts`. Lido por qualquer tela
autenticada para montar a navegação (`GET /modulos`); `desativadosDaEmpresa` depende de
`Assinatura`/`Plano` (módulos `assinaturas`/`planos`, ainda não analisados neste
inventário).

### 8. Cobertura de testes 🔴

Nenhum arquivo de spec. Lacuna notável na combinação exceção-manual + allowlist-do-plano
(3.1) e na hierarquia de 2 níveis de menu (3.3), ambas com várias ramificações de
validação sem cobertura automatizada.

---

## Módulo `fornecedores`

**Caminho:** `apps/api/src/modules/fornecedores/`
**Arquivos (4):** `fornecedores.module.ts`, `fornecedores.controller.ts`,
`fornecedores.service.ts`, `dto/fornecedor.dto.ts`. Sem spec.

### 1. Responsabilidade 🟢

Cadastro de fornecedor **espelhado do ERP**, só-leitura pela API interna: dados entram e
saem só pela API de integração (`/integracao/fornecedores`). Listagem com busca e filtro,
e detalhe por id.

### 2. Fluxo de controle — serviços e funções principais 🟢

| Função | Responsabilidade |
|---|---|
| `findAll` | Listagem paginada com busca (razão social, nome fantasia, CNPJ/CPF, código ERP) e filtros (`ativo`, `uf`) |
| `findOne` | Detalhe por id, 404 se não encontrado ou excluído |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Sem escopo hierárquico — diferente de Clientes 🟢

Comentário explícito no topo do service: fornecedor não tem carteira (não há
`vendedorId`), então não passa pelo `resolverEscopoVendedores` que `clientes` usa. Quem
enxerga a tela já é recorte de perfil (RBAC — só Administrador e Diretor, conforme a
migration `perm_compras` citada no comentário); o isolamento que resta é o de empresa, via
RLS/`withTenant`. Não há lógica de negócio adicional no módulo além de busca/paginação.

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `fornecedores`.

### 5. Metadados e configurações 🟢

| Constante | Valor | Uso |
|---|---|---|
| `SORT_FIELDS` | `razaoSocial`/`nomeFantasia`/`codigoErp`/`municipio`/`uf`/`ativo`/`createdAt` | whitelist de ordenação |

### 6. Segurança / integridade 🟢

- Puramente read-only pela API interna — nenhuma rota de escrita neste módulo; a
  superfície de mutação é só a API de integração (fora deste inventário de módulo).
- RLS por `empresaId` via `withTenant`; sem exceção de "modo sistema" aqui (fornecedor não
  está na lista de entidades com RLS por grupo econômico do CLAUDE.md do projeto).

### 7. Dependências do módulo 🟢

`PrismaService`, `common/pagination/paginate`, `@plataforma/contracts`. Consumido por
`produtos` (seleção de fabricante/fornecedor em `opcoesFiltro`) e por `notas-entrada`/
`notas-saida` (relação `Fornecedor`, ainda não analisados).

### 8. Cobertura de testes 🔴

Nenhum arquivo de spec. Módulo pequeno e sem lógica de negócio complexa, mas sem
cobertura nenhuma mesmo assim.

---

## Módulo `notas-entrada`

**Caminho:** `apps/api/src/modules/notas-entrada/`
**Arquivos (4):** `notas-entrada.module.ts`, `notas-entrada.controller.ts`,
`notas-entrada.service.ts`, `dto/nota-entrada.dto.ts`, `notas-entrada.service.spec.ts`.

### 1. Responsabilidade 🟢

Consulta read-only das notas fiscais de **compra**, espelho do ERP (SF1): listagem
paginada e detalhe com itens embutidos (sem rotina própria de item). `tipo` separa dois
documentos: `'N'` compra (participante = fornecedor) e `'D'` devolução de venda
(participante = cliente). Os dados entram só pela API de integração
(`integracao/notas-entrada`, módulo irmão fora deste — ver §7); este módulo não tem
create/update/delete.

### 2. Fluxo de controle — funções principais 🟢

| Função | Entrada | Saída | Complexidade |
|---|---|---|---|
| `findAll(empresaId, query)` | filtros (`ativo`, `fornecedorId`, `clienteId`, `tipo`, `ano`, `mes`, `search`) + paginação/ordenação | lista paginada com `fornecedor`/`cliente` embutidos | Baixa |
| `findOne(empresaId, user, id)` | id da nota | nota com fornecedor, cliente, condição de pagamento e itens (com produto/armazém) | Média — ramifica por permissão (§3.1) |

### 3. Algoritmos e lógica não-trivial

#### 3.1 Duas portas de acesso ao detalhe (`findOne`) 🟢

Quem tem `notas-entrada.visualizar` (ou é admin) vê qualquer nota, sem restrição — é a
tela de Compras. Quem chega só por `posicao-cliente.visualizar` (a aba Devoluções da
Posição de Cliente) **não pode** usar o id da nota como chave livre: o `where` é forçado
a `tipo: 'D'` e a `cliente.vendedorId` dentro do escopo de carteira do usuário
(`resolverEscopoVendedores` — mesmo mecanismo usado em `clientes`), ou `cliente: {isNot:
null}` quando o escopo é a carteira inteira (vendedor sem restrição/gerência). O
comentário no código é explícito sobre o motivo: a nota de compra carrega **custo**, e o
id não pode ser a chave que abre esse dado para quem só devia ver a própria devolução.
Coberto por `notas-entrada.service.spec.ts` (3 casos: acesso pleno, escopo restrito,
escopo de carteira inteira).

#### 3.2 Sem escopo hierárquico em `findAll` 🟢

Comentário explícito no topo do service: compra não tem carteira de vendedor — quem
enxerga a listagem já é recorte de perfil (a migration `perm_compras` restringe a rotina
a Administrador/Diretor). `findAll` não chama `resolverEscopoVendedores`; o único corte é
`empresaId` via RLS/`withTenant`. Difere de `findOne`, que tem a segunda porta de acesso
do §3.1.

### 4. Estruturas de dados 🟢

Ver `data-dictionary.md`, seção `notas-entrada`.

### 5. Metadados e configurações 🟢

| Constante | Valor | Uso |
|---|---|---|
| `SORT_FIELDS` | `numero`/`dtEmissao`/`dtEntrada`/`vlrItens`/`vlrBruto`/`ativo`/`createdAt` | whitelist de ordenação; fora da lista cai no default |
| default de ordenação | `dtEmissao desc` | quando `sortBy` não é informado ou não está na whitelist |

### 6. Segurança / integridade 🟢

- RLS por `empresaId` via `withTenant` em ambas as funções.
- `findOne` tem dupla porta de permissão (`RequirePermission` com dois pares
  rotina/ação — ver `require-permission.decorator`), e o service reforça a segunda porta
  com filtro de dados (§3.1); a permissão por si só não bastaria para impedir acesso a
  notas de compra (tipo `'N'`) por quem só tem `posicao-cliente.visualizar`.
- Sem rota de escrita nesta API interna — mutação só pela API de integração, que valida
  `apiKeyId` e resolve `fornecedorChave`/`clienteChave`/`produtoChave`/`armazemChave` por
  tenant antes de gravar (fora do escopo deste módulo).

### 7. Dependências do módulo 🟢

`PrismaService`, `common/pagination/paginate`, `resolverEscopoVendedores`
(`common/escopo/escopo-vendedores`), `@plataforma/contracts`. Espelhado pelo módulo de
escrita `integracao/notas-entrada` (`IntegracaoNotasEntradaService`), que faz o upsert
por `chave` (X2_UNICO), resolve referências do ERP, denormaliza `fornecedorId`/
`clienteId`/`dtEmissao`/`ano`/`mes` em cada item e recalcula a flag `comodato` do
cabeçalho a partir do CFOP dos itens (`common/comodato`) — ver `NotaEntrada`/
`NotaEntradaItem` no `data-dictionary.md` para os campos que só a integração escreve
(`duplicata`/`geraDuplicata`, `aliqIpi`/`aliqIcms`). Consultado por `clientes.posicao`
(aba Devoluções) e por `relatorios` (apuração de compra, ainda não analisado).

### 8. Cobertura de testes 🟢

`notas-entrada.service.spec.ts` cobre as 3 ramificações de permissão do `findOne`
(§3.1). `findAll` e os filtros de busca (`search` por número/chaveNfe/razão social) não
têm teste.
