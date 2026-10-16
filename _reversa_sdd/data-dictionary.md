# Dicionário de Dados — plataforma-comercial (rcg)

> Gerado pelo Archaeologist a partir de `apps/api/prisma/schema.prisma`.
> Escala de confiança: 🟢 CONFIRMADO · 🟡 INFERIDO · 🔴 LACUNA

---

## Módulo `auth`

### `Usuario` (tabela `usuarios`) 🟢

Conta de login. Pertence a um `GrupoEconomico` (perfil, superior e dados pessoais são do
usuário, válidos em todas as empresas do grupo — decisão de 30/09/2026, antes moravam em
cada vínculo `UsuarioEmpresa`).

| Campo | Tipo | Obrigatório | Default | Observação |
|---|---|---|---|---|
| `id` | String (uuid) | sim | gerado | PK |
| `grupoEconomicoId` | String? | não | — | FK `GrupoEconomico` |
| `perfilId` | String | sim | — | FK `Perfil` (RBAC, global) |
| `superiorId` | String? | não | — | auto-relação hierárquica (`UsuarioHierarquia`) |
| `codigoErp` | String? | não | — | integração com ERP externo |
| `nomeReduzido` | String? | não | — | |
| `nome` | String | sim | — | |
| `email` | String | sim | — | `@unique` global |
| `senhaHash` | String | sim | — | bcrypt, 12 rounds |
| `ativo` | Boolean | sim | `true` | login recusado se `false` |
| `ultimoLogin` | DateTime? | não | — | |
| `primeiroAcessoConcluidoEm` | DateTime? | não | — | marco de conclusão (ver 3.7 do code-analysis) |
| `avatarUrl` | String? | não | — | |
| `mfaEnabled` | Boolean | sim | `false` | não referenciado no fluxo de login atual 🔴 |
| `nomeWhatsapp` | String? | não | — | assinatura nas mensagens WhatsApp |
| `usarNomeWhatsapp` | Boolean | sim | `true` | liga/desliga sem apagar `nomeWhatsapp` |
| `telefone` / `celular` | String? | não | — | |
| `dataNascimento` | DateTime? | não | — | mesma em todas as empresas do grupo |
| `tentativasFalhas` | Boolean/Int | sim | — | lockout de login (não mostrado no trecho lido, referenciado em `auth.service.ts`) |
| `bloqueadoAte` | DateTime? | não | — | lockout temporário |
| `deveTrocarSenha` | Boolean | sim | — | força troca no próximo login |
| `senhaAlteradaEm` | DateTime? | não | — | idade da senha para expiração por política |

### `UsuarioEmpresa` (tabela `usuario_empresas`) 🟢

Vínculo usuário × empresa. Um usuário pode ter vínculo ativo com várias empresas do mesmo
grupo (multiempresa).

| Campo | Tipo | Obrigatório | Default | Observação |
|---|---|---|---|---|
| `id` | String (uuid) | sim | gerado | PK |
| `usuarioId` | String | sim | — | FK `Usuario` |
| `empresaId` | String | sim | — | FK `Empresa` |
| `ativo` | Boolean | sim | `true` | vínculo desativado não autentica nesta empresa |
| `rotinaInicialId` | String? | não | — | FK `Rotina`, tela inicial escolhida pelo usuário; nulo cai no `Perfil.rotinaInicial` |
| soft delete (`deletedAt`, `createdBy`, `updatedBy`, `deletedBy`) | — | — | — | padrão de auditoria do projeto |

`@@unique([usuarioId, empresaId])` — um vínculo por par usuário/empresa.

### `RefreshToken` (tabela `refresh_tokens`) 🟢

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `id` | String (uuid) | sim | PK |
| `usuarioId` | String | sim | FK `Usuario` |
| `empresaId` | String? | não | empresa ativa no momento da emissão |
| `tokenHash` | String | sim | `@unique`; SHA-256 do token — valor em claro **nunca** persistido |
| `expiresAt` | DateTime | sim | `now() + 7 dias` (`REFRESH_TTL_MS`) |
| `revokedAt` | DateTime? | não | setado na rotação (sempre) ou no corte por expediente/logout |
| `sessaoId` | String? | não | FK `Sessao` — carregado adiante a cada rotação, para o logout saber qual sessão encerrar |
| `ip`, `userAgent` | String? | não | metadados da requisição |

Sem RLS — é escrito no login, antes de existir empresa ativa no contexto de RLS (mesmo
motivo documentado para `Sessao`).

### `Sessao` (tabela `sessoes`) 🟢

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `id` | String (uuid) | sim | PK |
| `usuarioId` | String | sim | FK `Usuario` |
| `empresaId` | String? | não | empresa em que a sessão foi aberta |
| `iniciadaEm` | DateTime | sim | `now()` |
| `ultimaAtividadeEm` | DateTime | sim | avança a cada rotação de refresh (~15 min) e troca de empresa — não a cada requisição |
| `encerradaEm` | DateTime? | não | nulo enquanto aberta |
| `motivoFim` | String? | não | `"logout"`, `"troca_empresa"` (não encerra na prática, reaproveita), `"fora_horario"`, `"novo_acesso"` |
| `ip`, `userAgent` | String? | não | |

Índices: `[usuarioId, iniciadaEm]`, `[usuarioId, encerradaEm]`.

### Enum `AcessoEvento` 🟢

`login_sucesso`, `login_falha`, `login_bloqueado`, `login_fora_horario`,
`acesso_fora_horario`, `logout`, `troca_empresa`, `sessao_substituida`,
`sessao_desconectada`, `senha_redefinicao_pedida`, `senha_redefinida`.

### DTOs de entrada/saída (Zod, em `@plataforma/contracts`) 🟢

Todos os DTOs do controller são gerados via `createZodDto()` a partir de schemas
centrais do pacote `contracts` (fonte única compartilhada com `apps/web`):
`loginSchema`, `refreshInputSchema`, `authTokensSchema`, `currentUserSchema`,
`switchEmpresaInputSchema`, `changePasswordSchema`, `updateOwnProfileSchema`,
`updateRotinaInicialSchema`, `completeFirstAccessSchema`, `avatarPadraoSchema`.

| DTO | Campos (inferidos do uso em `auth.service.ts`) |
|---|---|
| `LoginInput` | `email`, `senha`, `empresaAlias?` |
| `RefreshInput` | `refreshToken` |
| `ChangePasswordInput` | `senhaAtual`, `novaSenha` |
| `CompleteFirstAccessInput` | `nome`, `telefoneInstitucional`, `dataNascimento` (string `YYYY-MM-DD`) |
| `AvatarPadraoInput` | `avatar` (enum de nomes de avatar padrão) |

### Payload do JWT (access token) 🟢

```ts
{
  sub: string;              // usuarioId
  nome: string;
  email: string;
  empresaAtivaId: string;
  isAdmin: boolean;          // = perfil.sistemaBase
  administradorPlataforma?: boolean; // = perfil.administraPlataforma
  permissoes: string[];      // "<codigoRotina>.<acao>", vazio se isAdmin
  sid?: string;               // sessaoId
}
```

---

## Módulo `clientes`

### `Cliente` (tabela `clientes`) 🟢

Cadastro com ~40 campos. Origem predominante: import do ERP (`chave`/`codigoErp`).

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId` | String | multi-tenant, RLS |
| `vendedorId` | String? | FK `Vendedor` — dono da carteira |
| `tabelaPrecoId`, `condicaoPagamentoId` | String? | FK |
| `chave` | String? | chave de integração ERP (`X2_UNICO`, formato FILIAL-COD); presença bloqueia exclusão via API |
| `codigoErp` | String? | informativo; presença também bloqueia exclusão |
| `tipoPessoa` | enum `TipoPessoa` | `juridica` (default) / física |
| `razaoSocial` | String | obrigatório |
| `nomeFantasia`, `cnpjCpf`, `inscricaoEstadual`, `inscricaoMunicipal` | String? | |
| `contribuinteIcms` | Boolean? | |
| `endereco`, `complemento`, `bairro`, `municipio`, `uf`, `cep`, `latitude`, `longitude` | | endereço completo |
| `ativo` | Boolean | default `true` |
| `carteira` | Boolean? | flag de filtro (uso 🔴 não detalhado neste módulo) |
| `limiteCredito`, `vencimentoLimite` | | |
| `dataBloqueio`, `observacaoBloqueio`, `dataReativacao`, `observacaoReativacao` | | bloqueio manual do cliente |
| `primeiraCompra`, `ultimaVisita`, `ultimaCompra`, `ultimoAtendimento`, `dataConsultaRfb` | DateTime? | marcos calculados/importados |

`@@unique([empresaId, chave])`. Relações: `notasSaida`, `notasEntrada` (devoluções),
`titulosReceber`, `oportunidades`, `atividades`, `comodatoBaixas`, `orcamentos`, `cnaes`,
`alteracoes`, `historico`, `enviosErp`, `sugestoesCompra`, `whatsappContatos`,
`whatsappConversas`, `contatosPortal`, `portalHabilitacao`.

### `ClienteContato` (tabela `cliente_contatos`) 🟢

Pessoa de contato do cliente (não confundir com usuário/login). Usado pelo Portal do
Cliente e pela vinculação de WhatsApp.

| Campo | Tipo | Observação |
|---|---|---|
| `nome`, `email` (`@@unique` por cliente), `telefone`, `celular`, `cargo` | | |
| `principal` | Boolean default `false` | só um por cliente (aplicação em `criarContato`) |
| `ativo` | Boolean default `true` | |
| `perfilId` | FK `PortalClientePerfil?` | |

### `ClienteAlteracao` (fila de aprovação) 🟢

| Campo | Observação |
|---|---|
| `origem` | enum `OrigemAlteracaoCliente`: manual / integração (ERP) / enriquecimento (Receita) / agente 🟡 |
| `status` | `pendente` / `aprovada` / `rejeitada` |
| `alteracoes` | JSON `DiffAlteracao` — `{ campo: { de, para } }` |
| `justificativa`, `motivoRecusa` | |
| `solicitadoPor`, `solicitadoEm`, `analisadoPor`, `analisadoEm` | auditoria |

Dedupe: índice parcial único por `(empresaId, clienteId, origem, status='pendente')` 🟡
(mencionado no código, não visto diretamente no schema lido).

### `ClienteHistorico` (tabela, histórico imutável) 🟢

Uma linha por **campo** alterado (não por solicitação): `campo`, `valorAnterior`,
`valorNovo`, `status` (`aplicado`/`reprovado`), `origem`, `autor`, `alteracaoId`,
`criadoEm`. Cobre inclusive campos reprovados na aprovação parcial.

### `ClienteEnvioErp` (fila de envio ao ERP) 🟢

`alteracaoId`, `campos` (lista de nomes no formato do contrato de integração),
`situacao`, `enviadoEm`. Gerado só quando a origem não é `integracao` (evita eco) e há ao
menos 1 campo na whitelist `CAMPOS_ENVIO_ERP`.

### `ClienteCnae` (tabela, vínculo N:N com soft delete) 🟢

| Campo | Observação |
|---|---|
| `clienteId`, `cnaeId` | `@@unique` ignora soft delete — reaproveita linha ao invés de recriar |
| `principal` | Boolean — só um `true` por cliente (invariante aplicado em código, não em constraint) |

### `ClienteReceitaExecucao` (execução em lote) 🟢

| Campo | Observação |
|---|---|
| `situacao` | `rodando` / `concluida` / `falhou` |
| `parametros` | JSON do `ClientesReceitaLoteBody` (filtros do lote) |
| `resultado` | JSON `ClientesReceitaLoteResultado` (contadores, gravado incrementalmente) |
| `erro` | truncado em 1000 caracteres |

Uma execução "rodando" por empresa (constraint que gera `P2002` em concorrência → 409).

### `ComodatoBaixa` (tabela `comodato_baixas`) 🟢

| Campo | Observação |
|---|---|
| `produtoId`, `clienteId`, `quantidade` | baixa o saldo **inteiro** no momento |
| `motivo` | opcional |
| `desfeitaEm`, `desfeitaPor` | soft-revert — baixa some do cálculo de saldo quando desfeita |

### DTOs principais (Zod, `@plataforma/contracts`) 🟢

`ClienteCreate`, `ClienteUpdate`, `ClienteQuery`, `ClienteContatoCreate`,
`PosicaoClienteListQuery`/`Row`, `ClienteAlteracaoQuery`, `DiffAlteracao`,
`OrigemAlteracaoCliente`, `ClienteCnaeCreate`, `ComodatoBaixaCriar`,
`ClientesReceitaLoteBody`, `ClientesReceitaExecucao`, `ClientesReceitaLoteResultado`,
`ConsultaCnpjResultado`, `CnaeSugerido`, `ClienteCamposConfig`.

---

## Módulo `empresas`

### `Empresa` (tabela, tenant) 🟢

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `grupoEconomicoId` | String | obrigatório — toda empresa pertence a um grupo (decisão de 30/09/2026) |
| `tipoPessoa` | enum `TipoPessoa` | default `juridica` |
| `razaoSocial`, `nomeFantasia` | String | obrigatórios |
| `cnpj` | String | `@unique` global |
| `alias` | String? | `@unique` global — URL de login |
| `logoUrl`, `logoDanfeUrl`, `bannerImagemUrl` | String? | caminhos de upload |
| `ePlataforma` | Boolean default `false` | marca a empresa gestora da plataforma SaaS — campo exclusivo da plataforma |
| `situacao` | enum `SituacaoEmpresa` default `ativa` | **fonte única** de "pode acessar"; substituiu um `ativo` booleano redundante — campo exclusivo da plataforma |
| `testeExpiraEm` | DateTime? | só relevante com `situacao = teste`; nulo = sem prazo — campo exclusivo da plataforma |
| `limiteUsuarios` | Int? | teto de vínculos ativos; nulo = sem limite — campo exclusivo da plataforma |
| `fusoHorario` | String default `"America/Campo_Grande"` | IANA timezone, usado para calcular horário local por empresa |
| `bannerAtivo` | Boolean default `false` | liga a faixa institucional (separado do upload da imagem) |
| `bannerCor` | String? | hex `#rrggbb`; nulo usa cor do tema |
| `inscricaoEstadual`, `inscricaoMunicipal`, `endereco`, `complemento`, `bairro`, `municipio`, `uf`, `cep` | String? | identificação fiscal/endereço para documentos emitidos (ex. PDF de orçamento) |

Sem RLS por `empresaId` (é a própria linha do tenant) — RLS nela é por grupo econômico
(ver nota no CLAUDE.md do projeto).

### DTOs (Zod) 🟢

`EmpresaCreate` (inclui `grupoEconomicoId?`), `EmpresaUpdate`, `EmpresaQuery` (`situacao?`,
`search?`, `sortBy?`, `sortOrder?`, paginação).

---

## Módulo `grupos-economicos`

### `GrupoEconomico` (tabela `grupos_economicos`) 🟢

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `descricao` | String | nome do grupo; empresa removida ganha grupo próprio com seu `nomeFantasia` como descrição |
| `assinatura` | `Assinatura?` | plano contratado (limites de empresas/usuários) |
| `empresas` | `Empresa[]` | relação 1:N |
| `usuarios` | `Usuario[]` | relação 1:N — conta pertence a um único grupo |
| `perfis` | `Perfil[]` | perfis (RBAC) específicos do grupo |
| soft delete | `deletedAt` | grupo esvaziado (sem empresas) é soft-deletado automaticamente |

Sem RLS por `empresaId` — é RLS **por grupo econômico** (junto com `Usuario`, `Empresa`,
`Perfil`), conforme documentado no CLAUDE.md do projeto.

### DTOs (Zod) 🟢

| DTO | Campos |
|---|---|
| `GrupoEconomicoInput` | `descricao`, `empresaIds: string[]` |
| `GrupoUsuarioInput` | `usuarioId?`, `novo?: { nome, email, senha }`, `vinculos: { empresaId, perfilId }[]` |
| `GrupoUsuario` (retorno) | `id`, `nome`, `email`, `vinculos: { empresaId, ativo, perfilId }[]` |

## Módulo `usuarios`

> `Usuario` e `UsuarioEmpresa` já estão documentados na seção `auth` (acima) — ambos são
> usados por este módulo (CRUD e vínculo), não repetidos aqui.

### `UsuarioHorario` (tabela `usuario_horarios`) 🟢

Faixa de expediente de um usuário, no máximo uma por dia da semana. Sem `empresaId` e
sem RLS: a trava é da conta, não do vínculo com uma empresa (mesmo precedente da
política de senha). Dia da semana sem linha = sem acesso naquele dia, somente quando
`Usuario.restringirHorario` está ligado.

| Campo | Tipo | Obrigatório | Default | Observação |
|---|---|---|---|---|
| `id` | String (uuid) | sim | gerado | PK |
| `usuarioId` | String | sim | — | FK `Usuario` |
| `diaSemana` | Int | sim | — | 0 = domingo … 6 = sábado |
| `horaInicio` | String | sim | — | texto `"HH:MM"`, hora de parede (fuso America/Campo_Grande), de propósito não é `DateTime` |
| `horaFim` | String | sim | — | idem |
| soft delete | — | — | — | não tem (`createdAt`/`updatedAt`/`createdBy`/`updatedBy` apenas) |

`@@unique([usuarioId, diaSemana])` — no máximo uma faixa por dia.

### DTOs (Zod, de `@plataforma/contracts`) 🟢

| DTO | Campos | Observação |
|---|---|---|
| `UsuarioCreate` | `nome`, `email`, `senha`, `ativo`, `perfilId` | senha validada pela política da empresa antes do hash |
| `UsuarioUpdate` | campos simples (não inclui senha nem vínculos) | |
| `UsuarioQuery` | `perfilId?`, `ativo?`, `search?` + paginação/ordenação | `sortBy` restrito a `SORT_FIELDS` no service |
| `UsuarioEmpresaCreate` | `perfilId`, `superiorId?`, `codigoErp?`, `nomeReduzido?`, `dataNascimento?`, `celular?`/`telefone?` | usado por `vincularEmpresa` |
| `ResetPasswordInput` | `novaSenha`, `deveTrocarSenha` | reset por admin, sem exigir senha atual |
| `UsuarioHorariosUpdate` | `horarios: { diaSemana, horaInicio, horaFim }[]`, `restringirHorario` | substitui o conjunto inteiro |

## Módulo `perfis`

### `Perfil` (tabela `perfis`) 🟢

Papel RBAC. Global por natureza, mas com dono desde a migration
`20260930200000_perfil_por_grupo`: perfil da plataforma (`grupoEconomicoId` nulo) é
modelo para todos os grupos; perfil do grupo é cópia/personalização visível só às
empresas daquele grupo. Sem RLS por `empresaId` (é RLS por grupo econômico, junto com
`Usuario`/`Empresa`/`GrupoEconomico`).

