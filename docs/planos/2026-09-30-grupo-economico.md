# Grupo econômico

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
- **O perfil é do usuário, para o grupo todo, e não por empresa.** A regra fica
  no código, em duas portas:
  - `GruposEconomicosService.salvarUsuario` recusa perfis diferentes entre as
    empresas e leva o perfil novo às demais empresas do grupo em que o usuário
    já tem acesso;
  - `UsuariosService.vincularEmpresa` (`POST /usuarios/:id/empresas/:empresaId`,
    que muda uma empresa por vez) recusa um perfil diferente do que o usuário
    tem nas outras empresas do grupo.

  No bloco da empresa ativa, o seletor de perfil e o "Vincular" somem quando a
  empresa é de um grupo. O banco continua guardando `perfilId` por vínculo
  (`usuario_empresas`), porque o token e o `/me` leem dali; a regra mantém os
  vínculos do grupo iguais.

  Testado em 30/09/2026 com o Gabriel: perfis diferentes são recusados (400);
  trocar só a RCG pela rota de usuários é recusado (400); trocar o perfil
  mandando só a Cuiabá leva a RCG junto. O estado original foi restaurado.

## Usuário único no grupo (decisão de 30/09/2026)

O usuário é um só no grupo econômico, e os dados dele também. Superior, nome
reduzido, código ERP, telefones, WhatsApp e data de nascimento são os mesmos
em todas as empresas do grupo. Eles moram em cada vínculo (`usuario_empresas`),
então a API os mantém sincronizados:

- `UsuariosService.vincularEmpresa` grava na empresa e replica nas demais do
  grupo (`sincronizarDadosNoGrupo`). O superior é traduzido para o vínculo do
  mesmo superior em cada empresa, ou fica sem superior se ele não tiver acesso
  a ela.
- Um acesso novo a uma empresa do grupo (`GruposEconomicosService.salvarUsuario`)
  nasce com os dados que o usuário já tem.

Testado com o Ricardo (RCG e Cuiabá): salvar pela RCG levou os dados para a
Cuiabá. O estado original foi restaurado.

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
