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

## Categoria "usada" — quem é o dono do campo

`categorias.usado` marca as categorias que a empresa **acompanha**. É o que
escolhe o que entra na tabela "Vendas Categoria" do Dashboard Comercial: só
categoria com `usado = true` aparece (hoje, 20 das 26 que tiveram venda). Por
isso o total daquela tabela **não bate** com o KPI "Realizado" — o KPI é a
venda inteira, a tabela é a venda do que se acompanha.

Vale só para **categoria raiz**. Subcategoria nasce com `usado` nulo no import
e não entra no dashboard (o agrupamento é por `produto.categoriaId`, que é a
raiz).

**O dono do campo é a plataforma, não o ERP** — decidido em 2026-08-21, quando
a edição pela tela foi criada (Cadastros > Categorias, chave na coluna "Usada",
requer `categorias.editar`). O import da base legada passou a gravar `usado`
**apenas na criação** da categoria: o legado dá o valor inicial e não mexe mais
(`prisma/import-auxiliares.ts`). Antes, o `update` do upsert reescrevia o campo
a cada carga — a marcação feita na tela era desfeita em silêncio, e o único
sintoma era o dashboard voltar ao que era.

Se um dia o ERP voltar a ser a fonte da verdade disso, é esse `update` que
precisa mudar de volta — e a edição na tela deve sair junto, senão as duas
pontas brigam.

## 2ª via de DANFE e boleto

Decidido em 2026-08-21. Detalhe de implementação em
[`docs/planos/segunda-via-danfe-boleto.md`](planos/segunda-via-danfe-boleto.md).

**A plataforma não emite documento fiscal nem registra cobrança.** Ela
*reimprime* o que já existe:

- **DANFE**: renderizado a partir do **XML autorizado** que o ERP empurra
  (`POST /integracao/notas-saida/:codigo/xml`). Sem XML não há DANFE — a rota
  responde 409, em vez de montar um documento fiscal a partir das colunas da
  nota. Nota cancelada sai com carimbo; nota cujo XML não traz protocolo sai
  marcada como sem valor fiscal.
- **Boleto**: montado com o **nosso número registrado pelo ERP** e o convênio
  cadastrado em Administração › Contas Bancárias. Sem nosso número não há
  boleto: a numeração é de quem registrou a cobrança no banco.

**Título vencido sai com valor atualizado** — saldo + multa (uma vez) + juros
pro rata die, pelos percentuais do convênio. Sem percentual cadastrado, não há
encargo: multa "padrão" cobraria do cliente o que a empresa nunca combinou. A
composição do valor é impressa nas instruções da ficha.

**A emissão para em 30 dias de atraso.** Do 31º dia em diante nem a rota emite
nem a tela oferece o botão — passado esse prazo a cobrança já costuma estar em
outro rito (negativação, protesto, acordo).

Quando há encargo aplicado, o código de barras é **recalculado**: o que o ERP
registrou carrega o valor original. Fora esse caso, o código registrado pelo
ERP sempre prevalece sobre o cálculo local — divergir do que está no banco é
pior do que não imprimir.

Os mesmos arquivos saem em três lugares, pela mesma rota: Posição de Cliente,
as rotinas de Notas de Saída / Títulos a Receber, e o atendimento por WhatsApp
(que anexa o PDF na conversa e põe a linha digitável na legenda).

**Toda geração e todo envio ficam no histórico de atendimento do cliente**, como
atividade concluída — o mesmo lugar em que o envio de proposta já aparece (CRM ›
Atividades, filtrando por cliente). Quem gera pela tela grava "2ª via gerada";
quem manda pela conversa grava "enviado pelo WhatsApp" — nunca os dois para a
mesma ação. A descrição guarda o que importa depois: no boleto, a composição do
valor quando houve atraso; no DANFE, a data de emissão e o aviso de nota
cancelada.