| Campo | Tipo | Obrigatório | Default | Observação |
|---|---|---|---|---|
| `id` | String (uuid) | sim | gerado | PK |
| `nome` | String | sim | — | único por dono (ver `@@unique` abaixo) |
| `descricao` | String? | não | — | |
| `sistemaBase` | Boolean | sim | `false` | liga `isAdmin`: acesso total dentro da empresa; não pode ser excluído |
| `administraPlataforma` | Boolean | sim | `false` | acesso acima de qualquer empresa (área `/plataforma`); só seed/migration concedem, fora de `PerfilCreate`/`PerfilUpdate` |
| `ativo` | Boolean | sim | `true` | |
| `rotinaInicialId` | String? | não | — | FK `Rotina`, tela inicial padrão do perfil |
| `grupoEconomicoId` | String? | não | — | FK `GrupoEconomico`; nulo = perfil da plataforma |
| `carteiraCompleta` | Boolean | sim | `false` | vê a carteira de clientes inteira da empresa, sem recorte por vendedor; redundante com `sistemaBase`, que já vê tudo via `isAdmin` |
| soft delete | — | — | — | `deletedAt`/`createdBy`/`updatedBy`/`deletedBy` |

`@@unique([grupoEconomicoId, nome])` — nome único por dono; para os da plataforma
(grupo nulo) quem garante é o índice parcial `perfis_nome_plataforma_key` (criado via SQL
na migration, pois nulos não colidem em `@@unique` comum).

### `PerfilPermissao` (tabela `perfil_permissoes`) 🟢

| Campo | Tipo | Obrigatório | Default | Observação |
|---|---|---|---|---|
| `id` | String (uuid) | sim | gerado | PK |
| `perfilId` | String | sim | — | FK `Perfil` |
| `rotinaId` | String | sim | — | FK `Rotina` |
| `acao` | enum `Acao` | sim | — | ex.: `visualizar`, `cadastrar`, `editar`, `excluir` 🟡 (enum não lido neste módulo) |
| `permitido` | Boolean | sim | `false` | |

`@@unique([perfilId, rotinaId, acao])` — chave composta usada pelo upsert de
`updatePermissoes`.

### DTOs (Zod, de `@plataforma/contracts`) 🟢

| DTO | Campos | Observação |
|---|---|---|
| `PerfilCreate` | `nome`, `descricao?`, `sistemaBase?`, `ativo?`, `rotinaInicialId?`, `carteiraCompleta?` | sem `administraPlataforma`/`grupoEconomicoId` (decididos pelo service) |
| `PerfilUpdate` | subconjunto de `PerfilCreate` | |
| `PerfilQuery` | `ativo?`, `sistemaBase?`, `search?` + paginação/ordenação | `sortBy` restrito a `SORT_FIELDS` |
| `PerfilPermissoesUpdate` | `permissoes: { rotinaId, acao, permitido }[]` | upsert parcial — itens fora da lista não mudam |

## Módulo `acessos`

### `Sessao` (tabela `sessoes`) 🟢

Sem RLS — escrita no login, antes de existir empresa ativa (ver `AcessosService`,
isolamento em código).

| Campo | Tipo | Obrigatório | Default | Observação |
|---|---|---|---|---|
| `id` | String (uuid) | sim | gerado | PK |
| `usuarioId` | String | sim | — | FK `Usuario` |
| `empresaId` | String? | não | — | empresa ativa no momento (pode mudar em `tocarSessao` na troca de empresa) |
| `iniciadaEm` | DateTime | sim | `now()` | |
| `ultimaAtividadeEm` | DateTime | sim | `now()` | atualizada a cada refresh/troca de empresa |
| `encerradaEm` | DateTime? | não | — | nulo = sessão aberta |
| `motivoFim` | String? | não | — | `"logout"`, `"troca_empresa"`, `"fora_horario"`, etc., nulo enquanto aberta |
| `ip` / `userAgent` | String? | não | — | `userAgent` truncado em 300 chars |

Índices: `[usuarioId, iniciadaEm]`, `[usuarioId, encerradaEm]`.

### `AcessoLog` (tabela `acessos_log`) 🟢

Rastro de cada tentativa de autenticação, inclusive as que falharam. Sem RLS pelo mesmo
motivo de `Sessao`.

| Campo | Tipo | Obrigatório | Default | Observação |
|---|---|---|---|---|
| `id` | String (uuid) | sim | gerado | PK |
| `usuarioId` | String? | não | — | nulo quando o e-mail digitado não existe no cadastro |
| `email` | String | sim | — | gravado em minúsculas |
| `empresaId` | String? | não | — | |
| `evento` | enum `AcessoEvento` | sim | — | ver valores abaixo |
| `detalhe` | String? | não | — | |
| `ip` / `userAgent` | String? | não | — | `userAgent` truncado em 300 chars |
| `criadoEm` | DateTime | sim | `now()` | |

Índices: `[criadoEm]`, `[usuarioId, criadoEm]`.

