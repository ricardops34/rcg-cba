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

## Campos complementares do produto — o que é da empresa, não do ERP

O cadastro de produto é read-only por natureza: os dados entram pelo import e
são reescritos na próxima carga. As **duas** exceções são a foto e os campos
complementares, e as duas vivem fora da tabela `produtos` justamente por isso.

A empresa define quais campos quer em Administração > Campos do Produto
(`produto_campos`) e preenche o valor em cada produto (`produto_campo_valores`,
com `produtos.editar`). São dados que o ERP não tem: diluição de um químico,
aplicação de uma autopeça, tensão de um elétrico, validade, dimensões.

Por que não colunas novas em `produtos`: cada empresa quer as suas. Ou o
cadastro nasceria com dezenas de colunas vazias, ou cada cliente pediria uma
migration.

Três decisões que não são óbvias:

- **A chave não muda.** `peso-bruto` é o identificador estável pelo qual a IA e
  as integrações referenciam o campo; renomear o rótulo na tela não pode
  quebrar quem já lê.
- **O tipo trava assim que alguém preenche.** Mudar de "texto" para "número" um
  campo já usado deixaria valores que não conversam com o tipo. O caminho é
  criar outro campo e desativar o antigo.
- **Desativar não é excluir, e excluir não apaga valor.** O campo some do
  formulário, mas o que os produtos têm gravado continua lá — restaurar o campo
  traz o cadastro inteiro de volta.

O valor é gravado como **texto**, em formato canônico (número com ponto
decimal, booleano `true`/`false`, data `AAAA-MM-DD`). Quem converte a entrada
é `normalizarValorDoCampo` (`modules/produto-campos/normalizar-valor.ts`), que
aceita o jeito de digitar em português e recusa o resto — é a única defesa
entre o que se digita e o que a tela, os relatórios e a IA vão ler.

`visivelAgente` é o que a empresa usa para guardar aqui algo interno (custo de
embalagem, margem) sem que chegue a quem pergunta pelo WhatsApp. O recorte é
feito na consulta (`valoresDoProduto({ apenasAgente: true })`), não numa
instrução de prompt.

## Fichas técnicas: importação em lote

Duas portas para a mesma ficha, e elas resolvem problemas diferentes:

- **uma a uma**, pelo assistente (anexo na conversa) — quando alguém tem um
  PDF na mão e sabe de que produto é;
- **em lote**, em `/comercial/produtos/fichas` (`produtos.importar`) — quando
  chega a pasta inteira do fabricante.

No lote, o **vínculo é pelo conteúdo do PDF**, não pelo nome do arquivo. É a
diferença para a importação de fotos, que casa pelo nome: o fabricante nomeia
a ficha pelo catálogo dele, e o código que interessa está impresso na página.

Quem lê é o modelo; quem **procura no catálogo é o servidor**. O modelo
devolve o que está escrito no documento (código do fabricante, nome do
produto) e o servidor consulta — primeiro por código (`codigoFornecedor`,
`codigoErp`, `codigoBarras`), e só depois pelo nome. Se o modelo devolvesse um
id, bastaria alucinar um para pendurar a ficha no produto errado, e ninguém
perceberia até um vendedor mandar a ficha errada a um cliente.

Achou **um** produto: vincula e grava. Achou nenhum ou mais de um: para, e a
tela pede a decisão de uma pessoa — com o que foi lido do documento à vista. O
texto já extraído é reaproveitado no vínculo manual; o PDF não é lido de novo.

A busca por nome usa `unaccent` dos dois lados, e não o `contains` do Prisma:
o `mode: insensitive` ignora maiúsculas, **não** acentos, e ficha de
fabricante costuma vir sem acentuação — "Cafe torrado 500g" não encontrava o
"Café torrado 500g" do catálogo.

**A fila roda empresa por empresa.** A tabela tem RLS, então uma varredura que
consultasse sem `withTenant` voltaria vazia e a fila ficaria parada sem erro
nenhum — foi o que aconteceu no primeiro teste. O caminho é o mesmo da
varredura de notificações: começa por `empresas`, que não tem RLS.

## Produtos relacionados: similar e aplicação

Uma tabela só (`produto_relacionados`) para dois usos, porque a pergunta é a
mesma — "que outros produtos têm a ver com este?" — e o que muda é o `tipo`.
Como os campos complementares e as fotos, nada aqui vem do ERP: é
conhecimento de quem vende.

**`similar`** é **simétrico**: se A substitui B, B substitui A. A relação é
gravada **uma vez** e lida dos dois lados. Cadastrar os dois sentidos daria
duas linhas para o mesmo fato, que divergiriam na primeira vez que alguém
apagasse uma — por isso o service recusa o inverso com 409.

**`aplicacao`** é **direcional**, e é o caso do comodato: a dosadora
emprestada ao cliente e os químicos que ela dilui. Cadastra-se no
equipamento; do lado do consumível a mesma linha é lida como "usado em".
Cada linha devolvida traz `origem`, que é o que decide o rótulo.

Não há flag de "produto de comodato" no cadastro. Ter aplicação **é** o
sinal, e o flag existente (`notas_saida.comodato`, `notas_saida_itens.comodato`)
é do ERP e diz outra coisa: que aquela **remessa** foi empréstimo, não venda
(ver `common/vendas/venda-analitica.ts`).

A relação pode ser desfeita **pela ponta que estiver aberta na tela**. Quem vê
"usado em" está vendo algo cadastrado do outro lado; obrigá-lo a navegar até o
outro produto para corrigir seria uma pegadinha.

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

## Faixa institucional é por empresa

Decidido em 2026-08-28.

A barra do topo (selo de associação, certificação, marca de grupo) era **fixa no
código**: cor magenta e a arte da allia, iguais para todas as empresas, na tela
de login e dentro do sistema. Virou configuração da empresa, em Administração ›
Empresas: ligar/desligar, cor de fundo e imagem.

O motivo é que a faixa é **marca de terceiro**. A empresa que não é associada não
deve exibir o selo, e a associada a outra entidade exibe o dela. Um valor fixo no
código só estava certo enquanto havia uma empresa.

**Ela não aparece no login.** Ali ainda não se sabe em qual empresa o usuário vai
entrar — mostrar o selo de uma para quem vai logar em outra seria pior do que não
mostrar nada. A tela de login continua com o branding que já tinha (logo e nome
fantasia por `?empresa=<alias>`).

**Sem imagem, não há faixa.** A cor sozinha renderiza uma tarja vazia no topo,
que parece defeito. O `bannerAtivo` liga a exibição, mas quem decide se há o que
exibir é o `bannerImagemUrl`.
