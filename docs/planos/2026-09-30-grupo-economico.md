# Grupo econômico

**Atualização:** a regra anterior de criar empresas suspensas foi substituída
pelo [plano único do grupo e limite de empresas](2026-09-30-plano-do-grupo.md).
Dentro da cota contratada, novas empresas herdam a situação do contrato.

A primeira versão (módulo `grupos-economicos`, migration
`20260930150000_grupos_economicos`) veio de outra frente de trabalho. Este
arquivo registra as decisões do usuário de 30/09/2026 e o que foi ajustado a
partir delas.

## Decisões (30/09/2026)

- **Hierarquia: Grupo econômico → Empresa.** Cada empresa pertence a no máximo
  um grupo (`empresas.grupoEconomicoId`). O menu segue essa ordem: "Grupo
  Econômico" vem **antes** de "Empresas", em Administração e em Plataforma. A
  tela do grupo não é mais aberta a partir de Empresas (saíram o botão em
  Empresas e o "Voltar para empresas").
- **Cadastro:** o grupo tem o **ID**, um uuid como o das empresas e dos demais
  cadastros, e uma **Descrição**. A coluna `nome` virou `descricao` na migration
  `20260930160000_grupo_economico_descricao`.
- **Toda empresa tem grupo econômico** (decisão de 30/09/2026).
  `empresas.grupoEconomicoId` é obrigatória, e a FK passou a `ON DELETE
  RESTRICT` (migration `20260930180000_empresa_grupo_obrigatorio`, que antes
  deu um grupo com o nome da empresa a quem estava sem). Consequências no código:
  - **empresa nova** (Plataforma, onboarding, seed) nasce com um grupo com o nome
    dela; a criada pelo administrador de um grupo entra no grupo dele;
  - **incluir** uma empresa num grupo é **movê-la** do grupo em que está; o grupo
    de origem que fica vazio é desativado (`deletedAt`);
  - **excluir** uma empresa de um grupo lhe dá um grupo próprio, com o nome dela;
  - só vínculo **ativo** define a qual grupo o usuário pertence. O
    admin@bjsoft, que tinha vínculos inativos na RCG e na Cuiabá, tinha ido
    parar no Grupo RCG. Foi corrigido no código e no dado.

  Na base de dev: **Grupo BJ** (B. J. Informática) e **Grupo RCG Distribuidora**
  (RCG e Cuiabá). Testado em 30/09/2026: renomear; tirar a Cuiabá (ganha grupo
  próprio); devolvê-la (o grupo próprio vazio é desativado).
- **Criar o grupo:** só a administração da plataforma, na tela nova
  **Plataforma › Grupos econômicos** (`/plataforma/grupos`).
- **Editar, incluir e excluir empresas:** a Plataforma e o administrador de uma
  empresa do grupo, em **Administração › Grupo Econômico**
  (`/admin/grupo-economico`).
- **Trava de inclusão (código, não prompt):** o administrador da empresa só
  inclui no grupo uma empresa que ele mesmo administra. Sem isso, um cliente
  poderia puxar para o grupo dele a empresa de outro cliente. A regra fica em
  `GruposEconomicosService.salvar`.
- **Usuários:** ao entrar no grupo, os usuários das empresas passam a pertencer
  a ele (`usuarios.grupoEconomicoId`).
- **Perfil e empresas são atribuídos no cadastro do usuário, não no do grupo**
  (decisão de 30/09/2026). Em Administração › Usuários › (usuário), o bloco
  "Perfil e empresas do usuário" tem **um** Perfil e as empresas do grupo com
  acesso. O bloco "Usuários e acessos do grupo" saiu da tela do Grupo
  Econômico, que mostra só o grupo e as empresas dele. O Novo usuário, quando
  quem cadastra é administrador de uma empresa de grupo, pede nome, e-mail,
  senha, um perfil e as empresas.
- **O perfil é do usuário, para o grupo todo, e não por empresa.** Primeiro a
  regra ficou no código (duas travas mantinham iguais os `perfilId` de cada
  vínculo). Desde a migration `20260930230000_dados_do_usuario` o perfil mora
  em `usuarios.perfilId` e a regra é da própria estrutura — ver "Usuário único
  no grupo" abaixo. `salvarUsuario` ainda recusa perfis diferentes no mesmo
  pedido, porque o contrato manda um perfil por empresa marcada.

## Perfis do grupo (decisão de 30/09/2026)

O administrador da empresa não conseguia alterar perfil nenhum: todos eram
globais, e a tela de Perfis passava pelo `PlatformAdminGuard`, porque mexer num
perfil global mudaria as permissões de todos os clientes. Decisão: **perfil
passa a ter dono**, a plataforma ou um grupo econômico
(`perfis.grupoEconomicoId`, migration `20260930200000_perfil_por_grupo`).

- **Da plataforma** (grupo nulo): os de sistema (Administrador Empresa,
  Administrador da Plataforma) e os modelos. Todo grupo enxerga e atribui; só o
  administrador da plataforma altera. O administrador da empresa vê "Padrão da
  plataforma" e a tela só para consulta.
- **Do grupo:** o administrador de uma empresa do grupo cria, edita, exclui e
  muda as permissões. Só as empresas do grupo enxergam e atribuem. O perfil
  criado pelo administrador da plataforma é da plataforma.
