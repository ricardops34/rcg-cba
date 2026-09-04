# Log de erros em Administração — plano

> Registrado em 2026-09-04. **Ainda não implementado**: as quatro decisões da
> seção final são do usuário e precisam ser fechadas antes de escrever código.

## O que motivou

Salvando a configuração do Agente IA, a tela mostrou apenas **"Erro ao salvar"**.
A mensagem não dizia nada, e descobrir a causa exigiu reproduzir a requisição
por fora, na mão, contra a API.

A causa era prosaica: a API estava reiniciando naquele instante (recompilação em
dev), a requisição não chegou ao servidor e o front caiu no texto genérico.

A pergunta que ficou é boa e maior que o incidente: **onde alguém olha quando
algo falha?** Hoje, em lugar nenhum — o erro de servidor vai para o console do
container, e o de navegador não vai a lugar algum.

## O que já existe (e é mais do que parece)

- **`AllExceptionsFilter`** (`apps/api/src/common/filters/http-exception.filter.ts`)
  é `@Catch()` **global**: todo erro do servidor já passa por um ponto único, e
  já separa três casos — validação Zod (400), `HttpException` (o status dela) e
  o resto (500, com `logger.error`). É o gancho natural, e não é preciso
  instrumentar controller nenhum.
- **`/admin/acessos`** já é uma tela de log dentro de Administração, com o
  padrão de listagem, filtro e paginação que a nova reaproveitaria.
- Existem quatro tabelas de log no schema: `acessos_log`,
  `portal_cliente_acessos_log`, `plataforma_auditoria` e `audit_logs`.

> **`audit_logs` está órfã.** O model existe no `schema.prisma`, tem índice por
> entidade, e **nunca foi usado**: nenhuma referência no código, 0 linhas na
> base. Alguém já previu isto e a peça ficou pelo caminho. Decidir se a nova
> ferramenta ocupa essa tabela ou se ela sai do schema é parte deste plano —
> deixá-la ali sem uso é convite para alguém escrever nela achando que é o log
> oficial.

## A ressalva que muda o desenho

**O erro que motivou este plano não apareceria num log de servidor.**

A requisição nunca chegou à API. Um log server-side registra o que o servidor
processou; o que morre antes não deixa rastro nenhum lá.

Se implementarmos só a captura no `AllExceptionsFilter`, o resultado será pior
do que não ter: no próximo "Erro ao salvar" alguém abrirá a tela, encontrará
**vazio**, e concluirá que não houve erro. A ferramenta teria dado uma resposta
errada com ar de autoridade.

São duas famílias, e elas pedem mecanismos diferentes:

| | Onde nasce | Como capturar | Custo |
|---|---|---|---|
| **Servidor** | exceção, 500, falha de banco | `AllExceptionsFilter`, que já é global | baixo |
| **Cliente** | rede caiu, API fora, timeout, erro de JS | o front precisa reportar | médio |

O caso do cliente tem uma dobra: quando a causa é "a API está fora", o próprio
report falha. Cobrir de verdade exige **buffer local** (localStorage) e reenvio
quando a conexão voltar — senão registra tudo, menos justamente a queda.

## Decisões pendentes (do usuário)

1. **Escopo.** Só erros do servidor — barato, cobre a maioria, mas *não cobre o
   caso que motivou o pedido*. Ou os dois lados, com o buffer no cliente.

2. **Quem vê.** Administrador do tenant, restrito à empresa dele? Ou só a
   administração da plataforma? Pesa contra o primeiro: mensagem de erro
   costuma carregar dado — um 500 numa consulta pode trazer nome de cliente no
   stack trace. Se for do tenant, o conteúdo precisa ser filtrado antes de
   gravar, não na exibição.

3. **Retenção.** Log de erro cresce rápido e de forma imprevisível (um bug em
   laço gera milhares de linhas em minutos). Sem prazo de expurgo, esta vira a
   maior tabela da base. Sugestão: dias configuráveis, como `retencaoDias` do
   WhatsApp, e um teto por empresa.

4. **Ruído.** 400 de validação é erro de quem preencheu, não do sistema.
   Registrar tudo faz o log encher de "campo obrigatório" e esconder o 500 que
   importa. Sugestão: gravar 500 e erros de cliente por padrão; 4xx só com um
   interruptor ligado, para investigação pontual.

## Esboço de implementação (depois das decisões)

Nesta ordem, cada passo utilizável sozinho:

1. **Tabela e captura no servidor.** Model novo (ou `audit_logs`, se for a
   decisão), gravação no ramo de 500 do `AllExceptionsFilter`. Guardar: momento,
   rota, método, status, mensagem, stack, usuário, empresa, IP e agente. RLS por
   empresa, com a policy na mesma migration.
   - Cuidado: a gravação **não pode lançar**. Um log que derruba a resposta
     transforma um erro em dois.
2. **Tela em Administração.** Listagem com filtro por período, rota e status;
   detalhe com o stack. Reaproveita `EntityTable` e o padrão de `/admin/acessos`.
3. **Agrupamento.** Mesma rota + mesma mensagem viram uma linha com contador.
   Sem isso, um erro repetido empurra todos os outros para fora da primeira
   página — que é onde alguém olha.
4. **Captura no cliente.** `apiFetch` reporta falha de rede e resposta não-JSON;
   buffer em `localStorage` com reenvio ao voltar. É o passo que cobre o
   incidente original.
5. **Expurgo.** Rotina de retenção, junto da varredura que já existe.

## O que este plano não é

Não é monitoramento (APM, alertas, métricas de latência). É a pergunta "o que
deu errado agora?" respondida de dentro do sistema, sem abrir log de container
— que é o que hoje só quem tem acesso à VPS consegue fazer.