**`AcessoEvento` (enum) 🟢:** `login_sucesso`, `login_falha`, `login_bloqueado`,
`login_fora_horario`, `acesso_fora_horario`, `logout`, `troca_empresa`,
`sessao_substituida` (sessão única por usuário — novo login encerra as outras),
`sessao_desconectada` (desconexão manual pela administração),
`senha_redefinicao_pedida`, `senha_redefinida`. `EVENTOS_FALHA` (filtro "somente sem
sucesso" do service) = `login_falha`, `login_bloqueado`, `login_fora_horario`,
`acesso_fora_horario`.

### `UsoRotina` (tabela `uso_rotinas`) 🟢

Contador de abertura de tela por usuário/rotina/dia. Tem RLS por tenant (lido/escrito
via `withTenant`).

| Campo | Tipo | Obrigatório | Default | Observação |
|---|---|---|---|---|
| `id` | String (uuid) | sim | gerado | PK |
| `empresaId` | String | sim | — | |
| `usuarioId` | String | sim | — | FK `Usuario`, `onDelete: Cascade` |
| `rotinaId` | String | sim | — | FK `Rotina`, `onDelete: Cascade` |
| `dia` | DateTime (`@db.Date`) | sim | — | no fuso da operação, sem hora |
| `acessos` | Int | sim | `0` | incrementado a cada chamada de `registrarUso` |
| `ultimoAcessoEm` | DateTime | sim | — | |

`@@unique([empresaId, usuarioId, rotinaId, dia])` — chave do upsert diário.

### DTOs (Zod, de `@plataforma/contracts`) 🟢

| DTO | Campos | Observação |
|---|---|---|
| `AcessoQuery` | `dataInicio?`, `dataFim?`, `usuarioId?`, `evento?`, `somenteFalhas?`, `search?` + paginação/ordenação | compartilhado pelas abas Eventos/Sessões/Uso-rotinas/Resumo |
| `RegistrarUso` (schema `registrarUsoSchema`) | `rota: string` | usado só por `UsoRotinaController` |

---

## Módulo `produtos`

### `Produto` (tabela `produtos`) 🟢

Origem predominante: import do ERP (`chave`/`codigoErp`). `chave` presente trava a edição
dos campos de `CAMPOS_DO_ERP` e impede exclusão via API (ver code-analysis).

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId` | String | multi-tenant, RLS |
| `codigoErp` | String | obrigatório |
| `chave` | String? | chave de integração (`X2_UNICO`); `@@unique([empresaId, chave])` |
| `descricao` | String | obrigatório, máx. 120 (contrato) |
| `unidade`, `marca`, `codigoBarras`, `codigoFornecedor`, `ncm` | String? | |
| `categoriaId`, `subCategoriaId` | String? | FK `Categoria` (duas relações nomeadas: `ProdutoCategoria`/`ProdutoSubCategoria`) |
| `armazemId` | String? | FK `Armazem` |
| `fabricanteId` | String? | FK `Fornecedor` |
| `codigoFabricante`, `descricaoFabricante` | String? | nomes antigos: na verdade código/descrição no **fornecedor** (B1_XFOR/B1_XDESFOR) |
| `codigoNoFabricante`, `descricaoNoFabricante` | String? | no fabricante de fato (B1_XCOD/B1_XXDESC) |
| `produtoAllia` | Boolean? | B1_XALLIA: 1=Sim/2=Não; nulo = não informado |
| `dadosTecnicos` | String? | 🔴 uso não detalhado neste módulo |
| `qtdEmbalagem`, `peso`, `ultimoPreco` | Float? | `ultimoPreco` nunca é lido por `ProdutoParaAgenteService` (ver segurança) |
| `exibirFotoOrcamento` | Boolean | default `false`; é config de exibição, não campo do produto para a IA |
| `ativo` | Boolean | default `true` |
| `regraDescontoId` | String? | FK `RegraDesconto` (SZ0); leitura apenas — só o ERP grava |
| `observacao` | String? | |

`@@unique([empresaId, chave])`. Relações: `estoques`, `tabelasPrecoItens`,
`notasSaidaItens`, `notasEntradaItens`, `orcamentoItens`, `sugestoesCompra`, `fotos`,
`camposValores` (módulo `produto-campos`), `relacionados`/`relacionadoDe`
(`ProdutoRelacionado`, duas pontas), `equipamentoComodato`, `comodatoEnviosErp`,
`comodatoBaixas`, `fichas`.

### `ProdutoFoto` (tabela `produto_fotos`) 🟢

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId` | String | |
| `produtoId` | String? | nulo = foto importada em lote sem correspondência, pendente de vínculo manual |
| `url` | String | caminho público; `onDelete: Cascade` do produto |
| `nomeArquivo` | String | nome original, sanitizado (`basename`, máx. 255) |
| `principal` | Boolean | default `false`; só uma por produto (gerenciado em código, não em constraint) |
| `ordem` | Int | default `0` |

### `ProdutoFicha` (tabela `produto_fichas`) 🟢

PDF do fabricante + Markdown extraído. Vários documentos por produto (ficha, FISPQ,
certificado).

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId`, `produtoId` | String | `produto` com `onDelete: Cascade` |
| `arquivo` | String | nome em disco (UUID + extensão); nunca o nome original |
| `arquivoNome`, `mime`, `tamanho` | | metadados do upload original |
| `titulo` | String | máx. 200 (contrato) |
| `markdown` | String | editável na tela; máx. 200.000 (contrato) |
| `visivelAgente` | Boolean | default `true`; `false` tira a ficha do alcance da IA sem apagar |
| `deletedAt`/`deletedBy` | | soft delete; remove o PDF do disco junto (serviço) |

### `ProdutoFichaTrecho` (tabela `produto_ficha_trechos`) 🟢

Pedaço indexável de uma ficha, com o vetor que o representa.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId`, `fichaId` | String | `ficha` com `onDelete: Cascade` |
| `produtoId` | String | desnormalizado da ficha — evita join extra na busca |
| `ordem` | Int | posição do trecho na ficha |
| `texto` | String | sempre o que foi gravado, mesmo sem vetor |
| `embedding` | `Unsupported("vector(768)")?` | dimensão fixa (nomic-embed-text/Ollama); nulo até vetorizar; tipo `Unsupported` — lido/escrito por SQL cru |
| `modelo` | String? | qual modelo gerou o vetor, para reindexar seletivamente ao trocar de modelo |

### `ProdutoFichaImportacao` (tabela `produto_ficha_importacoes`) 🟢

Fila de PDFs em processamento. Vínculo pelo **conteúdo**, não pelo nome do arquivo.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId` | String | |
| `arquivo`, `arquivoNome`, `mime`, `tamanho` | | metadados do upload |
| `situacao` | enum `FichaImportacaoSituacao` | `pendente` (default) / `processando` / `vinculada` / `sem_correspondencia` / `ambiguo` / `erro` |
| `codigoDetectado`, `nomeDetectado`, `titulo`, `markdown` | String? | o que o modelo leu — gravado mesmo quando não casa com nada, para explicar a pendência |
| `produtoId`, `fichaId` | String? | preenchidos só quando a importação vincula e grava |
| `erro` | String? | mensagem truncada a 500 chars, só quando `situacao = erro` |
| `tentativas` | Int | default `0`; 3 tentativas e desiste |
| `processadoEm` | DateTime? | |

### `ProdutoRelacionado` (tabela `produto_relacionados`) 🟢

Similar (simétrico) ou aplicação (direcional) entre dois produtos. Nada aqui vem do ERP.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId` | String | |
| `produtoId`, `relacionadoId` | String | FK `Produto`, `onDelete: Cascade` nos dois lados |
| `tipo` | enum `ProdutoRelacaoTipo` | `similar` / `aplicacao` |
| `observacao` | String? | máx. 200 (contrato); "por que estão relacionados" |
| `ordem` | Int | default `0` |

`@@unique([empresaId, produtoId, relacionadoId, tipo])`. Índice adicional por
`[empresaId, relacionadoId, tipo]` — a consulta pela ponta de destino ("em que
equipamentos este químico é usado") é tão comum quanto pela de origem.

### DTOs principais (Zod, `@plataforma/contracts`) 🟢

| DTO | Campos | Observação |
|---|---|---|
| `ProdutoCreate`/`ProdutoUpdate` | `codigoErp`, `descricao`, `unidade?`, `categoriaId?`, `subCategoriaId?`, `armazemId?`, `marca?`, `codigoBarras?`, `codigoFornecedor?`, `ncm?`, `qtdEmbalagem?`, `peso?`, `ultimoPreco?`, `observacao?`, `ativo` | `Update` = `Create.partial()`; strings vazias do form viram `null` no service (`limpar`) |
| `ProdutoQuery` | paginação + `ativo?`, `regraDescontoId?`, `categoriaIds?`/`categoriaId?`, `fabricanteIds?`, `subCategoriaId?`, `armazemId?`, `categoriaAtiva?`, `search?`, `sortBy?`/`sortOrder?` | `categoriaIds`/`fabricanteIds` aceitam csv ou repetido, máx. 100 |
| `ProdutoFotoVincular` | `produtoId: uuid` | |
| `ProdutoFotoCriterio` (enum) | `codigo_erp` / `codigo_fornecedor` / `manual` | query string da importação de fotos |
| `ProdutoRelacionadoCriar` | `relacionadoId: uuid`, `tipo`, `observacao?`, `ordem` (default `0`) | |
| `ProdutoFichaAtualizar` | `titulo?`, `markdown?`, `visivelAgente?` | todos opcionais (patch parcial) |
| `FichaImportacaoVincular` | `produtoId: uuid` | decisão manual de PDF ambíguo/sem correspondência |

---

## Módulo `produto-campos`

### `ProdutoCampo` (tabela `produto_campos`) 🟢

Definição de um campo complementar — o cadastro de quais dados extras a empresa quer
guardar.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId` | String | |
| `chave` | String | identificador estável (`^[a-z0-9]+(-[a-z0-9]+)*$`); referenciado pela IA/integrações; `@@unique([empresaId, chave])`; nunca editável depois de criado |
| `nome` | String | rótulo exibido, editável |
| `tipo` | enum `ProdutoCampoTipo` | `texto` (default) / `texto_longo` / `numero` / `booleano` / `data` / `lista`; travado se já houver valor preenchido |
| `unidade` | String? | só rótulo ("mm", "kg", "L") — sem conversão |
| `opcoes` | String[] | default `[]`; só relevante quando `tipo = lista` |
| `grupo` | String? | agrupamento na tela; nulo cai num grupo geral |
| `ajuda` | String? | texto de apoio a quem preenche |
| `ordem` | Int | default `0` |
| `obrigatorio` | Boolean | default `false` |
| `visivelAgente` | Boolean | default `true`; recorte do que a IA pode citar |
| `ativo` | Boolean | default `true`; desativar some da tela sem apagar valores |
| `deletedAt`/`deletedBy` | | soft delete; não remove `ProdutoCampoValor` |

### `ProdutoCampoValor` (tabela `produto_campo_valores`) 🟢

Valor de um campo complementar num produto. Sempre texto, em formato canônico (número com
ponto decimal, booleano `"true"`/`"false"`, data `AAAA-MM-DD`) — conversão de exibição é
responsabilidade de quem lê, a partir do `tipo` da definição.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId`, `produtoId`, `campoId` | String | `produto`/`campo` com `onDelete: Cascade` |
| `valor` | String | formato canônico; ausência de linha = não preenchido |

`@@unique([empresaId, produtoId, campoId])` — chave do `upsert` em `gravarValores`.

### DTOs (Zod, `@plataforma/contracts`) 🟢

| DTO | Campos | Observação |
|---|---|---|
| `ProdutoCampoCreate` | `chave`, `nome`, `tipo` (default `texto`), `unidade?`, `opcoes` (default `[]`, máx. 50), `grupo?`, `ajuda?`, `ordem` (default `0`), `obrigatorio` (default `false`), `visivelAgente` (default `true`), `ativo` (default `true`) | `.refine`: `tipo='lista'` exige `opcoes.length > 0` |
| `ProdutoCampoUpdate` | mesmos campos exceto `chave` (imutável), todos opcionais | mesmo `.refine` de lista |
| `ProdutoCampoValor` (leitura) | `campoId`, `chave`, `nome`, `tipo`, `unidade`, `opcoes`, `grupo`, `ajuda`, `obrigatorio`, `valor?` | é a definição + o valor do produto, combinados |
| `ProdutoCamposGravar` | `valores: { campoId: uuid, valor: string \| null }[]` (máx. 200) | `valor` nulo/vazio apaga o preenchimento |

---

## Módulo `cliente-campo-config`

### `ClienteCampoConfig` (tabela `cliente_campo_config`) 🟢

Uma linha por campo travado — campo sem linha é editável por default.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId` | String | |
| `campo` | String | nome do campo (um dos `CAMPOS_CLIENTE_CONFIGURAVEIS`); não é enum no banco |
| `editavel` | Boolean | default `true` |

`@@unique([empresaId, campo])` — chave do `upsert` em `atualizar`.

### DTOs (Zod, `@plataforma/contracts`) 🟢

| DTO | Campos | Observação |
|---|---|---|
| `ClienteCampoConfigItem` | `campo` (enum dinâmico `CAMPOS_CLIENTE_CONFIGURAVEIS`), `editavel: boolean` | |
| `ClienteCamposConfigUpdate` | `campos: ClienteCampoConfigItem[]` (mín. 1) | payload do `PATCH /clientes-config/campos` |
| `ClienteCamposConfig` (leitura) | `Record<string, boolean>` | mapa campo → editável, resposta do `GET /clientes-config/campos` |

---

## Módulo `estoque`

### `Estoque` (tabela `estoques`) 🟢

Espelho read-only do ERP — sem create/update manual, dados entram só pelo import.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId`, `produtoId`, `armazemId` | String | FK |
| `codigoErp` | String | |
| `chave` | String? | chave de integração (`X2_UNICO`); `@@unique([empresaId, chave])` |
| `saldo` | Float | default `0` |
| `disponivel` | Float? | `SaldoSB2()` do Protheus — o que dá para vender; nulo = enviado antes de existir |
| `reserva`, `custo`, `ultimoPreco` | Float? | |
| `ultimaCompra` | DateTime? (`@db.Date`) | |
| `dataEnvio` | DateTime | default `now()`; carimbo do import |

`@@unique([empresaId, produtoId, armazemId])` e `@@unique([empresaId, chave])`.

### `Armazem` (tabela `armazens`) 🟢

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId` | String | |
| `codigoErp` | String | |
| `chave` | String? | chave de integração; `@@unique([empresaId, chave])` |
| `descricao` | String | |
| `ativo` | Boolean | default `true` |
| `revenda` | Boolean | default `true`; marca `MV_BJAPI16` do Protheus — só estoque de armazém `revenda=true` conta na plataforma |

### DTOs (Zod, `@plataforma/contracts`) 🟢

| DTO | Campos | Observação |
|---|---|---|
| `EstoqueQuery` | paginação + `armazemId?`, `categoriaId?`, `comSaldo?` | `sortBy` aceita `'categoria'`/`'codigoErp'`/`'descricao'`/`'saldoTotal'` (não tipado no schema — tratado no service) |
| `EstoqueProdutoResumo` (leitura) | `id`, `codigoErp`, `descricao`, `unidade`, `categoria`, `saldoTotal`, `reservaTotal`, `qtdArmazens`, `ultimaCompra`, `ativo` | linha da listagem — agregado por produto |
| `EstoqueSaldoArmazem`/`EstoqueDetalhe` (leitura) | `Estoque` sem `produtoId` + `armazem` ref | detalhe aberto por armazém |

---

## Módulo `estrutura`

### `Modulo` (tabela `modulos`) 🟢

Catálogo global — sem `empresaId`, sem RLS. Só `PlatformAdminGuard` grava.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `nome` | String | 2–80 chars (contrato) |
| `icone` | String? | nome de ícone lucide-react |
| `ordem` | Int | default `0` |
| `ativo` | Boolean | default `true`; inativo = oculto do menu globalmente |
| `disponivelTelaPequena` | Boolean | default `true` |

Relações: `menus`, `ativacoes` (`EmpresaModulo`), `planos` (`PlanoModulo`).

### `Menu` (tabela `menus`) 🟢

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `moduloId` | String | FK `Modulo` |
| `menuPaiId` | String? | auto-referência (`MenuSubmenu`); hierarquia de no máx. 2 níveis (validado em código) |
| `nome` | String | 2–80 chars |
| `icone`, `rota` | String? | |
| `ordem` | Int | default `0` |
| `ativo` | Boolean | default `true` |
| `disponivelTelaPequena` | Boolean | default `true` |

Relações: `modulo`, `menuPai`/`submenus`, `rotinas`, `ativacoes` (`EmpresaMenu`), `planos`
(`PlanoMenu`).

### `Rotina` (tabela `rotinas`) 🟢

Funcionalidade permissionável — `codigo` é a chave usada em `@RequirePermission`.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `menuId` | String | FK `Menu` |
| `nome` | String | 2–80 chars |
| `codigo` | String | regex `^[a-z0-9._-]+$`, 2–60 chars; identificador do RBAC (ex.: `clientes`, `produtos-campos`) |
| `ativo` | Boolean | default `true`; inativa não pode receber permissões |
| `disponivelTelaPequena` | Boolean | default `true` |

### `EmpresaModulo`/`EmpresaMenu`/`EmpresaRotina` (tabelas `empresa_modulos`/`empresa_menus`/`empresa_rotinas`) 🟢

O outro lado do catálogo: liga/desliga **por empresa**. Mesma forma nas três.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId` | String | RLS |
| `moduloId`/`menuId`/`rotinaId` | String | FK |
| `ativo` | Boolean | default `true`; **ausência de linha = ligado** (ver code-analysis 3.1) |

`@@unique([empresaId, moduloId\|menuId\|rotinaId])` — chave do upsert.

### DTOs (Zod, `@plataforma/contracts`) 🟢

| DTO | Campos | Observação |
|---|---|---|
| `ModuloCreate`/`ModuloUpdate` | `nome`, `icone?`, `ordem`, `ativo`, `disponivelTelaPequena` | `Update` = `Create.partial()` |
| `MenuCreate`/`MenuUpdate` | `moduloId`, `menuPaiId` (default `null`), `nome`, `icone?`, `rota?`, `ordem`, `ativo`, `disponivelTelaPequena` | |
| `RotinaCreate`/`RotinaUpdate` | `menuId`, `nome`, `codigo` (regex), `ativo`, `disponivelTelaPequena` | |
| `EmpresaEstruturaToggle` | `ativo: boolean` | payload do liga/desliga por empresa (módulo e menu) |

---

## Módulo `fornecedores`

### `Fornecedor` (tabela `fornecedores`) 🟢

Espelho read-only do ERP — cadastro entra e sai só por `/integracao/fornecedores`.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId` | String | RLS |
| `codigoErp` | String? | informativo |
| `chave` | String? | chave de integração (`X2_UNICO`); `@@unique([empresaId, chave])`; é o que o upsert do import casa |
| `tipoPessoa` | enum `TipoPessoa` | `juridica` (default) / `fisica` |
| `razaoSocial` | String | obrigatório |
| `nomeFantasia`, `cnpjCpf`, `inscricaoEstadual`, `inscricaoMunicipal` | String? | |
| `contato`, `email`, `telefone`, `celular` | String? | |
| `endereco`, `complemento`, `bairro`, `municipio`, `uf`, `cep` | String? | endereço |
| `observacao` | String? | |
| `ativo` | Boolean | default `true` |

Relações: `notasEntrada`, `notasEntradaItens`, `notasSaida`, `produtos` (como
fabricante — ver módulo `produtos`).

### DTOs (Zod, `@plataforma/contracts`) 🟢

| DTO | Campos | Observação |
|---|---|---|
| `FornecedorQuery` | paginação (inclui `search` genérico) + `ativo?`, `uf?` (máx. 2 chars) | `search` vem de `paginationQuerySchema` (busca textual livre) |
| `Fornecedor` (leitura) | espelha a tabela inteira (sem `chave`, que fica interno à integração) | |

---

## Módulo `notas-entrada`

### `NotaEntrada` (tabela `notas_entrada`) 🟢

Espelho read-only da SF1 — cabeçalho da nota de compra; entra e sai só por
`/integracao/notas-entrada`.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId` | String | RLS |
| `codigoErp` | String? | informativo |
| `chave` | String? | chave de integração (`X2_UNICO`); `@@unique([empresaId, chave])` — é o que o upsert do import casa |
| `fornecedorId` | String? FK `Fornecedor` | preenchido quando `tipo` ≠ `'D'` |
| `clienteId` | String? FK `Cliente` | preenchido quando `tipo` = `'D'` (devolução de venda) |
| `condicaoPagamentoId` | String? FK `CondicaoPagamento` | |
| `numero` | String | obrigatório |
| `serie`, `especieFiscal` | String? | |
| `tipo` | String? | `'N'` compra · `'D'` devolução de venda — só um dos dois lados (fornecedor/cliente) vem preenchido |
| `dtEmissao` | DateTime? (date) | data do documento do fornecedor; alimenta `ano`/`mes` (casa com a apuração de venda, que também usa emissão) |
| `dtEntrada` | DateTime? (date) | data de recebimento da mercadoria; raramente coincide com `dtEmissao` |
| `ano`, `mes` | Int? | derivados de `dtEmissao` |
| `vlrBruto`, `vlrMercadoria`, `vlrItens`, `vlrDesconto` | Float | default `0` |
| `vlrIcms`, `vlrIcmsSt` (F1_ICMSRET), `vlrIpi` | Float | default `0` |
| `vlrFrete`, `vlrSeguro`, `vlrDespesa` | Float | default `0`; mantidos separados (espelham a SF1) em vez de um "outras despesas" agregado, para permitir conferência contra o documento do fornecedor |
| `chaveNfe` | String? | chave da NF-e |
| `dtNfe` | DateTime? (date) | |
| `mensagem` | String? | |
| `comodato` | Boolean | default `false`; marcado pela integração quando todos os itens vivos têm CFOP 1909/2909 (retorno de comodato) — o ERP não informa isso diretamente |
| `ativo` | Boolean | default `true` |
| `duplicata` | String? | F1_DUPL — número da duplicata gerada |
| `geraDuplicata` | Boolean? | `true`/`false` = ERP informou; `null` = integração ainda não mandava o campo (campo adicionado 2026-10-13, ver commit `F1_DUPL`) |

Índices: `@@unique([empresaId, chave])`; `[empresaId, codigoErp]`; `[empresaId, numero]`;
`[empresaId, fornecedorId]`; `[empresaId, dtEmissao]`; `[empresaId, ano, mes]`;
`[empresaId, clienteId, dtEmissao]` (atende a aba Devoluções da Posição de Cliente —
um cliente, notas `'D'` dele, mais recente primeiro).

### `NotaEntradaItem` (tabela não mapeada por `@@map` explícito no trecho lido — FK `notaEntradaId`) 🟢

Item da nota, com `empresaId`/`fornecedorId`/`clienteId`/`dtEmissao`/`ano`/`mes`
denormalizados do cabeçalho (mesma decisão de `NotaSaidaItem`): a apuração por produto
varre a tabela de itens, e um join com o cabeçalho em cima da maior tabela do módulo
custaria caro à toa. Não tem `ncm` — vem de `Produto.ncm` (B1_POSIPI), para não duplicar
o dado.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId`, `notaEntradaId` | String | FK |
| `chave` | String? | chave de integração (X2_UNICO), única dentro do cabeçalho — o upsert casa item a item por ela, em vez de apagar/recriar o conjunto |
| `fornecedorId`, `clienteId` | String? | espelham o participante do cabeçalho |
| `produtoId`, `armazemId` | String? | `armazemId` pode ficar nulo se o código do ERP não existir na plataforma — decisão de negócio (28/09/2026): não recusa a nota inteira por um `D1_LOCAL` digitado errado |
| `item` | Int? | número do item na nota |
| `dtEmissao`, `ano`, `mes` | — | denormalizados do cabeçalho |
| `cfop` | String? | 1909/2909 = retorno de comodato (ver `NotaEntrada.comodato`) |
| `quantidade`, `vlrUnitario`, `vlrDesconto`, `vlrTotal` | Float | default `0` |
| `vlrIcms`, `vlrIcmsSt`, `vlrIpi` | Float | default `0` |
| `aliqIpi`, `aliqIcms` | Float? | alíquotas do item (D1_IPI, D1_PICM) em %; nulas até a integração mandar (desde 2026-10-13) |
| `peso` | Float? | |
| `comodato` | Boolean | default `false`; calculado por item a partir do CFOP (`itemEhComodato`) |
| `ativo` | Boolean | default `true` |

### DTOs (Zod, `@plataforma/contracts`) 🟢

| DTO | Campos | Observação |
|---|---|---|
| `NotaEntradaQuery` | paginação + `ativo?`, `fornecedorId?`, `clienteId?`, `tipo?` (máx. 10 chars), `ano?`, `mes?` (1–12) | sem `search` tipado explícito no schema — tratado como string livre no service |
| `NotaEntrada` (leitura) | espelha a tabela, sem campos de NF-e de saída (`situacaoNfe`/`protocoloNfe`/`temXml`) — o documento de entrada foi emitido por terceiro, a plataforma não reimprime segunda via | |
| `NotaEntradaItem` (leitura) | espelha a tabela do item | |

---

## Módulo `notas-saida`

### `NotaSaida` (tabela `notas_saida`) 🟢

Espelho read-only da SF2 — cabeçalho da nota de venda; entra e sai só por
`/integracao/notas-saida` (módulo irmão, não analisado nesta passada). É o único dos dois
(venda/compra) com 2ª via de documento fiscal (DANFE/XML) — a nota de entrada foi emitida
por terceiro, a plataforma não reimprime.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId` | String | RLS |
| `codigoErp` | String? | informativo |
| `chave` | String? | chave de integração (`X2_UNICO`); `@@unique([empresaId, chave])` — o que o upsert do import casa |
| `clienteId` | String? FK `Cliente` | nulo na devolução de compra (`tipo = 'D'`) |
| `fornecedorId` | String? FK `Fornecedor` | só preenchido na devolução de compra — espelho invertido de `NotaEntrada.clienteId` |
| `vendedorId` | String? FK `Vendedor` | quem efetivamente fez a venda (exibido na tela); **não** é o que decide quem enxerga a nota — ver `Cliente.vendedorId` e §3.1 do code-analysis |
| `condicaoPagamentoId` | String? FK `CondicaoPagamento` | |
| `numero` | String | obrigatório |
| `serie`, `especieFiscal` | String? | |
| `tipo` | String? | `'D'` = devolução de compra (destinatário é fornecedor); apurações de venda filtram tipo ≠ `'D'` |
| `dtEmissao` | DateTime? (date) | alimenta `ano`/`mes` |
| `ano`, `mes` | Int? | derivados de `dtEmissao` |
| `vlrBruto`, `vlrMercadoria`, `vlrItens`, `vlrDesconto` | Float | default `0` |
| `vlrIcms`, `vlrIpi`, `vlrFrete`, `vlrDevolucao` | Float | default `0` |
| `chaveNfe` | String? | chave de acesso da NF-e (44 dígitos) |
| `dtNfe` | DateTime? (date) | |
| `mensagem` | String? | |
| `comodato` | Boolean | default `false`; todos os itens vivos com CFOP 5908/6908, ou o ERP informou |
| `ativo` | Boolean | default `true` |
| `duplicata` | String? | F2_DUPL — número da duplicata gerada pela nota |
| `geraDuplicata` | Boolean? | `true`/`false` = ERP informou; `null` = integração anterior ao campo (cai no critério antigo: condição de pagamento) — é o que decide se a nota conta como venda nas análises (nota sem duplicata pode ser remessa em comodato, bonificação, transferência) |
| `xmlRecebidoEm` | DateTime? | não-nulo = "tem 2ª via?" sem tocar no XML (ver `comFlagXml`); metadado curto que a tela usa, propositalmente fora da tabela acessória |
| `protocoloNfe` | String? | protocolo de autorização (infProt/nProt) |
| `situacaoNfe` | String? | `"autorizada"` \| `"cancelada"` \| `"denegada"`, como veio do ERP |

Índices: `@@unique([empresaId, chave])`; `[empresaId, codigoErp]`; `[empresaId, numero]`;
`[empresaId, vendedorId, ano, mes]`; `[empresaId, clienteId]`; `[empresaId, fornecedorId]`;
`[empresaId, dtEmissao]`.

**Nota de design:** o XML autorizado **não** é coluna de `NotaSaida` — vive em
`NotaSaidaXml` à parte, porque o Prisma traz todas as colunas quando a consulta não tem
`select` explícito, e tanto a listagem paginada quanto a Posição de Cliente (que carrega o
histórico inteiro sem paginar) fariam toda abertura de tela arrastar megabytes de XML. O
DANFE também **não é cacheado** — é sempre renderizado sob demanda a partir do XML
(cachear um PDF barato de refazer só criaria risco de layout desatualizado).

### `NotaSaidaXml` (tabela `nota_saida_xml`) 🟢

Tabela acessória 1:1 com `NotaSaida` (`notaSaidaId` único, `onDelete: Cascade`). Um XML
por nota — reenvio do ERP substitui o anterior (a nota autorizada é uma só; versionar um
documento fiscal corrigido só criaria dúvida sobre qual vale).

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId`, `notaSaidaId` | String | FK; `notaSaidaId` único |
| `conteudo` | String (TEXT) | o XML completo; Postgres TOAST comprime automaticamente (~5–8x em XML), sem compressão em código |
| `tamanhoBytes` | Int | tamanho do que foi recebido — tela de operação confere sem ler o XML inteiro |
| `recebidoEm` | DateTime | default `now()` |
| `recebidoPor` | String? | chave de API da integração que enviou |

Índice: `[empresaId, recebidoEm]`.

### `NotaSaidaItem` (tabela `notas_saida_itens`) 🟢

Item de nota com `empresaId`/`clienteId`/`vendedorId`/`produtoId`/`dtEmissao`/`ano`/`mes`
denormalizados do cabeçalho (mesma decisão de `NotaEntradaItem`): viabiliza a tela própria
de itens com RLS e escopo sem join na nota, e alimenta a Sugestão de Compra (índice
dedicado) e a apuração por produto sem varrer o cabeçalho.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId`, `notaSaidaId` | String | FK |
| `chave` | String? | chave de integração (X2_UNICO), única dentro do cabeçalho (`@@unique([notaSaidaId, chave])`) — upsert casa item a item, não apaga/recria o conjunto |
| `clienteId`, `vendedorId`, `produtoId` | String? | espelham o participante/vendedor/produto do cabeçalho |
| `item` | Int? | número do item na nota |
| `dtEmissao`, `ano`, `mes` | — | denormalizados do cabeçalho |
| `cfop` | String? | 5908/6908 = remessa de comodato (ver `NotaSaida.comodato`) |
| `tipo` | String? | espelha o tipo do cabeçalho |
| `quantidade`, `vlrUnitario`, `vlrDesconto`, `vlrTotal` | Float | default `0` |
| `vlrTabela` | Float? | preço de tabela antes do desconto |
| `percDesconto` | Float? | percentual de desconto aplicado |
| `quantidadeDev`, `vlrDev` | Float? | quantidade/valor devolvido deste item (devolução de venda — distinto do cabeçalho `tipo='D'`, que é devolução de *compra*) |
| `peso` | Float? | |
| `comodato` | Boolean | default `false`; calculado por item a partir do CFOP |
| `ativo` | Boolean | default `true` |
| `percComissao` | Float? | percentual de comissão apurado pela regra de desconto; nulo = ainda não apurado. Ocultado da resposta da API quando `COMISSAO_OCULTA_PARA_TODOS` está ligado e o usuário não pode ver comissão (`ocultarComissaoDosItens`) |
| `regraDescontoId` | String? FK `RegraDesconto` | regra de desconto aplicada (SZ0 do ERP); nulo = sem regra própria |

Índices: `[notaSaidaId]`; `[empresaId, produtoId]`; `[empresaId, vendedorId, dtEmissao]`;
`[empresaId, regraDescontoId]`; `[empresaId, clienteId, produtoId]` (Sugestão de Compra).

### DTOs (Zod, `@plataforma/contracts`) 🟢

| DTO | Campos | Observação |
|---|---|---|
| `NotaSaidaQuery` | paginação + `ativo?`, `clienteId?`, `vendedorId?`, `comodato?`, `tipo?` (máx. 10 chars), `devolucao?` (bool), `ano?`, `mes?` (1–12) | `devolucao`: `true` = só tipo `'D'`; `false` = exclui tipo `'D'`; ausente = todas (ver §3.2 do code-analysis) |
| `NotaSaida` (leitura) | espelha a tabela + `temXml: boolean` calculado (`comFlagXml`, não persistido) | inclui campos de NF-e de saída que `NotaEntrada` não tem (`situacaoNfe`/`protocoloNfe`/`temXml`) |
| `NotaSaidaItem` (leitura) | espelha a tabela do item, incluindo `percComissao` (opcional) e os campos de vínculo de `RegraDesconto` | |

### Estruturas internas de `nfe-xml.ts` (não persistidas) 🟢

Tipos usados só na extração do XML para o DANFE — não são tabela, não são DTO de API:

| Tipo | Campos principais | Observação |
|---|---|---|
| `NoXml` | `nome`, `atributos`, `filhos`, `texto` | nó genérico da árvore que `lerXml` produz a partir do XML bruto |
| `NfeDados` | `chave`, `numero`, `emitente`/`destinatario` (`NfeParte`), `itens` (`NfeItem[]`), `duplicatas`, `totais`, `transporte`, `issqn`, `cancelada`, `protocolo` | "o que o DANFE precisa do XML — nem mais, nem menos" (comentário no código) |
| `NfeItem` | `codigo`, `descricao`, `ncm`, `cst`, `cfop`, `unidade`, `quantidade`, `valorUnitario`, `valorTotal`, bases/valores/alíquotas de ICMS e IPI | `cst` concatena `orig` + (`CST` ou `CSOSN`, conforme o regime tributário do item) |
| `NfeParte` | `nome`, `fantasia`, `documento` (CNPJ ou CPF), `inscricaoEstadual`, `inscricaoEstadualSt`, `inscricaoMunicipal`, `endereco` | usado para emitente e destinatário |

---

## Módulo `sugestao-compra`

### `SugestaoCompraGerada` (tabela `sugestoes_compra`) 🟢

O resultado **gravado** do motor — o que `calculadaDoCliente`/a aba "Visualizar" leem.
Uma linha por produto sugerido a um cliente; `gerarLote`/`gerarParaCliente` apagam e
recriam por cliente a cada rodada (nunca `update`).

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId`, `clienteId`, `produtoId` | String | FK; `cliente` com `onDelete: Cascade` |
| `origem` | enum `OrigemSugestaoCompra` (`local` \| `ia`) | hoje só `local` é gravado (motor determinístico) — `ia` existe no schema mas sem produtor neste módulo (ver `anonimizar.ts`, code-analysis §3.8) |
| `ordem` | Int | posição de exibição (1 = mais relevante) |
| `score` | Float? | `clientes / total` da referência (§3.4 do code-analysis) |
| `motivo` | String? | frase pronta para a tela ("N de M clientes do mesmo ramo... compram este produto") |
| `modelo` | String? | reservado para quando `origem = 'ia'` registrar qual modelo gerou — não preenchido hoje |
| `loteId` | String | agrupa as linhas de uma mesma rodada (`randomUUID()` por chamada de `gerarLote`/`gerarParaCliente`) |
| `geradaEm` | DateTime | default `now()` |

Índices: `@@unique([clienteId, produtoId, origem])` — upsert natural por recálculo;
`[empresaId, clienteId, origem, ordem]` (leitura ordenada por cliente);
`[empresaId, loteId]` (auditoria de uma rodada).

### `SugestaoCompraExecucao` (tabela `sugestao_compra_execucoes`) 🟢

Acompanhamento do "Calcular" em lote, que roda em segundo plano (§3.7 do code-analysis).

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId`, `usuarioId` | String | quem disparou |
| `situacao` | enum `SituacaoExecucaoSugestao` (`rodando` \| `concluida` \| `falhou`) | default `rodando` |
| `parametros` | Json? | `meses`/`clienteCodigoDe`/`clienteCodigoAte` do pedido |
| `resultado` | Json? | `clientesProcessados`/`clientesComSugestao`/`sugestoesGravadas`, só quando concluída |
| `erro` | String? | mensagem truncada em 1000 chars quando falhou |
| `iniciadaEm`, `concluidaEm` | DateTime | `concluidaEm` nulo enquanto roda |

Índice: `[empresaId, iniciadaEm]`. **Uma execução `rodando` por empresa** garantida por
índice parcial único da migration `20260930190000_sugestao_compra_execucoes` (não
reforçado em código — a checagem do service existe só para devolver 409 amigável antes do
banco rejeitar).

### DTOs (Zod, `@plataforma/contracts`) 🟢

| DTO | Campos | Observação |
|---|---|---|
| `SugestaoCompraQuery` | `meses` (1–60, default 12), `limite` (1–50, default 10), `semelhantes` (3–100, default 30), `baseSemelhanca` (`ambos`\|`cesta`\|`cnae`), `afinidadeCnae` (`hierarquica`\|`exata`) | parâmetros da consulta ao vivo (`paraCliente`) |
| `SugestaoCompraResultado` | `clienteId`, `razaoSocial`, `produtosNaCesta`, `cnaes[]`, `clientesSemelhantes[]`, `sugestoes[]`, `aviso` | `aviso` não-nulo = diagnóstico de por que não há sugestão (cliente inelegível, sem cesta, sem semelhante...) em vez de lista vazia muda |
| `ClienteSemelhante` | `clienteId` (string, não uuid — pode vir `''`), `razaoSocial`, `codigoErp`, `municipio`, `uf`, `score`, `indiceCesta`, `cnaesEmComum`, `nivelCnae`, `naCarteira`, `mesmoCnaePrincipal`, `mesmaRegiao`, `produtosEmComum` | campos de identificação ficam vazios/nulos quando `naCarteira = false` (ver code-analysis §3.2) |
| `ProdutoSugerido` | `produtoId`, `codigoErp`, `descricao`, `score`, `semelhantesQueCompram`, `totalSemelhantes`, `cobertura`, `valorMedio`, `ultimaCompraNoGrupo`, `precoTabelaCliente`, `evidencia[]` | `evidencia` só nomeia clientes da carteira do usuário |
| `SugestaoCompraListQuery` | paginação + `ativo?`, `uf?`, `municipio?`, `vendedorId?`, `bloqueado?` | consulta da listagem administrativa |
| `SugestaoCompraListRow` | `id`, `codigoErp`, `razaoSocial`, `municipio`, `uf`, `ativo`, `bloqueado`, `ultimoCalculo`, `qtdSugestoes` | uma linha por cliente, não por produto |
| `SugestaoCompraCalculada` / `SugestaoCompraCalculadaItem` | cliente + itens gravados (`produtoId`, `ordem`, `score`, `motivo`, `origem`, `geradaEm`, `precoTabelaCliente`) | preço é recalculado na leitura (tabela atual), não o do momento do cálculo |
| `SugestaoCompraGerarClienteBody` | `meses?` (1–60) | corpo de `POST .../gerar` (1 cliente) |
| `SugestaoCompraGerarLoteBody` | `meses?`, `clienteCodigoDe?`, `clienteCodigoAte?` | corpo de `POST /sugestao-compra/gerar` (lote) |
| `SugestaoCompraExcluirBody` | `clienteCodigoDe?`, `clienteCodigoAte?` (sem `meses`) | corpo de `POST /sugestao-compra/excluir` |
| `SugestaoCompraExcluirResultado` | `clientes`, `sugestoesExcluidas` | contadores do que foi apagado |
| `SugestaoCompraGerarResultado` | `loteId`, `clientesProcessados`, `clientesComSugestao`, `sugestoesGravadas`, `aviso?` | resultado síncrono de `gerarParaCliente`/`gerarLote` |
| `SugestaoCompraExecucao` | `id`, `situacao`, `iniciadaEm`, `concluidaEm`, `usuarioNome`, `resultado`, `erro` | o que `GET /sugestao-compra/execucoes/ultima` devolve |

### Estruturas internas de `anonimizar.ts` (não persistidas) 🟢

| Tipo | Campos | Observação |
|---|---|---|
| `ClienteParaAnonimizar` | `id`, `codigoErp`, `razaoSocial?`, `nomeFantasia?`, `cnpjCpf?`, `municipio?`, `uf?`, `limiteCredito?`, `cnaes[]`, `produtos[]` | entrada bruta, como sai do banco — contém propositalmente os campos que NÃO podem trafegar |
| `ClienteAnonimo` | `ref` (`"C0"`, `"C1"`...), `cnaes: string[]`, `produtos: string[]` | o que efetivamente é enviado à IA — só códigos |
| `PayloadAnonimo` | `alvo: ClienteAnonimo`, `comparaveis: ClienteAnonimo[]` | payload completo da consulta |

---

## Módulo `orcamentos`

### `Orcamento` (tabela `orcamentos`) 🟢

Proposta comercial — nasce na plataforma (diferente das notas, que são espelho do ERP).
Único módulo comercial com CRUD completo analisado até aqui.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId` | String | RLS |
| `codigoErp` | String? | número do Pedido de Venda gerado a partir do orçamento aprovado; nulo até o ERP integrar, nulo para sempre no orçamento que não vira pedido |
| `chave` | String? | chave de integração (X2_UNICO); `@@unique([empresaId, chave])` |
| `numero` | Int? | número sequencial por empresa, visível desde o rascunho (ver `proximoNumeroOrcamento`, code-analysis §3.6); nulo no pedido vindo do ERP como histórico (`origem: 'erp'`), que mostra `codigoErp` no lugar (ver `numeroOrcamento()`) |
| `clienteId`, `vendedorId` | String | FK; `vendedorId` sempre herdado do cadastro do cliente (code-analysis §3.2) |
| `oportunidadeId` | String? FK `Oportunidade` | |
| `condicaoPagamentoId` | String? FK `CondicaoPagamento` | |
| `titulo` | String | |
| `status` | enum `StatusOrcamento` (`rascunho`/`enviado`/`aprovado`/`recusado`/`expirado`) | default `rascunho`; máquina de estado — ver code-analysis §3.4 |
| `origem` | enum `OrigemVenda` (`vendedor`/`superior`/`administrador`/`cliente`/`erp`) | default `vendedor`; quem de fato montou o orçamento — ver code-analysis §3.2. Histórico anterior a 02/09/2026 gravado como `vendedor` por padrão (não recuperável) |
| `dataValidade` | DateTime? (date) | ajustada para dia útil só na ponta final (`ajustarValidadeOrcamento`) |
| `dataRetorno` | DateTime? | ao ser definida/alterada, gera `Atividade` de follow-up (`criarAtividadeRetorno`) |
| `observacao` | String? | |
| `vlrTotal` | Float | default `0`; soma dos itens, recalculada a cada save |
| `ativo` | Boolean | default `true` |
| `situacaoErp` | enum `SituacaoErpOrcamento`? | gravada só pela integração (`PUT /integracao/pedidos`); nula até o ERP mandar o pedido pela 1ª vez |
| `situacaoErpEm` | DateTime? | |
| `comQuebra` | Boolean | default `false`; pedido no ERP difere do orçamento aprovado (item incluído/retirado, quantidade/preço diferente) — calculado comparando `itensErp` com os itens do orçamento (fora deste módulo) |
| `erroIntegracao` | String? | motivo da recusa do pedido pelo ERP (MATA410); orçamento recusado sai da fila de pendentes e fica assim — caminho é copiar (decisão 29/09/2026) |
| `erroIntegracaoEm` | DateTime? | |
| `notasErp` | Json? | `[{numero, serie, emissao}]` das notas do pedido |
| `itensErp` | Json? | `[{chave, produtoChave, quantidade, vlrUnitario, quantidadeEntregue}]` como o ERP mandou por último |
| `descontoSolicitadoEm`/`Por`, `descontoAutorizadoEm`/`Por` | DateTime?/String? | fluxo de autorização em duas etapas — ver code-analysis §3.3; zeradas quando os itens mudam |
| `clienteDecididoEm` | DateTime? | quando o cliente respondeu (aprovou/recusou) |
| `clienteDecididoPorContatoId` | String? FK `ClienteContato` | qual contato do cliente decidiu (relação nomeada `OrcamentoDecisaoContato`) |
| `clienteDecisao` | String? | |
| `clienteDecisaoObservacao` | String? | |

Índices: `@@unique([empresaId, chave])`; `@@unique([empresaId, numero])`;
`[empresaId, codigoErp]`; `[empresaId, vendedorId]`; `[empresaId, clienteId]`;
`[empresaId, status]`; `[empresaId, clienteDecididoPorContatoId]`.

### `OrcamentoItem` (tabela `orcamento_itens`) 🟢

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId`, `orcamentoId`, `produtoId` | String | FK; `orcamento` com `onDelete: Cascade`, `produto` com `onDelete: Restrict` (não se apaga produto referenciado por orçamento) |
| `chave` | String? | chave de integração (X2_UNICO); nula no item criado pela tela (caso normal aqui — orçamento nasce na plataforma); `@@unique([orcamentoId, chave])` |
| `quantidade` | Float | default `1` |
| `vlrTabela` | Float? | preço da Tabela de Preço do cliente; `null` sem tabela aplicável/preço cadastrado — ver code-analysis §3.1 |
| `vlrUnitario` | Float | default `0`; informado pelo vendedor, preço praticado (líquido) |
| `percDesconto`, `vlrDesconto` | Float?/Float | calculados a partir de `vlrTabela` vs. `vlrUnitario`; `vlrDesconto` default `0` |
| `vlrTotal` | Float | default `0`; `vlrUnitario * quantidade` |
| `regraDescontoId` | String? FK `RegraDesconto` | regra aplicável resolvida (tabela de preço > produto > categoria > regra padrão); nulo = sem regra própria |
| `percComissao` | Float? | apurado a partir do `percComissao` base do vendedor + faixa da regra de desconto; `null` = sem percentual base cadastrado (não apurável), nunca `0` |

Índices: `[empresaId, produtoId]`; `[orcamentoId]`; `[empresaId, regraDescontoId]`.

### `OrcamentoConfig` (tabela `orcamento_config`) 🟢

Só o contador do número sequencial (code-analysis §3.6) — não confundir com o módulo
`orcamento-config` (pendente de análise), que pode ter regras de negócio adicionais sobre
orçamento além deste contador.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId` | String | `@unique` — uma linha por empresa |
| `ultimoNumero` | Int | default `0`; incrementado atomicamente por `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` (`proximoNumeroOrcamento`) |

### DTOs (Zod, `@plataforma/contracts`) 🟢

| DTO | Campos | Observação |
|---|---|---|
| `OrcamentoCreate` | `clienteId`, `vendedorId` (sobrescrito pelo do cliente quando houver), `oportunidadeId?`, `condicaoPagamentoId?`, `titulo` (1–150), `status` (default `rascunho`), `dataValidade?`, `dataRetorno?`, `observacao?` (≤1000), `ativo` (default `true`), `itens[]` (default `[]`) | |
| `OrcamentoUpdate` | `OrcamentoCreate.partial()` | quando `itens` é enviado, substitui o conjunto inteiro (sem endpoint por linha) |
| `OrcamentoItemLinha` | `produtoId`, `quantidade` (inteiro positivo), `vlrUnitario` (≥0) | input de item — o resto (`vlrTabela`/`percDesconto`/`vlrDesconto`/`vlrTotal`) é calculado pelo servidor |
| `OrcamentoQuery` | paginação + `ativo?`, `status?`, `origem?`, `vendedorId?`, `clienteId?`, `oportunidadeId?`, `dataInicio?`, `dataFim?` (sobre `createdAt`, uso: tela de Agenda) | |
| `Orcamento` (leitura) | espelha a tabela | |
| `OrcamentoItem` (leitura) | espelha a tabela do item + `produto` embutido (evita segundo fetch no form) | |

### Funções/helpers compartilhados (não persistidos) 🟢

| Função | Arquivo | Observação |
|---|---|---|
| `situacaoIntegracaoOrcamento(o)` | `@plataforma/contracts` | deriva `SituacaoIntegracaoOrcamento` (`nao_enviado`/`aguardando`/`erro_integracao` + os valores de `SituacaoErpOrcamento`) combinando `status`, `chave`/`codigoErp`, `situacaoErp`, `erroIntegracao` — usada pela listagem e pela aba de integração |
| `podeExcluirOrcamento(o)` | `@plataforma/contracts` | `origem === 'erp'` nunca pode; senão, só `situacao === 'nao_enviado'` ou `'erro_integracao'` — ver code-analysis §6 |
| `numeroOrcamento(o)` | `@plataforma/contracts` | `numero` como string, ou `codigoErp` quando `numero` é nulo (pedido histórico do ERP) |
| `calcularComissaoItem(regra, percDesconto, percBaseVendedor)` | `@plataforma/contracts` | aplica a faixa da regra de desconto sobre o percentual base do vendedor — usado por `calcularItensOrcamento` |

---

## Módulo `orcamento-config`

Sem entidade própria. **Não usa a tabela `orcamento_config`** (que, apesar do nome,
guarda só o contador `ultimoNumero` do módulo `orcamentos` — ver acima). A nota da seção
`OrcamentoConfig` que previa "regras de negócio adicionais" neste módulo fica respondida:
não há.

### Fonte do dado: `ParametroEmpresa` (tabela `parametros_empresa`) 🟢

| Campo | Valor para este módulo |
|---|---|
| `parametro` | `ORCAMENTO_DIAS_VALIDADE` |
| `tipo` | `numero` (seed) |
| `tamanho` | `3` (seed) |
| `conteudo` | `'30'` (seed); validação só "é número" + tamanho — aceita `0`, negativo e fração 🟡 |

### Resposta `OrcamentoConfig` (`@plataforma/contracts`) 🟢

| Campo | Tipo | Origem | Observação |
|---|---|---|---|
| `diasValidade` | number | `obterNumero(…, 30)` | contrato diz `int ≥ 1`, não validado na saída |
| `updatedAt` | string (datetime) | `parametros_empresa.updatedAt` | sem linha: instante da consulta (`new Date()`) 🟡 |

### `OrcamentoConfigUpdate` 🟡

`{ diasValidade: int ≥ 1 }` — declarado no contrato, **sem endpoint nem uso**.

---

## Módulo `titulos-receber`

### `TituloReceber` (tabela `titulos_receber`) 🟢

Espelho do contas a receber do ERP (SE1); só a integração grava. `@@unique([empresaId, chave])`.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId` | String | tenant (RLS) |
| `chave` / `codigoErp` | String? | chave de integração (X2_UNICO) / código informativo |
| `clienteId`, `vendedorId` | String? | FKs; o `vendedorId` define o escopo hierárquico |
| `numero`, `parcela`, `prefixo`, `tipo` | String / String? | `numero` obrigatório; impresso como `numero/parcela` |
| `emissao`, `vencimento` | Date? | data pura (00:00 UTC) |
| `vencimentoReal` | Date? | vem do ERP; **não usado** pelo módulo (o ajuste é pelo calendário de feriados) 🟡 |
| `valor`, `saldo` | Float, default 0 | o boleto cobra `saldo` (ou `valor` se saldo = 0) |
| `acrescimo`, `decrescimo` | Float? | informativos |
| `dtBaixa` | Date? | presente = `baixado` |
| `formaPgto`, `historico` | String? | informativos |
| `ativo` | Boolean, default true | filtro `ativo` da listagem |
| `contaBancariaId` | String? | conta de cobrança do registro; nulo = conta padrão |
| `nossoNumero` | String? | sem ele não há 2ª via |
| `nossoNumeroDac` | String? | DV do ERP; **não usado** (DV recalculado) 🟡 |
| `carteira` | String? | sobrepõe a da conta |
| `codigoBarras`, `linhaDigitavel` | String? | **como o banco registrou**; prevalecem sobre o cálculo, exceto no boleto atualizado |
| `banco`, `bancoNome`, `bancoCodigoCompensacao`, `agencia`, `agenciaDv`, `conta`, `contaDv` | String? | desenho do boleto vindo do ERP; preenchido vence a conta de cobrança |
| `beneficiarioNome`, `beneficiarioDocumento`, `beneficiarioEndereco`, `localPagamento`, `aceite`, `especieDocumento` | String? | idem — precedência título → conta → empresa |
| `jurosValorDia`, `multaValor` | Float? | encargos em reais calculados pelo ERP; **únicos** usados no valor atualizado |
| `descontoValor` | Float? | **não usado** pelo módulo 🟡 |
| `instrucoes` | String? | instruções do ERP; linhas de encargo descartadas para não duplicar |
| auditoria | `createdAt`, `updatedAt`, `deletedAt`, `createdBy`, `updatedBy`, `deletedBy` | soft delete |

### `TituloReceberBaixa` (tabela `titulo_receber_baixas`) 🟢

Movimentos de baixa (SE5), carregados só no detalhe (`findOne`), ordenados por `data`.
`@@unique([tituloReceberId, chave])`; `onDelete: Cascade` a partir do título.

| Campo | Tipo | Observação |
|---|---|---|
| `chave` | String? | chave do movimento no ERP — o upsert casa baixa a baixa |
| `data` | DateTime? | data da baixa |
| `valor` | Float | principal amortizado |
| `juros`, `multa`, `desconto`, `abatimento`, `impostosRetidos` | Float, default 0 | **sempre positivos** — o sinal está no nome do campo |
| `motivo` | String? | E5_MOTBX (NOR, CMP, DAC…) |
| `historico` | String? | texto do ERP |
| `banco`, `agencia`, `conta` | String? | onde o dinheiro entrou (texto solto, não FK de conta de cobrança) |

### Campos derivados na resposta (não persistidos) 🟢

| Campo | Regra |
|---|---|
| `vencimentoEfetivo` | `vencimento` empurrado para o próximo dia útil (feriados da empresa) |
| `status` | `baixado` (tem `dtBaixa`) / `vencido` (efetivo < hoje UTC) / `aberto` |
| `temBoleto` | `podeEmitirBoleto`: tem `nossoNumero`, dentro da janela de reemissão, e há `contaBancariaId` ou conta padrão — **não olha `dtBaixa`** 🔴 |

### Query (`tituloReceberQuerySchema`) 🟢

Paginação padrão + `ativo`, `clienteId`, `vendedorId`, `status` ∈ {`aberto`, `vencido`,
`baixado`, `em_aberto`} (`em_aberto` = qualquer título sem baixa), `search` (número ou
razão social), `sortBy` ∈ `SORT_FIELDS`.

### `EncargosCalculados` (`boleto-atualizacao.ts`) 🟢

| Campo | Significado |
|---|---|
| `valor` | saldo + multa + juros, ao centavo — vai no código de barras |
| `saldo`, `multa`, `juros` | parcelas, cada uma ao centavo |
| `diasAtraso` | dias corridos desde o vencimento efetivo |
| `atualizadoAte` | hoje (meia-noite local) — data impressa como vencimento no boleto atualizado |

### `BoletoCalculado` (`boleto-codigo.ts`) 🟢

`codigoBarras` (44), `linhaDigitavel` (47), `linhaDigitavelFormatada` (5 blocos),
`nossoNumeroFormatado` (`CC/NNNNNNNNNNN-D`), `doErp` (true quando veio pronto do ERP).

---

## Módulo `contas-bancarias`

### `ContaBancaria` (tabela `contas_bancarias`) 🟢

Índice `@@index([empresaId, ativo])`; **sem** índice único para `padrao`.

| Campo | Tipo | Obrig. | Padrão | Validação no contrato | Observação |
|---|---|---|---|---|---|
| `id` | String (uuid) | sim | uuid | — | PK |
| `empresaId` | String | sim | — | — | tenant (RLS) |
| `descricao` | String | sim | — | 1–80 | nome nas telas |
| `banco` | String | sim | — | `enum(['237'])` | código de compensação (string pelo zero à esquerda) |
| `agencia` | String | sim | — | só dígitos, até **5** | gerador aceita até **4** 🟡 |
| `agenciaDv` | String? | não | — | 1 dígito | |
| `conta` | String | sim | — | só dígitos, até **9** | gerador aceita até **7** 🟡 |
| `contaDv` | String? | não | — | 1 dígito | |
| `carteira` | String | sim | — | só dígitos, até 2 | entra no campo livre |
| `logoUrl` | String? | não | — | texto livre | `/uploads/bancos/<uuid>.<ext>` pelo upload |
| `beneficiarioNome` / `Documento` / `Endereco` | String? | não | — | 120 / 20 / 200 | nulo = dados da empresa |
| `localPagamento` | String | sim | "Pagável em qualquer banco até o vencimento" | até 120 | |
| `aceite` | String | sim | `N` | 1 | |
| `especieDocumento` | String | sim | `DM` | até 5 | |
| `instrucoes` | String? | não | — | até 1000 | uma por linha; somadas às do título |
| `demonstrativo` | String? | não | — | até 1000 | |
| `jurosMesPerc`, `multaPerc` | Float? | não | — | 0–100 | **não usados** pelo boleto 🟡 |
| `diasProtesto` | Int? | não | — | 0–999 | vira a linha "Protestar após N dias corridos" |
| `padrao` | Boolean | sim | false | — | uma por empresa (no service) |
| `ativo` | Boolean | sim | true | — | |
| auditoria | `createdAt`, `updatedAt`, `deletedAt`, `createdBy`, `updatedBy`, `deletedBy` | | | | soft delete |

Relação: `titulos TituloReceber[]` (pelo `contaBancariaId` do título).

### Query (`contaBancariaQuerySchema`) 🟢

Paginação padrão + `ativo`; `search` em `descricao` (sem caixa), `agencia`, `conta`.

---

## Módulo `equipamentos-comodato`

### `EquipamentoComodato` (tabela `equipamentos_comodato`) 🟢

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | PK |
| `empresaId` | String | tenant (RLS); `@@index([empresaId])` |
| `produtoId` | String | **`@unique`** — um equipamento por produto; FK `onDelete: Cascade` |
| `observacao` | String? | livre |
| `ativo` | Boolean, default true | editável |
| auditoria | `createdAt`, `updatedAt`, `deletedAt`, `createdBy`, `updatedBy`, `deletedBy` | soft delete; excluído é **reaproveitado** no `create` e no Popular |

### Itens: `ProdutoRelacionado` com `tipo = 'aplicacao'` (tabela `produto_relacionados`) 🟢

Do módulo `produtos`. Para o equipamento: `produtoId` = produto do equipamento,
`relacionadoId` = produto aplicável, `observacao`, `ordem` (gravado 0 por esta tela).
`@@unique([empresaId, produtoId, relacionadoId, tipo])`; índice pela ponta de destino.

### Campos de categoria usados 🟢

`categorias.equipamentoComodato` (Boolean): produto de categoria (raiz ou sub) marcada não
pode ser aplicável e sai das sugestões; também separa as opções de categoria.

### Flags de nota usadas 🟢

| Tabela.campo | Uso |
|---|---|
| `notas_saida_itens.comodato` | remessa (CFOP 5908/6908): quem recebeu, Popular |
| `notas_entrada_itens.comodato` | retorno: desconta no `em_poder` dos itens comuns |
| `notas_saida.tipo`/`geraDuplicata`/`comodato` | define "venda" nas sugestões e itens comuns |

### Respostas (contracts) 🟢

| Tipo | Campos |
|---|---|
| `EquipamentoComodato` | `id`, `produto` (id, codigoErp, descricao, unidade, categoria, ativo), `observacao`, `ativo`, `totalAplicacoes`, `totalClientes` (já receberam), `createdAt`, `updatedAt` |
| `EquipamentoComodatoDetalhe` | + `aplicacoes[]` (`id` da relação, `produto`, `observacao`) |
| `EquipamentoSugestao` | `produto`, `clientesComEquipamento`, `percentualComEquipamento`, `percentualGeral`, `descricaoParecida` |
| `EquipamentoComuns` | `totalClientes`, `grupos[]` (`subcategoria`, `clientes`, `percentual`, `produtos[]` com `clientes`/`percentual`) |
| `EquipamentoPopularResultado` | `criados`, `existentes` |
| `EquipamentoAplicacaoLoteResultado` | `adicionados`, `recusados[]` (`produtoId`, `motivo`) |
| `EquipamentoExcluirLoteResultado` | `excluidos`, `comAplicacoes` |

### Entradas (contracts) 🟢

`EquipamentoPopular` { `categoriaIds?` (≤ 200), `dataInicio?`, `dataFim?` (início ≤ fim) };
`EquipamentoComunsQuery` { `minimo` 1–100 = 50, `categoriaId?` };
`EquipamentoSugestoesQuery` { `categoriaId?` }; `EquipamentoAplicacaoLote` { `produtoIds` 1–100 }.

---

## Módulo `vendedores`

### `Vendedor` (tabela `vendedores`) 🟢

`@@unique([empresaId, chave])`; índices por `codigoErp`, `nome`, `superiorId`. **Sem**
unicidade de `usuarioId`.

| Campo | Tipo | Obrig. | Padrão | Observação |
|---|---|---|---|---|
| `id` | String (uuid) | sim | uuid | PK |
| `empresaId` | String | sim | — | tenant (RLS) |
| `usuarioId` | String? | não | — | login do vendedor; FK `Usuario` |
| `codigoErp` / `chave` | String? | não | — | código informativo / chave de integração |
| `nome` | String | sim | — | 1–100 |
| `nomeReduzido` | String? | não | — | até 50; usado nos rótulos |
| `telefone` | String? | não | — | até 15; origem do celular do SMS e do WhatsApp do usuário |
| `email` | String? | não | — | e-mail válido; obrigatório para criar usuário |
| `dataNascimento` | Date? | não | — | |
| `percComissao` | Float? | não | — | **só leitura** na tela; mantido pelo ERP; base da comissão do orçamento |
| `tipo` | `TipoVendedor` | sim | `vendedor` | inclui `superior` (usado em `origemDaVenda`) |
| `vinculo` | `VinculoVendedor`? | não | — | filtro da listagem |
| `usaDashboard` | Boolean | sim | true | aparece nas telas gerenciais |
| `atendeOutrasCarteiras` | Boolean | sim | false | WhatsApp: atende e usa ferramentas para carteira alheia |
| `superiorId` | String? | não | — | hierarquia (um ponteiro, sem teto de níveis); sem ciclo |
| `ativo` | Boolean | sim | true | o que os selects filtram; espelho de `desligado` |
| `desligado` | Boolean | sim | false | controle de saída mostrado na tela |
| auditoria | `createdAt`, `updatedAt`, `deletedAt`, `createdBy`, `updatedBy`, `deletedBy` | | | soft delete |

Relações: `superior`/`subordinados`, `clientes`, `notasSaida`, `notasSaidaItens`,
`titulosReceber`, `oportunidades`, `atividades` (carteira e atendimento), `objetivosVendedorMes`,
`orcamentos`, `whatsappSessoes`, `whatsappSessaoPeriodos`.

### Query (`vendedorQuerySchema`) 🟢

Paginação + `ativo`, `tipo`, `vinculo`, `usaDashboard`, `desligado`, `superiorId`;
`search` em nome, código e e-mail.

### Respostas derivadas 🟢

| Campo | Regra |
|---|---|
| `clientesAtivos` / `clientesInativos` | contagem de clientes não excluídos do vendedor, por `ativo` (só na listagem) |
| `criarUsuario` → `{id, nome, email, emailEnviado, smsEnviado, senhaProvisoria?}` | `senhaProvisoria` só quando nenhum canal entregou |
| `reenviarSenha` → `{success, emailEnviado, smsEnviado, senhaProvisoria?}` | idem |

---

## Módulo `leads`

### `Lead` (tabela `leads`) 🟢

`@@unique([empresaId, conversaId])` (um lead por conversa); `@@index([empresaId, situacao, createdAt])`.
Sem `deletedAt` e **sem relação declarada com `Vendedor`**.

| Campo | Tipo | Padrão | Observação |
|---|---|---|---|
| `id` | String (uuid) | uuid | PK |
| `empresaId` | String | — | tenant (RLS) |
| `nome`, `empresaInformada`, `documento` | String? | — | o que a pessoa disse; **não verificado** |
| `telefone` | String | — | origem — o único dado confiável |
| `interesse` | Text | — | uma linha escrita pela IA |
| `temperatura` | `LeadTemperatura` | `morno` | `quente` / `morno` / `frio` |
| `motivoClassificacao` | Text? | — | por que a IA classificou assim |
| `situacao` | `LeadSituacao` | `novo` | `novo` / `em_atendimento` / `convertido` / `descartado` |
| `vendedorId` | String? | — | dono; **sem FK** 🔴 |
| `assumidoPor` | String? | — | id do **usuário que entregou** |
| `assumidoEm` | DateTime? | — | quando foi entregue |
| `conversaId` | String? | — | conversa de origem |
| `observacao` | Text? | — | até 2000 no contrato |
| `createdAt`, `updatedAt` | DateTime | | |

### Entradas (contracts) 🟢

`LeadQuery`: paginação + `situacao?`, `temperatura?`, `search?`.
`LeadAtualizar`: `situacao?`, `vendedorId?` (uuid ou `null` = devolve à fila), `observacao?`.

### Resposta derivada 🟢

`vendedorNome`: nome do vendedor do lead (null sem dono ou com id inválido).

## Módulo `oportunidades`

### `Oportunidade` (tabela `oportunidades`) 🟢

Índices: `[empresaId, vendedorId]`, `[empresaId, clienteId]`, `[empresaId, estagio]`.
Relações: `Empresa`, `Cliente`, `Vendedor` (FKs obrigatórias); `atividades[]`, `orcamentos[]`.

| Campo | Tipo | Padrão | Observação |
|---|---|---|---|
| `id` | String (uuid) | uuid | PK |
| `empresaId` | String | — | tenant (RLS) |
| `clienteId` | String | — | FK `Cliente`; precisa estar na carteira do escopo |
| `vendedorId` | String | — | FK `Vendedor`; precisa estar no escopo |
| `titulo` | String | — | 1–150 |
| `estagio` | `EstagioOportunidade` | `prospeccao` | ver enum |
| `valorPrevisto` | Float? | — | ≥ 0; ponto flutuante 🟡 |
| `dataPrevisao` | DateTime? | — | previsão de fechamento |
| `dataFechamento` | DateTime? | — | automática (agora) ao ir para `ganha`/`perdida` sem data |
| `motivoPerda` | String? | — | até 300; **não obrigatório** em código |
| `observacao` | String? | — | até 1000 |
| `ativo` | Boolean | `true` | independente do estágio; `false` no soft delete |
| `createdAt`, `updatedAt`, `deletedAt` | DateTime | | soft delete |
| `createdBy`, `updatedBy`, `deletedBy` | String? | | id do usuário |

### `EstagioOportunidade` 🟢

`prospeccao` → `qualificacao` → `proposta` → `negociacao` → `ganha` | `perdida`.
Não há máquina de estados em código: qualquer transição é aceita, inclusive para trás.

### Entradas (contracts) 🟢

`OportunidadeCreate`: `clienteId`, `vendedorId`, `titulo` obrigatórios; `estagio`
(padrão `prospeccao`), `valorPrevisto`, `dataPrevisao`, `dataFechamento`, `motivoPerda`,
`observacao`, `ativo` (padrão `true`). `''` vira `null` no service.
`OportunidadeUpdate`: `OportunidadeCreate.partial()`.
`OportunidadeQuery`: paginação + `ativo?`, `estagio?`, `vendedorId?`, `clienteId?`, `search?`.

### Resposta 🟢

Registro + `cliente { id, razaoSocial, nomeFantasia }` + `vendedor { id, nome, nomeReduzido }`.

## Módulo `atividades`

### `Atividade` (tabela `atividades`) 🟢

Índices: `[empresaId, vendedorId]`, `[empresaId, vendedorAtendimentoId]`,
`[empresaId, clienteId]`, `[empresaId, oportunidadeId]`, `[empresaId, orcamentoId]`,
`[empresaId, dataVencimento]`.

| Campo | Tipo | Padrão | Observação |
|---|---|---|---|
| `id` | String (uuid) | uuid | PK |
| `empresaId` | String | — | tenant (RLS) |
| `clienteId` | String? | — | FK `Cliente`; conferido pela carteira |
| `oportunidadeId` | String? | — | FK `Oportunidade` |
| `orcamentoId` | String? | — | FK `Orcamento` |
| `vendedorId` | String | — | FK `Vendedor` (relação `AtividadeVendedorCarteira`) — dono da carteira, onde a agenda aparece |
| `vendedorAtendimentoId` | String? | — | FK `Vendedor` (`AtividadeVendedorAtendimento`) — quem atendeu, só quando difere do dono |
| `tipo` | `TipoAtividade` | `tarefa` | |
| `titulo` | String | — | 1–150 |
| `descricao` | String? | — | até 1000 |
| `dataVencimento` | DateTime? | — | ajustada ao dia útil (fuso Campo Grande) salvo `manterDiaNaoUtil` ou concluída |
| `concluida` | Boolean | `false` | |
| `dataConclusao` | DateTime? | — | automática ao concluir; limpa ao reabrir |
| `ativo` | Boolean | `true` | `false` no soft delete |
| `createdAt`, `updatedAt`, `deletedAt` | DateTime | | soft delete |
| `createdBy`, `updatedBy`, `deletedBy` | String? | | |

Sem campo que distinga atividade **manual** de **registro automático** 🟡.

### Entradas (contracts) 🟢

`AtividadeCreate`: `vendedorId` e `titulo` obrigatórios; `clienteId?`, `oportunidadeId?`,
`orcamentoId?` (uuid ou null), `tipo` (padrão `tarefa`), `descricao?`, `dataVencimento?`,
`manterDiaNaoUtil?` (controle, não persiste), `concluida` (padrão `false`),
`dataConclusao?`, `ativo` (padrão `true`).
`AtividadeUpdate`: `AtividadeCreate.partial()`.
`AtividadeQuery`: paginação + `ativo?`, `tipo?`, `vendedorId?`, `clienteId?`,
`oportunidadeId?`, `orcamentoId?`, `concluida?`, `vencidas?`, `dataInicio?`, `dataFim?`.

### Resposta 🟢

Registro + `cliente`, `vendedor`, `oportunidade { id, titulo }`, `orcamento { id, titulo }`.
`GET /atividades/feriados`: `[{ data, descricao }]`.

## Módulo `objetivos`

### `ObjetivoVendedorMes` (tabela `objetivos_vendedor_mes`) 🟢

`@@unique([empresaId, vendedorId, mes, ano])` — **sem `deletedAt`** 🔴;
`@@unique([empresaId, chave])`; índices `[empresaId, codigoErp]`, `[empresaId, ano, mes]`.

| Campo | Tipo | Padrão | Observação |
|---|---|---|---|
| `id` | String (uuid) | uuid | PK |
| `empresaId` | String | — | tenant (RLS) |
| `vendedorId` | String | — | FK `Vendedor`; precisa estar no escopo |
| `codigoErp` | String? | — | informativo; nulo na cópia |
| `chave` | String? | — | chave de integração (`X2_UNICO`) |
| `mes` | Int | — | 1–12 |
| `ano` | Int | — | 2000–2100 |
| `valor` | Float | 0 | meta em R$ |
| `numeroCliente` | Float? | — | meta de positivação (contagem) |
| `novoCliente` | Float? | — | meta de clientes novos (contagem) |
| `tipo` | String? | — | 1 caractere; `''` → `null` |
| `ativo` | Boolean | `true` | só objetivos ativos entram nos dashboards |
| `createdAt`, `updatedAt`, `deletedAt` | DateTime | | soft delete |
| `createdBy`, `updatedBy`, `deletedBy` | String? | | |

### `ObjetivoVendedorCategoria` (tabela `objetivos_vendedor_categoria`) 🟢

`@@unique([objetivoVendedorMesId, categoriaId])`, `@@unique([objetivoVendedorMesId, chave])`;
`onDelete: Cascade` do objetivo.

| Campo | Tipo | Padrão | Observação |
|---|---|---|---|
| `id` | String (uuid) | uuid | PK |
| `empresaId` | String | — | tenant |
| `objetivoVendedorMesId` | String | — | FK cabeçalho |
| `categoriaId` | String | — | FK `Categoria` |
| `chave` | String? | — | chave de integração, única no cabeçalho |
| `valor` | Float | 0 | meta da categoria em R$ |
| auditoria + `deletedAt` | | | o `update` apaga fisicamente, não usa `deletedAt` 🟡 |

### Entradas (contracts) 🟢

- `ObjetivoVendedorMesCreate`: `vendedorId`, `mes`, `ano`, `valor` (padrão 0),
  `numeroCliente?`, `novoCliente?`, `tipo?` (máx. 1), `ativo` (padrão `true`),
  `categorias[]` (`categoriaId`, `valor`; padrão `[]`).
- `ObjetivoVendedorMesUpdate`: o mesmo, parcial. `categorias` enviada substitui todas as
  linhas.
- `ObjetivoCopiarPeriodo`: `mesOrigem`, `anoOrigem`, `mesDestino`, `anoDestino`,
  `percReajuste` (−100..1000, padrão 0); destino ≠ origem.
- `ObjetivoDashboardQuery`: `mes`, `ano`, `vendedorId?`, `municipio?`.
- `ObjetivoDashboardMunicipiosQuery`: `mes`, `ano`, `vendedorId?`.
- `DashboardGerencialQuery` / `DashboardGerencialVendedorQuery`: `mes`, `ano` (+
  `vendedorId?` no primeiro).

### Respostas derivadas 🟢

- **Dashboard Comercial:** `objetivoValor`, `realizadoValor`, `percRealizado`,
  `objetivoClientes`, `clientesPositivados`, `percClientes`, `baseTotal`, `percBase`,
  `devolucaoTotal`, `municipio`, `categorias[{ categoriaId, codigoErp, descricao,
  realizado, objetivo }]`.
- **Dashboard Gerencial:** `periodo { mes, ano, label }`; `resumo { realizado, objetivo,
  percRealizado, clientesPositivados, objetivoClientes, percClientes, devolucao,
  baseTotal, percBase, clientesSemVendedor, totalNotas, ticketMedio }`; `linhas[{
  vendedorId, nome, tipo, superiorId, positivacaoObjetivo, positivacaoRealizado,
  percPositivacao, objetivo, realizado, percRealizado }]`; `responsaveis[{ id, nome,
  tipo:'superior' }]`; `agruparPorHierarquia`.
- **Detalhe do vendedor:** `vendedorId`, `nome`, `periodo`, `objetivo`, `realizado`,
  `percRealizado`, `categorias[…, percRealizado]`, `realizadoSemCategoria`.
- **Clientes sem vendedor:** `total`, `limite`, `linhas[{ clienteId, codigo, nome,
  cnpjCpf, ultimaCompra }]`.
- **Cópia:** `copiados`, `pulados`, `vendedoresPulados[]`.

## Módulo `meus-atendimentos`

Sem tabela própria: lê `Atividade` (ver seção `atividades`).

### Entrada — `MeusAtendimentosQuery` 🟢

| Campo | Tipo | Padrão | Observação |
|---|---|---|---|
| `dias` | int 1–365 | — | ausente = sem recorte; inclui hoje |
| `clienteId` | uuid? | — | só o que foi feito para o cliente |
| `escopo` | `proprio` \| `equipe` | `proprio` | `equipe` só vale com subordinados |
| `cursor` | string? | — | opaco, `base64url(ISO|id)` |
| `limite` | int 1–50 | 25 | |

### Resposta — `MeusAtendimentos` 🟢

| Campo | Observação |
|---|---|
| `dias`, `de`, `ate` | janela efetiva |
| `proximoCursor` | null quando não há mais |
| `escopo` | o efetivamente aplicado |
| `podeVerEquipe` | tem subordinados (ou escopo livre) |
| `totais { registros, clientes, whatsapp, documento, orcamento, agenda }` | do período inteiro, até 5000 |
| `itens[{ id, quando, titulo, descricao, categoria, clienteId, clienteNome, vendedorNome, concluida }]` | `quando = dataConclusao ?? createdAt`; `clienteNome = nomeFantasia ‖ razaoSocial` |

## Módulo `consultas`

Sem tabela própria (SQL bruto sobre `notas_saida`, `notas_saida_itens`, `clientes`,
`vendedores`, `produtos`, `categorias`).

### Entradas (contracts) 🟢

Comum: `anoInicial`, `mesInicial`, `anoFinal`, `mesFinal` (até 12 meses),
`vendedorIds?` (até 50), `baseVendedor?` (`nota` | `cliente`).

| Query | Campos extras |
|---|---|
| `ConsultaVendasClienteQuery` / `ConsultaVendasVendedorQuery` | — |
| `ConsultaVendasProdutoQuery` | `categoriaId?` |
| `ConsultaVendasCategoriaQuery` | `categoriaId?` (raiz), `subCategoriaId?` |
| `ConsultaEvolucaoQuery` | `indicador` (`vendas` padrão, `positivados`, `novos`, `inativados`) |

### Resposta — `ConsultaVendasResultado` 🟢

| Campo | Observação |
|---|---|
| `periodo { anoInicial, mesInicial, anoFinal, mesFinal, label }` | label "MM/AAAA a MM/AAAA" |
| `colunas[{ ano, mes, … }]` | um por mês |
| `baseVendedor` | a base efetivamente usada |
| `vendedores[{ id, nome }]` | nomes dos filtrados, por nome |
| `categoria` | `{ id, descricao }` ou null |
| `linhas[{ id, codigo, descricao, valores[], total, media }]` | ordenadas por total desc; `media` = total ÷ meses com valor ≠ 0 |
| `totais[]`, `total`, `media` | rodapé |

`ConsultaVendasCategoriaResultado`: idem + `subCategoria`; `linhas` em árvore (`filhos`)
categoria → subcategoria → produto.
`ConsultaEvolucaoResultado`: idem + `indicador`, `formato` (`moeda` | `quantidade`).

## Módulo `relatorios`

Sem tabela própria (lê `notas_entrada(_itens)`, `notas_saida(_itens)`, `estoques`,
`armazens`, `produtos`, `categorias`, `fornecedores`, `clientes`, `vendedores`).

### Entradas (contracts) 🟢

| Query | Campos |
|---|---|
| `RelatorioComprasQuery` | `inicio`, `fim` (AAAA-MM-DD), `page`, `pageSize` (1–20000), `ordem?`, `sentido`, `categoriaIds?`, `documento?`, `produtoIds?`, `fornecedorIds?` |
| `RelatorioVendasQuery` | `inicio`, `fim`, paginação/ordem, `vendedorIds?`, `clienteIds?`, `municipio?`, `categoriaIds?`, `notaFiscal?`, `produtoIds?` |
| `RelatorioVendasPorVendedorQuery` | `inicio`, `fim` (até 12 meses), `vendedorIds?`, `clienteIds?`, `produtoIds?`, `categoriaIds?`, `quebraPorVendedor?` |
| `RelatorioEstoqueCompraQuery` | `inicio`, `fim`, `mesesPeriodo?` (atalho), `mesesCompra`, `produtoIds?`, `categoriaIds?`, `codigoCorp?`, `fornecedorIds?`, `comMovimento?` |
| `RelatorioOpcoesQuery` | `busca?` (+ `:tipo` = `produtos` \| `fornecedores` \| `clientes`) |

### Respostas 🟢

- `RelatorioResultado<L>`: `linhas`, `total`, `page`, `pageSize`, `totalPages`, `totais`.
- `RelatorioComprasLinha`: `id`, `documento`, `serie`, `produtoCodigo`, `descricao`,
  `quantidade`, `unidade`, `vlrUnitario`, `aliqIpi`, `vlrTotal`, `aliqIcms`, `vlrIpi`,
  `vlrIcms`, `vlrIcmsSt`, `codigoForCli`, `razaoSocial`, `dtDigitacao`. Totais:
  `quantidade`, `vlrTotal`, `vlrIpi`, `vlrIcms`, `vlrIcmsSt`.
- `RelatorioVendasLinha`: `id`, `vendedor`, `clienteCodigo`, `clienteNome`, `municipio`,
  `emissao`, `notaFiscal`, `produtoCodigo`, `produto`, `quantidade`, `vlrProduto`,
  `vlrItem`. Totais: `quantidade`, `vlrItem`.
- `RelatorioVendasPorVendedorResultado`: `meses[]` ("AAAA-MM"), `quebraPorVendedor`,
  `linhas[{ vendedorId, vendedor, clienteId, clienteCodigo, clienteNome, meses[{ mes,
  quantidade, valor }], totalQuantidade, totalValor }]`, `totalQuantidade`, `totalValor`.
- `RelatorioEstoqueCompraResultado`: `mesesPeriodo`, `mesesCompra`, `linhas[{
  produtoId, codigo, descricao, codigoCorp, fornecedor, estoque, entradas, saidas,
  ultimoPreco, media, aComprar }]`.
- `RelatorioOpcao`: `id`, `codigo`, `nome`, `detalhe`.

## Módulo `whatsapp`

Todas as tabelas `whatsapp_*` têm `empresaId` e RLS.

### `WhatsappSessao` (tabela `whatsapp_sessoes`) 🟢

`@@unique([empresaId, vendedorId])` (um número por vendedor); índices `[empresaId, status]`,
`[empresaId, instanciaExterna]`. Número único entre sessões conectadas de qualquer
empresa pela função `whatsapp_numero_em_uso`.

| Campo | Tipo | Observação |
|---|---|---|
| `tipo` | `WhatsappSessaoTipo` | `vendedor` (padrão) \| `empresa` (institucional) |
| `vendedorId` | String? | nulo no institucional |
| `usuarioId` | String? | quem pareou; precisa ser o logado para ver |
| `numero`, `jid` | String? | número conectado |
| `contaComercial`, `nomeComercial` | Boolean?, String? | WhatsApp Business |
| `status` | `WhatsappSessaoStatus` | `desconectada` (padrão), `pareando`, `conectada`, `banida` |
| `transporte` | `WhatsappTransporte` | padrão `zapo` no schema; em uso `evolution_go` |
| `credencialCifrada` | Text? | legado zapo |
| `instanciaExterna`, `instanciaId` | String? | instância no gateway |
| `instanciaTokenCifrado`, `webhookSegredoCifrado` | Text? | AES-256-GCM (`WHATSAPP_CRYPTO_KEY`) |
| `ultimaConexao`, `ultimoErro` | | estado |
| `aceiteEm`, `aceiteVersao` | | ciência de que tudo é monitorado |

`WhatsappSessaoPeriodo`: períodos de conexão da sessão.

### `WhatsappContato` (tabela `whatsapp_contatos`) 🟢

`@@unique([empresaId, jid])`; índices por `telefoneNormalizado`, `clienteId`, `clienteContatoId`.
**Compartilhado entre as sessões da empresa.**

| Campo | Tipo | Observação |
|---|---|---|
| `jid` | String | `@s.whatsapp.net` ou `@lid` (opaco) |
| `nomeExibicao` | String? | apelido só preenche vazio; agenda pode corrigir |
| `telefoneNormalizado` | String? | só dígitos |
| `tipo` | `WhatsappTipoContato` | `geral`, `financeiro`, `compras`, `contabilidade_fiscal`, `outros` |
| `email`, `fotoUrl` | String? | |
| `clienteId` | String? | **autoriza as ferramentas de cliente**; preenchido manualmente ou por `casarCliente` (8 últimos dígitos) |
| `clienteContatoId` | String? | pessoa em `cliente_contatos` |
| `vinculadoPor`, `vinculadoEm` | | só no vínculo manual |
| `ignorado` | Boolean | `false` |

### `WhatsappConversa` (tabela `whatsapp_conversas`) 🟢

`@@unique([empresaId, sessaoId, contatoId])`.

| Campo | Tipo | Observação |
|---|---|---|
| `sessaoId`, `contatoId` | String | `onDelete: Restrict` |
| `clienteId` | String? | copiado do contato |
| `ultimaMensagemEm`, `ultimaMensagemClienteEm` | DateTime? | a segunda é a janela de 24 h |
| `naoLidas` | Int | 0 |
| `arquivada` | Boolean | false |
| `atendimento` | `WhatsappAtendimentoStatus` | `humano` (padrão; `bot` no institucional novo), `aguardando`, `encerrada` |
| `saudadoEm` | DateTime? | saudação já enviada |
| `atendenteVendedorId` | String? | a quem a triagem direcionou / quem assumiu |
| `assunto` | String? | até 200 |
| `direcionadaEm`, `assumidaEm`, `clienteVinculadoEm` | DateTime? | marcos dos indicadores |

### `WhatsappMensagem` (tabela `whatsapp_mensagens`) 🟢

`@@unique([empresaId, conversaId, externoId])` (idempotência da reentrega).

| Campo | Tipo | Observação |
|---|---|---|
| `externoId` | String | id do WhatsApp |
| `direcao` | `entrada` \| `saida` | |
| `tipo` | `WhatsappTipoMensagem` | 13 valores, inclui interativos |
| `conteudo` | Text? | texto |
| `arquivoUrl`, `arquivoNome`, `arquivoMime` | String? | mídia em disco/MinIO, por empresa |
| `enviadaPor` | String? | usuário, `triagem-ia` ou `triagem-ia-aviso` |
| `statusEntrega` | `WhatsappStatusEntrega` | `pendente`…`lida`, `erro` |
| `respondeuA` | String? | id citado |
| `numeroSessao` | String? | número que recebeu/enviou |
| `interativo`, `enqueteVotos` | Json? | botões, lista, enquete |
| `editadaEm`, `apagadaEm`, `conteudoOriginal` | | edição e exclusão preservam o original |
| `criadaEm` | DateTime | data do WhatsApp |

### Demais tabelas 🟢

| Model | Para quê |
|---|---|
| `WhatsappReacao` | reações (`WhatsappLadoReacao`) |
| `WhatsappMensagemAgendada` | envio futuro; `WhatsappAgendamentoStatus` (`pendente`, `enviando`, `enviada`, `erro`, `cancelada`) |
| `WhatsappRecadoInterno` / `WhatsappRecadoDestinatario` | recado da empresa para a própria equipe, pelo institucional |
| `WhatsappAcaoRegistro` | registro das ações enviadas na conversa (título, boleto, visita…) |
| `WhatsappVinculoFuncionario` | pareamento do telefone do funcionário: código, tentativas, `confirmadoEm`, `validoAte` (30 dias) |
| `WhatsappConfig` | singleton por empresa: `ativo`, `transporte`, Evolution (`evolutionUrl`, chave cifrada, flags `alwaysOnline`/`ignoreGroups`/`ignoreStatus`/`readMessages`/`rejectCall`), colunas legadas Cloud API, `dddPadrao`, `retencaoDias`, `historicoDias`, triagem (`atendimentoIaAtivo` false, `atendimentoSaudacao`, `atendimentoInformacoes`, `atendimentoInatividadeMin` 30) |
| `WhatsappTemplate` | templates sincronizados |
| `WhatsappRespostaRapida` | atalhos de texto |
| `Lead` | captado por `registrar_lead` (ver `leads`) |

## Módulo `agente`

### `AgenteConfig` (tabela `agente_config`) 🟢

Singleton por empresa (`empresaId` único).

| Campo | Tipo | Padrão | Observação |
|---|---|---|---|
| `ativo` | Boolean | false | |
| `provedor` | String | `anthropic` | `anthropic`, OpenAI-compatível, `codex` |
| `baseUrl` | String | `https://api.anthropic.com` | |
| `modelo` | String | `claude-opus-5` | |
| `apiKeyCifrada`, `apiKeyUltimos4` | String? | | legado; a credencial atual fica em `AgenteCredencial` |
| `embeddingBaseUrl`, `embeddingModelo`, `embeddingApiKeyCifrada`, `embeddingApiKeyUltimos4` | String? | | embeddings opcionais |
| `nomeAgente` | String | "Assistente" | |
| `mensagemBoasVindas`, `systemPrompt` | Text? | | personalidade |
| `temperatura` | Float | 0,3 | |
| `maxTokens` | Int | 2048 | |
| `maxIteracoesFerramentas` | Int | 5 | voltas por turno |
| `historicoMensagens` | Int | 20 | contexto |
| `termosPromptAceitosEm`, `termosPromptAceitosPor` | | | aceite para editar prompts |

### `AgenteCredencial` (tabela `agente_credenciais`) 🟢

`@@unique([empresaId, provedor])`. `apiKeyCifrada`/`apiKeyUltimos4`, `modelo`; para o Codex:
`accessTokenCifrado`, `refreshTokenCifrado`, `contaId` (header `ChatGPT-Account-ID`),
`contaEmail`, `tokenExpiraEm`.

### `AgenteConversa` (tabela `agente_conversas`) 🟢

`usuarioId` (dono, único que lê), `titulo` (60 primeiros caracteres), `arquivada`.

### `AgenteMensagem` (tabela `agente_mensagens`) 🟢

Índice `[empresaId, conversaId, criadaEm]`.

| Campo | Tipo | Observação |
|---|---|---|
| `papel` | `AgentePapel` | `usuario`, `assistente`, `ferramenta` |
| `conteudo` | Text? | assistente gravado **mascarado**; ferramenta = resumo da ação |
| `ferramenta`, `argumentos` | String?, Json? | chamada |
| `resultado` | Json? | leitura: `{ resumo }` mascarado; escrita confirmada: resultado da execução |
| `pendente` | Boolean | escrita aguardando confirmação |
| `confirmadaEm`, `confirmadaPor` | | |
| `tokensEntrada`, `tokensSaida` | Int? | consumo |

### Governança 🟢

- `AgenteFerramenta` (`agente_ferramentas`, único `[empresaId, chave]`): `ativa`, `nome`,
  `descricao`, `instrucoes`, `versaoPrompt`, perfis.
- `AgenteFerramentaPerfil` (único `[ferramentaId, perfilId]`): restrição por perfil.
- `AgenteFerramentaAuditoria`: `chave`, `campo`, `valorAnterior`, `valorNovo`,
  `autorId`, `autorEmail`, `criadoEm`.

### Outras 🟢

- `AgenteAnexo` (`agente_anexos`): `usuarioId`, `arquivo`, `arquivoNome`, `mime`,
  `tamanho`, `conversaId?`, `consumidoEm?`.
- `AgenteResumoExibido` (PK `[empresaId, usuarioId]`): `data` do último resumo diário
  mostrado.

## Módulo `notificacoes`

### `Notificacao` (tabela `notificacoes`) 🟢

Índices: `[empresaId, usuarioId, lidaEm, ocorridaEm]` (o sino), `[empresaId, tipo, referenciaId]`
(fechar em lote) e o **único parcial** `notificacoes_pendente_por_referencia`
`(empresaId, usuarioId, tipo, referenciaId) WHERE lidaEm IS NULL AND referenciaId IS NOT NULL`
(migration `20260902180000_notificacoes_indice_pendente`).

| Campo | Tipo | Padrão | Observação |
|---|---|---|---|
| `id` | String (uuid) | uuid | PK |
| `empresaId` | String | — | tenant (RLS) |
| `usuarioId` | String | — | destinatário (FK `Usuario`) |
| `tipo` | `NotificacaoTipo` | — | 11 valores |
| `titulo` | String | — | |
| `descricao` | String? | — | |
| `rota` | String? | — | para onde a linha leva |
| `referenciaId` | String? | — | origem (conversa, atividade, cliente…); deduplica a pendente |
| `contador` | Int | 1 | ocorrências agrupadas |
| `ocorridaEm` | DateTime | — | ordena o feed; pode ser anterior a `criadaEm` |
| `lidaEm` | DateTime? | — | nula = no sino |
| `criadaEm`, `atualizadaEm` | DateTime | | |

### Resposta — `NotificacoesFeed` 🟢

`total` (não lidas, sem `whatsapp_mensagem`), `itens[{ id, tipo, titulo, descricao, data, rota, contador }]` (até 20).

## Módulos `email` e `documentos-email`

Sem tabelas próprias: a configuração fica em `parametros_empresa` (ver a tabela de
parâmetros em `code-analysis.md`, módulo `email`).

### Contracts 🟢

- `EmailConfiguracao`: `ativo`, `host`, `porta`, `seguro`, `usuario`, `senhaPreenchida`,
  `remetente`, `documentos`, `boleto`, `cobranca`, `senhaProvisoria`,
  `usaServidorDoAmbiente`, `smtpConfigurado`, `habilitado`.
- `EmailConfiguracaoUpdate`: o mesmo, com `senha` (vazia mantém a atual).
- `EmailDisponibilidade`: `habilitado`, `documentos`, `boleto`, `cobranca`, `senhaProvisoria`.
- `EmailModelosConfiguracao` / `EmailModelosUpdate`: assunto e texto de cobrança, nota e
  boleto; `corCabecalho`; `replyToUsuario`, `incluirAssinaturaUsuario`,
  `incluirTelefoneUsuario`, `incluirEmailUsuario`.
- `EmailModeloTesteInput`: o modelo e um `destinatario?`.
- `EnviarNotaEmail`: `incluirXml`. `EnviarBoletoEmail`: atualizado ou original.
- `EnvioEmailResultado`: `enviadoPara[]`, `anexos[]`, `avisos[]`.

## Módulo `sms`

### `SmsEnvio` (tabela `sms_envios`) 🟢

Índices: `[empresaId, createdAt]`, `[empresaId, tituloReceberId, motivo]` (um aviso por
título e tipo), `[empresaId, clienteId]`.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | também vai como `client_ref` à iAgente |
| `motivo` | `SmsMotivo` | `boleto`, `cobranca`, `mensagem_livre`, `senha_provisoria`, `aviso_antes_vencimento`, `aviso_depois_vencimento` |
| `celular`, `mensagem` | String | |
| `clienteId`, `vendedorId`, `tituloReceberId` | String? | sem FK declarada |
| `provedorId` | String? | id na iAgente |
| `status` | String | texto livre da iAgente (agrupado por `situacaoDoStatus`) |
| `statusEm`, `erro` | | |
| `createdAt`, `createdBy` | | |

### `SmsResposta` (tabela `sms_respostas`) 🟢

`smsEnvioId?` (`onDelete: SetNull`), `clienteId?`, `celular`, `mensagem`, `recebidaEm`,
`createdAt`. Índices `[empresaId, smsEnvioId]`, `[empresaId, clienteId]`.

---

## Módulo `armazenamento`

Sem tabela própria: guarda arquivos em disco (`uploads/`) ou no MinIO; o banco guarda só o
endereço `/uploads/<chave>` nas tabelas dos outros módulos.

### `ConfigArmazenamento` / `ConfigS3` 🟢

| Campo | Tipo | Observação |
|---|---|---|
| `raizDisco` | string | `UPLOADS_DIR` = `<cwd>/uploads` |
| `pastasS3` | string[] | de `ARMAZENAMENTO_S3_PASTAS` |
| `s3.endpoint` | string | rede interna (`http://minio:9000`) |
| `s3.endpointPublico` | string | host que o navegador alcança; assina o link |
| `s3.regiao` | string | padrão `us-east-1` |
| `s3.bucket`, `s3.accessKey`, `s3.secretKey` | string | |

### `ArquivoListado` 🟢

`chave` (relativa a `uploads/`), `bytes`, `modificadoEm` (ms; no S3 = `LastModified`).

### `ResultadoMidiaOrfa` 🟢

`arquivosNaPasta`, `referenciados`, `recentesIgnorados`, `orfaos`, `bytesOrfaos`,
`amostra` (até 20 nomes, relativos a `whatsapp/`), `apagados`, `falhas`.

### Resultado de `migrarParaS3` 🟢

`copiados`, `bytes`, `falhas` (nomes relativos à pasta), `restantes` (ainda em disco).

### Resultado de `situacao` 🟢

`s3Configurado`, `bucket` (ou `null`), `conexao` (`null` sem S3, `'ok'` ou o motivo em
português), `pastas: [{pasta, noDisco}]`.

### DTOs 🟢

- `VarrerMidiaOrfaDto`: `apagar: boolean`.
- `MigrarPastaDto`: `pasta: string` (`^[a-z0-9-]+$`).

---

## Módulo `backup-empresa`

### `EmpresaBackup` (tabela `empresa_backups`) 🟢

RLS por empresa (`tenant_isolation_empresa_backups`). Índices: `[empresaId, iniciadoEm]`
e o único parcial `empresa_backups_um_gerando` (um `gerando` por empresa).

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | |
| `empresaId` | String | FK `Empresa` |
| `origem` | `BackupEmpresaOrigem` | `manual`, `agendado` |
| `situacao` | `BackupEmpresaSituacao` | `gerando` (padrão), `pronto`, `falhou` |
| `chave` | String? | chave no armazenamento; nula gerando ou com falha |
| `bytes` | BigInt? | devolvido como `number` no resumo |
| `registros`, `arquivos` | Int? | |
| `erro` | String? | até 2000 caracteres |
| `solicitadoPor` | String? | usuário; nulo no agendado (sem FK) |
| `iniciadoEm` | DateTime | `now()` |
| `concluidoEm` | DateTime? | |

### `BackupEmpresaConfig` (tabela `backup_empresas_config`) 🟢

Linha única (`id = 'unico'`, criada por `upsert` na primeira leitura).

| Campo | Tipo | Padrão |
|---|---|---|
| `ativo` | Boolean | `true` |
| `frequenciaDias` | Int | 7 (DTO: 1–90) |
| `manter` | Int | 4 (DTO: 1–52) — só agendados |
| `atualizadoEm`, `atualizadoPor` | | |

### Estrutura do pacote (formato 1) 🟢

| Caminho no zip | Conteúdo |
|---|---|
| `dados/<tabela>.jsonl` | uma linha JSON por registro, campos escalares na ordem do schema |
| `planilhas/<tabela>.csv` | o mesmo em CSV (BOM, `;`) |
| `arquivos/<chave>` | arquivos referenciados, na mesma chave do armazenamento |
| `manifesto.json` | `formato`, `empresaId`, `geradoEm`, `origem`, `versaoSchema`, `registros`, `tabelas{}`, `arquivos`, `arquivosAusentes[]`, `mascarados{campos, parametros}`, `especiais`, `fora` |
| `LEIA-ME.txt` | explicação em português |

### `BackupResumo` (resposta da API) 🟢

`id`, `empresaId`, `origem`, `situacao`, `bytes`, `registros`, `arquivos`, `erro`,
`iniciadoEm`, `concluidoEm`. `EmpresaComBackups` = `{empresa{id, razaoSocial,
nomeFantasia, cnpj}, backups[]}`.

---

## Módulo `assinaturas`

### `Assinatura` (tabela `assinaturas`) 🟢

Sem RLS de empresa (lida pela administração da plataforma).

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | |
| `grupoEconomicoId` | String? `@unique` | o contrato atual: um por grupo |
| `empresaId` | String? `@unique` | resquício da assinatura por empresa (`onDelete: Restrict`) |
| `planoId` | String | FK `Plano` |
| `situacao` | `SituacaoAssinatura` | `ativa` (padrão), `teste`, `atrasada`, `suspensa`, `cancelada` |
| `ciclo` | `CicloPagamento` | `mensal` (padrão), `trimestral`, `semestral`, `anual` |
| `valorMensalidade` | Decimal(12,2) | **valor cobrado por ciclo** (nome histórico); padrão 0 |
| `diaVencimento` | Int | 1–31 (Zod), padrão 10 |
| `inicioEm` | DateTime | `now()` |
| `proximoVencimentoEm`, `canceladaEm` | DateTime? | não calculados por código |
| `observacoes` | Text? | |
| `createdAt/By`, `updatedAt/By` | | |

### `AssinaturaUpdate` (Zod) 🟢

`planoId?` (uuid), `situacao?`, `ciclo?`, `valorMensalidade?` (≥ 0), `diaVencimento?`
(1–31), `observacoes?`.

### Propagação para `Empresa` 🟢

| Assinatura | Empresa (`situacao`) | Outros campos |
|---|---|---|
| `ativa` | `ativa` | `testeExpiraEm = null` |
| `teste` | `teste` | `testeExpiraEm` mantido |
| `atrasada` | **`suspensa`** | `testeExpiraEm = null` |
| `suspensa` / `cancelada` | igual | `testeExpiraEm = null` |
| sempre | | `limiteUsuarios = plano.limiteUsuarios` |

---

## Módulo `planos`

### `Plano` (tabela `planos`) 🟢

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | |
| `nome` | String | até 100 (Zod) |
| `codigo` | String `@unique` | até 50; único inclusive entre excluídos |
| `descricao` | Text? | até 500 |
| `valorMensal`, `valorTrimestral`, `valorSemestral`, `valorAnual` | Decimal(12,2) | padrão 0 |
| `limiteUsuarios` | Int? | nulo = sem limite |
| `limiteEmpresas` | Int | padrão 1 (Zod: 1–10000) — empresas por grupo |
| `ativo` | Boolean | inativo não aceita assinatura nova |
| `createdAt/By`, `updatedAt/By`, `deletedAt/By` | | soft delete |

### `PlanoModulo` / `PlanoMenu` / `PlanoRotina` 🟢

Chave composta `(planoId, moduloId|menuId|rotinaId)`. Allowlist: lista vazia = sem
restrição.

### `PlanoCreate` (Zod; `PlanoUpdate` = parcial) 🟢

`nome`, `codigo`, `descricao?`, `valorMensal`, `valorTrimestral=0`, `valorSemestral=0`,
`valorAnual=0`, `limiteUsuarios?`, `limiteEmpresas=1`, `ativo=true`, `moduloIds=[]`,
`menuIds=[]`, `rotinaIds=[]`. **Não aplicado pelo controller** (`dto: any`).

---

## Módulo `plataforma`

### `PlataformaAuditoria` (tabela `plataforma_auditoria`) 🟢

Sem RLS de empresa e sem FK (o log sobrevive à exclusão do usuário e da empresa).

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | |
| `usuarioId`, `usuarioEmail` | String | quem executou |
| `empresaId`, `empresaRazaoSocial` | String? | empresa afetada; o nome vai junto |
| `acao` | String | `empresa.criada`, `empresa.situacao_alterada`, `empresa.teste_alterado`, `empresa.limite_alterado`, `empresa.admin_vinculado`, `empresa.admin_desvinculado`, `admin.promovido`, `admin.revogado` |
| `valorAnterior`, `valorNovo` | String? | o motivo vai como sufixo `(motivo)` |
| `createdAt` | DateTime | |

### `PlataformaEmpresa` (linha da listagem) 🟢

`id`, `razaoSocial`, `nomeFantasia`, `cnpj`, `alias`, `situacao`, `testeExpiraEm`,
`limiteUsuarios`, `usuariosAtivos`, `testeExpirado`, `ultimoAcesso`, `createdAt`.

### `PlataformaEmpresaCreate` (Zod) 🟢

Campos cadastrais de `empresaCreateSchema` + `razaoSocial`/`nomeFantasia` (2–150),
`tipoPessoa`, `cnpj`, `alias?` (2–40, `^[a-z0-9-]+$`), `situacao` (padrão `teste`),
`testeExpiraEm?`, `limiteUsuarios?` (≥ 1), `admin{nome? (2–120), email, senha? (8–72)}`.

### `PlataformaSituacaoUpdate` (Zod) 🟢

`situacao?`, `testeExpiraEm?` (ISO ou `null` = sem prazo), `limiteUsuarios?` (≥ 1 ou
`null` = sem limite), `motivo?` (até 500). Ao menos um dos três primeiros.

### `PlataformaEmpresaAdmin` 🟢

`usuarioId`, `nome`, `email`, `ativo`, `empresasQueAdministra`, `ultimoLogin`.

---

## Módulo `parametros`

### `ParametroEmpresa` (tabela `parametros_empresa`) 🟢

RLS por empresa. `@@unique([empresaId, parametro])` (inclui excluídos),
`@@index([empresaId, parametro])`.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | |
| `empresaId` | String | |
| `parametro` | String | chave `^[A-Z0-9_]+$`, 2–60 |
| `tipo` | `TipoParametro` | `texto` (padrão), `numero`, `booleano`, `data`, `senha` |
| `tamanho` | Int? | 1–4000; limite do conteúdo |
| `conteudo` | String? | até 4000; **texto puro, inclusive para `senha`** |
| `descricao` | String? | até 255 |
| `ativo` | Boolean | inativo = lido como inexistente |
| `createdAt/By`, `updatedAt/By`, `deletedAt/By` | | soft delete |

Na resposta da API: `conteudo = null` para `senha` e `preenchido: boolean`.

### Parâmetros com constante no código 🟢

`ARMAZEM_PADRAO`, `TABELA_PRECO_PADRAO`, `TABELA_PRECO_CAPITAL`,
`TABELA_PRECO_INTERIOR`, `ORCAMENTO_EXIBIR_FOTOS_PRODUTOS`,
`BOLETO_PRAZO_MAXIMO_REEMISSAO`, `ULTIMA_COMUNICACAO_ERP` (ISO 8601, gravado pela
integração). Os de SMTP (`SMTP_*`), SMS (`SMS_*`) e outros estão nas seções dos módulos
que os leem.

---

## Módulo `escopo`

Sem tabela própria. Resposta de `GET /escopo/vendedores`:
`{ data: [{id, nome, nomeReduzido}], restrito: boolean }`.

---

## Módulos `politica-senha` e `recuperacao-senha`

### `PoliticaSenha` (contrato, resolvida dos parâmetros) 🟢

| Campo | Parâmetro | Padrão | Combinação entre empresas |
|---|---|---|---|
| `tamanhoMinimo` | `SENHA_TAMANHO_MINIMO` | 8 | maior |
| `tamanhoMaximo` | `SENHA_TAMANHO_MAXIMO` | 0 = sem máximo | menor não zero |
| `exigirMaiuscula` | `SENHA_EXIGIR_MAIUSCULA` | `true` | OU |
| `exigirMinuscula` | `SENHA_EXIGIR_MINUSCULA` | `false` | OU |
| `exigirNumero` | `SENHA_EXIGIR_NUMERO` | `true` | OU |
| `exigirEspecial` | `SENHA_EXIGIR_ESPECIAL` | `false` | OU |
| `diasParaExpirar` | `SENHA_DIAS_PARA_EXPIRAR` | 0 = não expira | menor não zero |
| `historicoQuantidade` | `SENHA_HISTORICO_QUANTIDADE` | 0 | maior |
| `tentativasAntesBloqueio` | `SENHA_TENTATIVAS_ANTES_BLOQUEIO` | 5 | menor não zero |
| `minutosBloqueio` | `SENHA_MINUTOS_BLOQUEIO` | 15 | maior |

### `SenhaHistorico` (tabela `senha_historico`) 🟢

`id`, `usuarioId` (FK), `senhaHash` (o hash **substituído**), `createdAt`. Índice
`[usuarioId, createdAt]`. Fora do backup por empresa.

### `SenhaRedefinicao` (tabela `senha_redefinicoes`) 🟢

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | |
| `usuarioId` | String | FK `Usuario`, `onDelete: Cascade` |
| `tokenHash` | String `@unique` | SHA-256 hex do token (o token só vai no e-mail) |
| `expiraEm` | DateTime | criação + 30 min |
| `usadoEm` | DateTime? | ao usar ou ao pedir outro link |
| `ip` | String? | de quem pediu |
| `criadoEm` | DateTime | |

### Entradas (Zod) 🟢

`EsqueciSenhaInput` = `{email, empresaAlias?}`; `RedefinirSenhaInput` =
`{token, novaSenha}`.

---

## Módulo `suporte-acesso`

### `EmpresaSuporteAcesso` (tabela `empresa_suporte_acessos`) 🟢

Índice `[empresaId, validoAte, revogadoEm]`. Preservada na limpeza da base (auditoria).

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | |
| `empresaId` | String | FK `Empresa` |
| `concedidoPorId` | String | FK `Usuario` |
| `motivo` | Text | 5–500 (contrato) |
| `validoAte` | DateTime | concessão + `duracaoHoras` |
| `revogadoEm`, `revogadoPorId` | DateTime?, String? | |
| `createdAt`, `updatedAt` | | |

### `EmpresaSuporteLog` (tabela `empresa_suporte_logs`) 🟢

Índice `[empresaId, createdAt]`; `suporteAcessoId` com `onDelete: Cascade`.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | |
| `empresaId`, `suporteAcessoId`, `usuarioPlataformaId` | String | |
| `metodoHttp`, `rota` | String | |
| `payload` | Text? | corpo JSON, até 2000 caracteres, sem máscara |
| `ip`, `userAgent` | String? | |
| `createdAt` | DateTime | |

### `ConcederSuporte` (Zod, não aplicado no controller) 🟢

`motivo` (5–500), `duracaoHoras` (inteiro 1–72, padrão 4).

---

## Módulo `integracao`

As entidades de negócio que a API grava (`Produto`, `Cliente`, `TituloReceber`, `NotaSaida`...) estão
nos módulos de cada uma. Aqui ficam as tabelas **da própria integração**.

### `IntegracaoApiKey` (tabela `integracao_api_keys`) 🟢

**Sem RLS** de propósito (o `ApiKeyGuard` consulta por `chaveHash` antes de existir empresa de
contexto); o filtro por `empresaId` é a única barreira nas telas. Índice `[empresaId]`.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | String (uuid) | |
| `empresaId` | String | FK `Empresa` |
| `nome` | String | 1–100 |
| `chaveHash` | String | **único**; SHA-256 da chave em claro |
| `prefixo` | String | 12 primeiros caracteres (`itg_xxxxxxxx`) |
| `ativo` | Boolean | padrão `true`; `false` revoga na hora |
| `expiraEm` | DateTime? | nulo = não expira |
| `ultimoUso`, `ultimaColeta`, `ultimoEnvio` | DateTime? | batimento do guard (no máximo 1×/min) |
| `createdAt`, `updatedAt`, `deletedAt`, `createdBy`, `updatedBy`, `deletedBy` | | auditoria e soft delete |

### `IntegracaoEndpointConfig` (tabela `integracao_endpoint_configs`) 🟢

RLS por empresa. Único `[empresaId, endpointKey]`. Sem linha = endpoint **ativo**.

| Campo | Tipo | Observação |
|---|---|---|
| `endpointKey` | String | uma das 20 chaves do catálogo |
| `nome` | String | do catálogo |
| `ativo` | Boolean | padrão `true` |
| `ultimoUso`, `totalChamadas` | DateTime?, Int | estatística gravada pelo guard |
| auditoria e soft delete | | |

### `IntegracaoCarga` (tabela `integracao_cargas`) 🟢

RLS por empresa. Índice `[empresaId, situacao, createdAt]`.

| Campo | Tipo | Observação |
|---|---|---|
| `apiKeyId` | String | chave em nome da qual a carga corre (a tela escolhe uma da empresa) |
| `descricao` | String? | até 200 |
| `arquivo` | Bytes | **sempre gzip**, no banco (sobrevive a redeploy) |
| `tamanho` | Int | bytes recebidos |
| `entidades` | Json | linhas por entidade, contadas no recebimento |
| `situacao` | enum | `aguardando` (tela) · `recebida` (fila) · `processando` · `concluida` · `cancelada` · `erro` |
| `totalLinhas`, `linhasProcessadas` | Int | progresso |
| `ultimaLinha` | Int | checkpoint de retomada (linha em branco conta na posição) |
| `criados`, `atualizados`, `excluidos`, `erros` | Int | contadores |
| `mensagem` | String? | motivo quando a carga inteira parou |
| `cancelarSolicitado` | Boolean | atendido no fim do bloco |
| `tentativas` | Int | passou de 5 → `erro` |
| `iniciadaEm`, `concluidaEm`, `createdAt`, `updatedAt` | DateTime | `updatedAt` é o batimento (parado 10 min = retomar) |

### `IntegracaoCargaErro` (tabela `integracao_carga_erros`) 🟢

RLS por empresa; `onDelete: Cascade` da carga. Índice `[cargaId, linha]`.

| Campo | Tipo | Observação |
|---|---|---|
| `cargaId` | String | FK |
| `linha` | Int | linha do arquivo |
| `entidade` | String | |
| `chave` | String? | até 200 |
| `mensagem` | String | até 1000 |

### Filas de envio ao ERP 🟢

- `ClienteEnvioErp` (`cliente_envios_erp`): `clienteId`, `alteracaoId?` (`SetNull`), `campos String[]`
  (campos da plataforma que mudaram), `situacao` (`pendente`/`enviado`), `criadoEm`, `enviadoEm?`.
  Índice `[empresaId, situacao, criadoEm]`.
- `ComodatoEnvioErp` (`comodato_envios_erp`): `produtoId` (o equipamento), `situacao`, `criadoEm`,
  `alteradoEm` (**versão** devolvida na confirmação), `enviadoEm?`. Alimentada por **trigger**.
- Orçamento pendente não tem fila própria: é o filtro `chave = null AND status = aprovado AND
  erroIntegracao = null` sobre `orcamentos` (campos `erroIntegracao`, `erroIntegracaoEm`).

### Contrato do lote (Zod, `packages/contracts/src/integracao.ts`) 🟢

Item de lote = schema de criação **parcial** + `chave` + `excluido?` (`integracao<Entidade>LoteItemSchema`).
Resposta `IntegracaoLoteResultado`: `processados`, `criados`, `atualizados`, `excluidos`,
`erros[{indice, chave|null, mensagem}]`. Linha de carga: `{"entidade": "<rota>", "registro": {...}}`;
entidades aceitas (`INTEGRACAO_CARGA_ENTIDADES`): as 16 com `PUT`, **sem** `equipamentos-comodato`,
`comunicacao`.

### Marcas de auditoria 🟢

`updatedBy`/`createdBy`/`deletedBy` = `integracao:<apiKeyId>` (`autorIntegracao`).

---

## Módulo `integracao-keys`

Sem tabela própria: usa `IntegracaoApiKey` e `IntegracaoEndpointConfig` (ver seção `integracao`).

### DTOs (Zod, `packages/contracts/src/integracao-api-key.ts`) 🟢

- `integracaoApiKeyCreateSchema`: `nome` (1–100), `expiraEm` (data, nulo = não expira).
- `integracaoApiKeyUpdateSchema`: `nome?`, `ativo?` (`false` revoga), `expiraEm?`.
- `integracaoApiKeyCriadaSchema`: a leitura + `chave` em claro (só na resposta do `POST`).
- Leitura nunca traz `chaveHash`; traz `prefixo`, `ultimoUso`, `expiraEm`.
- `PATCH endpoints/:endpointKey`: **sem DTO** — corpo cru `{ativo}`.

---

## Módulo `portal-cliente`

### `PortalClienteConfig` (tabela `portal_cliente_configs`) 🟢

RLS por empresa. Uma linha por empresa (`empresaId` único). **Só `ativo` é lido pelo código.**

| Campo | Tipo | Observação |
|---|---|---|
| `ativo` | Boolean | padrão `false`; exigido no login |
| `permitirAtualizarCadastro`, `permitirManterContatos` | Boolean | padrão `false`; sem leitor |
| `exibirDesconto` | Boolean | padrão `false`; **não respeitado** na listagem de orçamentos |
| `permitirSolicitarDesconto` | Boolean | padrão `false`; sem leitor |
| `descontoMaximoSolicitavel` | Float | 0–100; sem leitor |
| `exibirEstoque` | Boolean | padrão `false`; sem leitor |
| `permitirProdutoForaMix` | Boolean | padrão `true`; sem leitor |
| `diasValidadeCarrinho` | Int | 1–90, padrão 7; sem leitor |
| `updatedBy` | String? | nunca gravado |

### `PortalClientePerfil` / `PortalClienteRotina` / `PortalClientePerfilPermissao` 🟢

- Perfil: `empresaId`, `nome` (único por empresa), `descricao`, `sistemaBase`, `ativo`. O perfil base é
  **"Administrador do cliente"**.
- Rotina (catálogo global, sem `empresaId`): `id`, `codigo` (único), `nome`, `ordem`, `ativo`.
  Códigos: `cadastro`, `contatos`, `notas`, `compras`, `titulos`, `orcamentos`, `catalogo`, `carrinho`.
- Permissão: `(perfilId, rotinaId, acao)` único, `permitido`. Ações: `visualizar`, `cadastrar`, `editar`,
  `segunda-via`, `aprovar`, `recusar`, `comprar` (conforme a rotina). No JWT vira `"<codigo>.<acao>"`.
  **Implementadas hoje:** `orcamentos.visualizar|aprovar|recusar`.

### `PortalClienteHabilitacao` (tabela `portal_cliente_habilitacoes`) 🟢

RLS por empresa. `clienteId` único, `ativo` (padrão `false`), `updatedBy`. Liga o portal por cliente.

### `PortalClienteCredencial` (tabela `portal_cliente_credenciais`) 🟢

**Com RLS especial:** policy de tenant + policy "de login" que abre só a linha cujo `id` (ou
`empresaAlias` + `emailNormalizado`) está nas variáveis da transação (`withPortalCredential`).

| Campo | Tipo | Observação |
|---|---|---|
| `empresaId` | String | |
| `contatoId` | String | **único**; FK `ClienteContato` (`Cascade`) |
| `empresaAlias` | String | cópia do alias **no momento da criação** |
| `emailNormalizado` | String | minúsculas; único com `empresaAlias` |
| `senhaHash` | String | bcrypt custo 12 |
| `tentativasFalhas`, `bloqueadoAte` | Int, DateTime? | 5 falhas → 15 min |
| `ultimoLogin`, `ativo` | | |

### `PortalClienteSessao` (tabela `portal_cliente_sessoes`) 🟢

**Sem RLS** (o refresh acontece antes de existir tenant). `tokenHash` (SHA-256 do refresh, único),
`expiresAt` (30 dias), `revogadoEm`, `ip`, `userAgent`. `onDelete: Cascade` da credencial. Sem limpeza.

### `PortalClienteAcessoLog` (tabela `portal_cliente_acessos_log`) 🟢

RLS por empresa e **policy só de INSERT** para o login inválido (por isso o `createMany`). Campos:
`empresaId?`, `contatoId?`, `email`, `evento` (`login_falha`, `login_sucesso`), `detalhe?`, `ip`,
`userAgent`, `criadoEm`. Sem limpeza.

### Campos em outras tabelas 🟢

`Orcamento`: `clienteDecididoEm`, `clienteDecididoPorContatoId`, `clienteDecisao`,
`clienteDecisaoObservacao`. `ClienteContato`: `perfilId` (perfil do portal).

### DTOs (Zod, `packages/contracts/src/portal-cliente.ts`) 🟢

`portalClienteLoginSchema` (`empresaAlias` ≤60, `email`, `senha` 8–128), `portalClienteRefreshSchema`
(`refreshToken` ≥32), `portalClienteContatoCreateSchema` (`clienteId`, `perfilId?`, `nome` 2–120,
`email` ≤160, `telefone`/`celular`/`cargo`, `principal` padrão `false`, `ativo` padrão `true`,
`senhaInicial` 8–128), `portalClienteConfigSchema`. Decisão: `{observacao?}` ≤1000 (DTO local).

---

## Módulo `cadastros`

Campos de auditoria (`createdAt`, `updatedAt`, `createdBy`, `updatedBy`, `deletedAt`, `deletedBy`) omitidos.

### Por empresa (RLS) 🟢

Todas com `empresaId`, `@@unique([empresaId, chave])` e `chave` = chave de integração (FILIAL-COD); `codigoErp` é só o
código de origem mostrado na tela.

- **`Categoria`** (`categorias`): `categoriaPaiId?` (2 níveis), `codigoErp`, `chave?`, `descricao`, `usado Boolean?`,
  `equipamentoComodato` (padrão `false`), `ativo`, `regraDescontoId?`. Índices `[empresaId, codigoErp|descricao|regraDescontoId]`.
- **`CondicaoPagamento`** (`condicoes_pagamento`): `codigoErp`, `chave?`, `descricao`, `forma?`, `ativo`.
- **`Armazem`** (`armazens`): `codigoErp`, `chave?`, `descricao`, `ativo`, `revenda` (padrão `true`).
- **`TabelaPreco`** (`tabelas_preco`): `codigoErp`, `chave?`, `descricao`, `dtInicio?`, `dtFim?` (date), `ativo`.
- **`TabelaPrecoItem`** (`tabela_preco_itens`): `tabelaPrecoId`, `produtoId`, `chave?` (única no cabeçalho),
  `preco Float`, `ativo`, `regraDescontoId?`.
- **`RegraDesconto`** (`regras_desconto`): `codigoErp?`, `chave?`, `descricao`, `percDescontoAutorizado`,
  `percDescontoMaximo`, `percComissao` (todos Float, padrão 0), `padrao` (uma por empresa, por código), `ativo`.
- **`RegraDescontoFaixa`** (`regras_desconto_faixas`): `regraDescontoId`, `sequencia` (única na regra),
  `percInicial`, `percFinal`, `percBaseComissao`.

### Globais, sem RLS 🟢

| Tabela | Campos | Único |
|---|---|---|
| `paises` | `codigoErp?`, `nome`, `sigla?`, `comexId?`, `ativo` | `codigoErp` |
| `estados` | `codigoErp?`, `sigla`, `descricao`, `codigoIbge?`, `ativo` | `sigla` |
| `municipios` | `estadoId?`, `codigoErp?`, `descricao`, `codigoIbge?`, `ativo` | `codigoErp`, `codigoIbge` |
| `ceps` | `cep`, `estadoId?`, `municipioId?`, `bairro?`, `endereco?`, `latitude?`, `longitude?`, `origem?` (`viacep`), `ativo` | `cep` |
| `cnaes` | `codigoErp?`, `secao?`, `divisao?`, `grupo?`, `classe?`, `subclasse?`, `descricao`, `ativo` | `codigoErp` |

Todos os índices únicos **contam as linhas excluídas** (soft delete).

### DTOs 🟢

Um schema Zod de criação, atualização e consulta por entidade em `packages/contracts/src/`. A regra
de desconto exige `percFinal ≥ percInicial` por faixa; a consulta de CEP é `GET /ceps/consulta/:cep`
(`ConsultaCepResultado`: `cep`, `endereco`, `bairro`, `municipio`, `municipioId`, `uf`, `estadoId`,
`origem: cache | viacep`).


---

## `feriados`

### Tabela `feriados` (RLS por `empresaId`) 🟢

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `id` | texto (uuid) | sim | chave |
| `empresaId` | texto | sim | FK `empresas`, RESTRICT |
| `data` | `date` | sim | dia inteiro, sem hora; único com `empresaId` |
| `descricao` | texto | sim | 1 a 120 caracteres; coluna era `nome` até a migration `20260930270000` |
| `origem` | `OrigemFeriado` | sim, padrão `manual` | |
| `createdAt`, `updatedAt` | data/hora | sim | |
| `createdBy`, `updatedBy` | texto | não | usuário que criou/editou; **sem campo de quem excluiu** |

Índices: único `(empresaId, data)`; `(empresaId, data)`.

### Enum `OrigemFeriado` 🟢

`nacional_fixo` (gerado), `nacional_movel` (gerado, derivado da Páscoa), `manual` (cadastrado ou editado pela empresa).

### DTOs 🟢

`feriadoCreateSchema` (`data` AAAA-MM-DD, `descricao`), `feriadoUpdateSchema` (parcial), `feriadoQuerySchema` (`ano` 2000–2100, opcional), `feriadoGerarNacionaisSchema` (`ano` obrigatório). Resposta: `data` como texto AAAA-MM-DD.


---

## `erros`

### Tabela `audit_logs` (model `ErroLog`, sem RLS, sem FK) 🟢

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `id` | uuid | sim | |
| `origem` | `ErroOrigem` | sim | `servidor` ou `cliente` |
| `tipo` | `ErroTipo` | sim | |
| `ocorridoEm` | data/hora | sim | no cliente, o relógio do navegador (futuro vira hora de chegada) |
| `criadoEm` | data/hora | sim | |
| `ultimaEm` | data/hora | sim | última repetição absorvida; campo de ordenação, período e expurgo |
| `ocorrencias` | inteiro | sim, padrão 1 | repetições colapsadas |
| `rota` | texto | sim | como veio, **com a query**; corta em 500 |
| `rotaPadrao` | texto | sim | sem query, ids trocados por `:id` |
| `metodo`, `status`, `pagina` | texto / inteiro / texto | não | `pagina` só em erro de cliente |
| `mensagem` | texto | sim | até 2.000 |
| `resumo` | texto | sim | normalizada, até 300; é o que agrupa |
| `stack` | texto | não | até 8.000 |
| `assinatura` | texto | sim | hash curto (16 hex) |
| `usuarioId`, `usuarioEmail` | texto | não | sem FK: o log sobrevive à exclusão do usuário |
| `empresaId`, `empresaRazaoSocial` | texto | não | sem FK; nulo antes de haver empresa ativa |
| `ip`, `userAgent` | texto | não | `userAgent` até 300 |

Índices: `(assinatura, ultimaEm)`, `(ultimaEm)`, `(empresaId, ultimaEm)`.

### Tabela `erros_log_config` (singleton `unico`, sem RLS) 🟢

`retencaoDias` (30; 0 = sem expurgo), `tetoPorEmpresa` (5000; 0 = sem teto), `registrar4xx` (false), `atualizadoEm`, `atualizadoPor` (e-mail de quem alterou). A linha nasce na migration.

### DTOs 🟢

`erroClienteReportSchema` (1 a 50 itens; item: `tipo` de rede/resposta/javascript/promessa, `ocorridoEm`, `rota` ≤ 500, `metodo` ≤ 10, `status` 0–599, `pagina` ≤ 500, `mensagem` ≤ 1.000, `stack` ≤ 8.000), `erroLogQuerySchema` (paginação + origem, tipo, empresaId, dataInicio, dataFim, search), `erroLogOcorrenciaQuerySchema` (assinatura), `erroLogConfigUpdateSchema` (retenção 0–3650, teto 0–1.000.000, 4xx).