- **Migração:** cada grupo recebeu uma cópia, com as permissões, de cada perfil
  da plataforma que usava (vínculos, ferramentas do agente e comunicados), e
  esses usos passaram para a cópia. Na lista, o perfil da plataforma some
  quando o grupo tem um de mesmo nome.
- **Empresa que muda de grupo** (incluir ou excluir no grupo) leva os perfis:
  usa o de mesmo nome do grupo novo ou recebe uma cópia
  (`levarPerfisParaGrupo`).
- **Atribuir** perfil de outro grupo é recusado para qualquer ator, inclusive a
  plataforma (`garantirPerfilDoGrupo`).

## Usuário único no grupo (decisão de 30/09/2026)

O usuário é um só no grupo econômico, e os dados dele também. Perfil, superior,
nome reduzido, código ERP, telefones, WhatsApp e data de nascimento são os
mesmos em todas as empresas do grupo.

**Estrutura (migration `20260930230000_dados_do_usuario`):** esses dados
passaram a morar em `usuarios`. `usuario_empresas` diz só a quais empresas o
usuário tem acesso (e a tela inicial dele em cada uma, que continua por
empresa). O superior aponta para outro **usuário** do grupo, não mais para o
vínculo dele numa empresa. Saíram a sincronização entre vínculos
(`sincronizarDadosNoGrupo`) e as travas de "perfil igual em todas as empresas":
agora é um registro só. As colunas antigas continuam em `usuario_empresas`, sem
uso e sem `NOT NULL`, até a migration que as apaga.

**Uma conta é de um grupo só:** acesso a empresa de outro grupo é recusado
(`UsuariosService.vincularEmpresa`, `PlataformaService.vincularAdministrador`),
e o superior precisa ser do mesmo grupo. Empresa nova criada pela Plataforma
com um administrador que já tem conta entra no grupo dessa conta. Tornar alguém
administrador de uma empresa troca o perfil da conta, então vale no grupo todo.

Testado pela API em 30/09/2026 (cópia da produção): login e permissões iguais
às de antes (Rubens: 12), gravação dos dados pelo card do usuário, superior e
conta de outro grupo recusados, carteira do vendedor intacta (313 clientes) e
lista de admins da plataforma. Os dados do Rubens foram restaurados.

## Cadastro de usuário em abas (30/09/2026)

É a mesma pessoa de "Meu perfil" (a mesma tabela), vista por quem administra:

- **Dados gerais:** imagem (só leitura, porque é o próprio usuário quem
  escolhe), nome apresentado, e-mail e ativo; abaixo, data de nascimento,
  WhatsApp, superior, nome reduzido, código ERP e telefone, que valem para o
  grupo todo.
- **Empresas e perfil:** um perfil e as empresas do grupo com acesso.
- **Acesso ao sistema:** redefinir senha e horário de trabalho.

Saiu `usuario-empresas-section.tsx`: a lista "Empresas vinculadas" com X, o
perfil por empresa e o "Vincular" perderam o uso quando toda empresa passou a
ter grupo.

## Tela do grupo: mestre/detalhe (30/09/2026)

Em cima, o grupo (ID e Descrição). Embaixo, a lista de empresas com **Editar**
(abre o cadastro completo) e **Excluir** (tira do grupo, e a empresa ganha um
grupo próprio, sem ser apagada), e o botão **Adicionar empresa**, que traz uma
empresa de outro grupo ou cadastra uma nova já no grupo
(`/admin/empresas/novo?grupo=…`, campo `grupoEconomicoId` do cadastro, aceito
só da Plataforma; o administrador de um grupo cria sempre no próprio grupo).
O item "Empresas" continua no menu por enquanto.

## Testado pela API em 30/09/2026 (base de dev = cópia da produção)

1. A Plataforma cria o "Grupo RCG" com RCG e Cuiabá: 201.
2. O administrador da empresa tenta criar outro grupo: 403.
3. O administrador da empresa edita a descrição para "Grupo RCG Distribuidora": 200.
4. O administrador da empresa inclui a B. J. Informática, que ele não administra: 403.
5. O administrador da empresa exclui e depois inclui a Cuiabá: 200 e 200.

O grupo ficou cadastrado na base de dev, com 7 usuários vinculados.

**Falta:** a conferência visual das duas telas.

## Nova empresa pelo administrador do grupo (conferido em 30/09/2026)

O botão "Nova empresa" aparece para o administrador da empresa, e a API aceita
com as regras de `EmpresasService.createDoAtor`:

- o administrador da plataforma cria sem restrição;
- quem não é administrador da empresa ativa recebe 403;
- o administrador da empresa só cria se a empresa dele pertencer a um grupo, e a
  empresa nova entra nesse grupo;
- a empresa nova nasce **suspensa**, sem teste e com limite de 1 usuário (os 4
  campos da plataforma são sobrescritos). Só a plataforma a libera.

Testado: o administrador da RCG passou pelas travas (409 com um CNPJ já
existente, sem criar nada), e um vendedor recebeu 403.

**Escopo de edição:** o administrador de qualquer empresa do grupo edita o
cadastro de todas as empresas do grupo (`garantirEscopo`), mesmo as que ele não
administra diretamente. Por exemplo, um administrador só da RCG edita a Cuiabá.
Isso bate com "o admin da empresa/grupo pode editar", mas vale confirmar com o
usuário.
