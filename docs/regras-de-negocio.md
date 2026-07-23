# Regras de negócio — rcgcba

Regras do domínio comercial da plataforma (não são instruções de como
trabalhar no repo — isso fica em `AGENTS.md`).

## Perfil e hierarquia

Não existe um campo separado de "cargo" — `Perfil` (RBAC, um por empresa,
ex.: Administrador/Gerente/Supervisor) define **quais ações** o usuário pode
fazer (permissões por rotina).

Não existe cadastro de "colaborador" separado — hierarquia (`superiorId`),
nome reduzido, código ERP e contato são todos campos do próprio
`UsuarioEmpresa` (o vínculo usuário×empresa). Um usuário multiempresa tem um
vínculo — e portanto uma posição na hierarquia — por empresa. Essa hierarquia
é só informativa (organograma); nenhum módulo comercial filtra dados por ela.

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
