# Regras de negócio — rcgcba

Regras do domínio comercial da plataforma (não são instruções de como
trabalhar no repo — isso fica em `AGENTS.md`).

## Perfil e hierarquia de visualização de dados

Não existe um campo separado de "cargo" — `Perfil` (RBAC, um por empresa,
ex.: Administrador/Gerente/Supervisor/Vendedor) é a única coisa que define
tanto **quais ações** o usuário pode fazer (permissões por rotina) quanto,
indiretamente, o **escopo de dados**: quem tem perfil `sistemaBase` vê tudo
da empresa sem restrição de carteira; qualquer outro perfil é escopado pela
árvore de hierarquia (`UsuarioEmpresa.superiorId`), **não** pelo nome do
perfil — um "Gerente" e um "Vendedor" seguem exatamente a mesma regra
(subárvore abaixo do próprio vínculo), o que muda é só a posição de cada um
na árvore.

Não existe cadastro de "colaborador" separado — hierarquia (`superiorId`),
nome reduzido, código ERP e contato são todos campos do próprio
`UsuarioEmpresa` (o vínculo usuário×empresa). Um usuário multiempresa tem um
vínculo — e portanto uma posição na hierarquia — por empresa.

Implementação: `apps/api/src/common/hierarquia/equipe.ts`
(`equipeColaboradorIds`). Retorna `null` (sem filtro, vê tudo da empresa)
quando `user.isAdmin` (perfil `sistemaBase`); para qualquer outro perfil,
percorre a árvore `UsuarioEmpresa.superiorId` a partir do vínculo do usuário
logado (subordinados diretos e indiretos), então a regra vale
automaticamente qualquer que seja a profundidade real da hierarquia da
empresa — não é hardcoded por nível.

Todo módulo com carteira por vendedor (clientes, notas-saida, titulos-receber)
deve filtrar por `equipeColaboradorIds(tx, empresaId, user)` dentro de
`withTenant`, igual a `ClientesService.findAll`. Os campos `colaboradorId` em
`Cliente`/`NotaSaida`/`TituloReceber` (e a relação Prisma `colaborador`)
mantiveram o nome por compatibilidade, mas apontam pra `UsuarioEmpresa`, não
pra uma tabela própria.

## Vínculo (perfil) é obrigatório pra logar

Usuário só consegue autenticar numa empresa se tiver um vínculo
(`UsuarioEmpresa`) ativo com ela — o vínculo já exige `perfilId` (não é
opcional), então basta existir pra login funcionar.

- **Todo usuário novo já nasce com vínculo.** `POST /usuarios` cria
  `Usuario` + `UsuarioEmpresa` (com o perfil) numa transação
  (`UsuariosService.create`). Vincular um usuário existente a outra empresa
  (`POST /usuarios/:id/empresas/:empresaId`) usa a mesma rota pra criar ou
  editar o vínculo — perfil, hierarquia e dados de vendedor completos
  (`UsuariosService.vincularEmpresa`).
- Editar hierarquia/nome reduzido/telefone de um vínculo já existente é
  feito na tela de Usuários (seção de empresas vinculadas,
  `UsuarioEmpresasSection`) — não existe uma tela própria de
  "Vendedores"/"Colaboradores".
