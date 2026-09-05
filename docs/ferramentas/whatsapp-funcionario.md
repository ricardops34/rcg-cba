# WhatsApp — atendimento ao funcionário

A triagem do número institucional quando quem escreve é **da equipe**: vendedor,
gerente ou supervisor. Ver [o mapa](README.md) para as outras famílias.

- **Catálogo:** `triagem/triagem-ferramentas-funcionario.ts`
- **Execução:** `triagem/triagem-funcionario-tools.service.ts`
- **Identidade:** `triagem/whatsapp-funcionario.service.ts`
- **Prompt:** `triagem-prompt.ts` → `montarPromptFuncionario()`

## Como o sistema sabe que é um funcionário

Duas etapas, e a segunda é a que autoriza:

1. **Encontrar** — o telefone é comparado com `vendedores.telefone` pelos
   **últimos 8 dígitos**, tolerante de propósito (o cadastro pode estar sem DDI
   ou sem o 9º dígito). Encontrar não autoriza nada.
2. **Confirmar** — a pessoa recebe um código de 6 dígitos que aparece **só em
   Meu perfil**, dentro do sistema, onde ela entrou com senha. Só depois disso o
   catálogo abre. Vale 30 dias.

> **A chave do pareamento é o número exato** (DDD + 8 dígitos,
> `chaveTelefone`), e isso é uma correção de segurança de 2026-09-05: chaveado
> pelo sufixo, um número de outro DDD com os mesmos 8 dígitos finais herdava a
> confirmação do vendedor. **Nunca voltar a chavear credencial em comparação
> tolerante.**

A identificação também exige `usuarios.ativo` **e** `usuario_empresas.ativo`,
além do cadastro de vendedor ativo. Sem isso, desligar alguém exigiria lembrar
de desativar o cadastro de vendedor — enquanto ele ficasse ativo, o
ex-funcionário seguiria consultando a carteira com o pareamento que já tinha.

## Só consulta — e é decisão, não limitação

Nenhuma ferramenta aqui grava. Criar orçamento, mover oportunidade e atualizar
cadastro continuam sendo do [agente interno](agente-interno.md), atrás de senha.

O raciocínio: aqui não há login, só um número confirmado. Um celular perdido não
pode virar acesso de escrita — é a diferença entre um vazamento incômodo e um
estrago no cadastro.

`seguranca.spec.ts` prende isso: nenhum nome de ferramenta deste catálogo pode
casar com `criar|cadastrar|alterar|atualizar|excluir|apagar|remover|aprovar|enviar|agendar`.

## O escopo

Sai de `resolverEscopoDoUsuario` — **a mesma função do sistema**, chamada com o
`usuarioId` em vez de uma sessão. Isso evita fabricar um `AuthenticatedUser`
sintético e garante que o WhatsApp não tenha uma segunda definição de "o que eu
posso ver": se o recorte mudar, muda para os dois.

Quem tem gente abaixo na hierarquia enxerga a equipe; quem não tem, a própria
carteira. Gerente e supervisor são o mesmo grupo — `Vendedor.tipo` só distingue
`vendedor` de `superior`.

**Fail-closed:** `null` significa "sem restrição" no resto do sistema (é o
Administrativo, numa tela atrás de senha). Aqui seria o contrário do que se
quer — se o escopo não resolve, não se atende.

## O catálogo

| Ferramenta | O que responde | Método |
|---|---|---|
| `meus_titulos_vencidos` | quem está devendo, com total e dias de atraso | `titulosVencidos()` |
| `minha_agenda` | atividades em aberto e vencidas | `agenda()` |
| `situacao_do_cliente` | um cliente pelo nome: em aberto, vencido, última compra | `situacaoDoCliente()` |
| `clientes_aguardando` | a fila do institucional, e há quanto tempo | `clientesAguardando()` |
| `acompanhar_objetivos` | objetivo × realizado do mês, da equipe ou de uma pessoa | `objetivos()` |
| `resumo_de_atividades` | números da agenda: em aberto, vencidas, concluídas | `resumoAtividades()` |
| `aniversariantes` | clientes (padrão) ou equipe, próximos dias | `aniversariantes()` |
| `clientes_sem_compra_no_mes` | quem não comprou, com sugestão do que oferecer | `clientesSemCompraNoMes()` |

## Duas fontes de verdade que não se reinventa aqui

**O que conta como venda** sai de `common/vendas/venda-analitica.ts`
(`ITEM_DE_VENDA_WHERE`) — o mesmo corte do Dashboard, dos Objetivos e das
Consultas. Aquele arquivo existe porque as três telas divergiam, e ter dois
números para a mesma pergunta é o tipo de coisa que ninguém percebe até a
reunião de fechamento. Conferido ao centavo contra `GET /objetivos/dashboard`.

**A última compra é derivada das notas** (`notaSaidaItem.dtEmissao`), e não lida
de `clientes.ultimaCompra`: aquela coluna existe mas não é mantida — 83 de 83
clientes com nota e nenhum com o campo preenchido. Ler dali faria a resposta
dizer "nunca comprou" para quem compra todo mês.

## O que está em prompt

`montarPromptFuncionario()` — prompt próprio, e não um parágrafo a mais no do
cliente: muda o interlocutor, o tom e o que pode ser dito. Misturar faria a IA
tratar o vendedor como cliente em potencial, ou falar com o cliente como se
fosse de casa.

- fala como colega, sem saudação de atendimento;
- diz se as consultas cobrem a equipe ou só a carteira;
- "você só consulta — se ele pedir para criar ou mudar, diga que isso é no
  sistema";
- "não recalcule nem arredonde: repita o que a ferramenta devolveu".

Todas são alinhamento. O recorte e a ausência de ferramenta de escrita são o que
de fato garante.

## Mexendo aqui

- **Nova consulta:** todo método recebe o `EscopoVendedores` já resolvido e o
  aplica como filtro obrigatório. Nunca aceite "de quem é o dado" como
  argumento.
- **Teste:** `triagem-funcionario-tools.spec.ts` olha o `where` que chega ao
  Prisma, e não o resultado — uma consulta que esqueça o filtro não falha nem
  parece errada, só responde com dados de mais gente do que devia.
