# Cadastro de clientes: abas, consulta de CNPJ com aprovação e exclusão

Pedidos do usuário em 30/09/2026.

## Abas no editar e no visualizar

O formulário já tinha abas, mas só na cortina lateral. A página
`/cadastros/clientes/{id}` (editar e visualizar) usava uma versão longa, com
seções empilhadas. Agora as duas usam as mesmas abas: Identificação, Contato,
Endereço, Comercial, CNAE, Bloqueio, Histórico e Alterações. A versão longa e a
prop `variant` saíram.

## Consultar o CNPJ e mandar para análise e aprovação

A API já tinha as duas peças, mas a tela não as usava:

- `POST /clientes/:id/atualizar-receita`, que compara com a Receita e abre uma
  solicitação na fila;
- a fila de aprovação em `/cadastros/clientes-alteracoes`.

A lupa do CNPJ, num cliente já cadastrado, **gravava os CNAEs direto**. Agora:

- **cliente já cadastrado** (editar e visualizar): a lupa chama o
  `atualizar-receita`, e nada é gravado. Um diálogo mostra a situação na
  Receita, os campos com diferença e o botão "Analisar e aprovar";
- **cadastro novo**: a lupa continua preenchendo o formulário, porque ainda não
  há o que aprovar.

**CNAE principal e secundários.** A proposta levava só a lista de códigos, e
ao aprovar o principal não era definido pela Receita. Entrou o campo virtual
`cnaePrincipal` na fila, que aparece na aprovação como "CNAE principal (de →
para)" e, aprovado, marca o principal (vinculando-o se preciso).

**Sem gravação direta.** Antes, o cliente sem nenhum CNAE recebia os da
Receita na hora. Agora tudo vai para aprovação, porque o usuário pediu análise
antes de gravar.

Testado com o BOM ALMOÇO (00035001): a proposta trouxe 3 CNAEs, o principal
5620101, endereço e telefone novos e uma razão social diferente na Receita
("PANELA DE CASA RESTAURANTE LTDA"). Nada foi gravado, e a solicitação de teste
foi recusada.

## Exclusão de cliente do ERP

Cliente que veio do ERP ou está integrado a ele **não pode ser excluído**. A
marca é a chave de integração (`chave`, FILIAL-COD) ou o código ERP. A API
recusa com 409 (`ClientesService.remove`), e na lista o item aparece
desabilitado como "Excluir (cliente do ERP)". Testado com o 00035001: 409, e o
cliente continua ativo.
