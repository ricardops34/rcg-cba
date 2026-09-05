# Log de erros em Plataforma > Erros — plano

> Registrado em 2026-09-04. **Implementado em 2026-09-04** e verificado em dev
> (ver "Como ficou" e "O que foi verificado"). As quatro decisões que estavam
> pendentes foram fechadas pelo usuário e viraram a seção "Decisões".

## O que motivou

Salvando a configuração do Agente IA, a tela mostrou apenas **"Erro ao salvar"**.
A mensagem não dizia nada, e descobrir a causa exigiu reproduzir a requisição
por fora, na mão, contra a API.

A causa era prosaica: a API estava reiniciando naquele instante (recompilação em
dev), a requisição não chegou ao servidor e o front caiu no texto genérico.

A pergunta que ficou é boa e maior que o incidente: **onde alguém olha quando
algo falha?** Antes disto, em lugar nenhum — o erro de servidor ia para o
console do container, e o de navegador não ia a lugar algum.

## O que já existia (e era mais do que parecia)

- **`AllExceptionsFilter`** (`apps/api/src/common/filters/http-exception.filter.ts`)
  é `@Catch()` **global**: todo erro do servidor já passava por um ponto único.
  Foi o gancho, e nenhum controller precisou ser instrumentado.
- **`/admin/acessos`** e **`/plataforma/auditoria`** já davam o padrão de tela
  de log (listagem, filtro, paginação) que a nova reaproveitou.
- Quatro tabelas de log no schema: `acessos_log`, `portal_cliente_acessos_log`,
  `plataforma_auditoria` e `audit_logs`.

> **`audit_logs` estava órfã.** O model existia no `schema.prisma`, tinha
> índice, e **nunca foi usado**: nenhuma referência no código, 0 linhas na base
> (conferido antes da migration). Alguém previu isto e a peça ficou pelo
> caminho.

## A ressalva que mudou o desenho

**O erro que motivou este plano não apareceria num log de servidor.**

A requisição nunca chegou à API. Um log server-side registra o que o servidor
processou; o que morre antes não deixa rastro nenhum lá.

Implementar só a captura no `AllExceptionsFilter` daria algo pior do que não
ter: no próximo "Erro ao salvar" alguém abriria a tela, encontraria **vazio**, e
concluiria que não houve erro. A ferramenta teria dado uma resposta errada com
ar de autoridade.

São duas famílias, e elas pedem mecanismos diferentes:

| | Onde nasce | Como capturar | Custo |
|---|---|---|---|
| **Servidor** | exceção, 500, falha de banco | `AllExceptionsFilter`, que já é global | baixo |
| **Cliente** | rede caiu, API fora, timeout, erro de JS | o front precisa reportar | médio |

O caso do cliente tem uma dobra: quando a causa é "a API está fora", o próprio
report falha. Cobrir de verdade exigiu **buffer local** (`localStorage`) e
reenvio quando a conexão volta — senão registraria tudo, menos justamente a
queda.

## Decisões (fechadas pelo usuário em 2026-09-04)

1. **Escopo: os dois lados.** Servidor pelo filtro e cliente pelo `apiFetch`,
   com buffer local. É o único desenho que cobre o incidente que motivou o
   pedido.

2. **Quem vê: só a administração da plataforma.** Ninguém do tenant lê o log.
   A consequência boa é que o conteúdo **não precisa ser sanitizado antes de
   gravar** — mensagem e stack ficam íntegros para diagnóstico, que é o que
   torna a ferramenta útil. A consequência ruim, aceita: o administrador da
   empresa não consegue se ajudar sozinho.

3. **Retenção: dias configuráveis + teto por empresa.** Os dois, porque cada um
   cobre o que o outro não cobre — o prazo não segura um bug em laço, que enche
   a tabela **dentro** da janela; o teto sozinho deixa erro antigo ocupando
   espaço para sempre numa empresa quieta.

4. **Ruído: 500 e erros de cliente por padrão; 4xx só com o interruptor.**
   400 de validação é erro de quem preencheu. O interruptor é de investigação
   pontual: liga, reproduz, desliga.

5. **A tabela: `audit_logs` é ocupada pelo log de erros** (decisão do usuário —
   uma tabela a menos, em vez de uma quinta ao lado de uma órfã). As colunas
   antigas eram de auditoria de alteração (`entidade`, `acao`, `valorAnterior`)
   e não descrevem um erro, então a migration as trocou pelas de erro. A tabela
   mantém o nome; quem procurar auditoria de alteração encontra
   `plataforma_auditoria`.

## Como ficou

**Banco** (migration `20260904140000_log_de_erros`):

- `audit_logs` reaproveitada, com `origem`, `tipo`, `ocorridoEm`, `ultimaEm`,
  `ocorrencias`, `rota`/`rotaPadrao`, `metodo`, `status`, `pagina`, `mensagem`,
  `resumo`, `stack`, `assinatura`, usuário, empresa (com a razão social junto),
  IP e agente.
- `erros_log_config`: linha única (`id = 'unico'`) com `retencaoDias` (30),
  `tetoPorEmpresa` (5000) e `registrar4xx` (false).
- **Nenhuma das duas tem RLS, de propósito** — mesma exceção de
  `plataforma_auditoria`: quem lê é a administração da plataforma, e ela lê
  *todas* as empresas; uma policy de tenant devolveria vazio justamente para
  quem precisa enxergar. Registrado no `migrations/README.md`.

**API** (`apps/api/src/modules/erros/`):

- `ErrosLogService` grava e consulta. Duas regras valem no caminho de escrita:
  **nunca lançar** (um log que derruba a resposta transforma um erro em dois) e
  **nunca chamar a si mesmo** (a falha ao gravar sai pelo logger do Nest).
- `AllExceptionsFilter` recebe o serviço por construtor, resolvido em
  `main.ts`. Opcional de propósito, para o filtro continuar funcionando em
  teste, sem container.
- `POST /erros/cliente` (só exige login) recebe o lote do navegador;
  `/plataforma/erros` (`PlatformAdminGuard`) lista, resume, detalha, configura
  e apaga grupo.
- `ErrosVarreduraService` roda o expurgo a cada 30 min, como a varredura do
  sino.

**Agrupamento.** Uma linha na tela por **assinatura** = origem + tipo + rota
normalizada + método + status + mensagem normalizada. `rotaPadrao` troca uuid e
número por `:id`; a mensagem perde ids, números e trechos entre aspas. Sem isso,
o mesmo erro em dez clientes vira dez grupos e empurra todo o resto para fora da
primeira página — que é a única que alguém olha.

**Colapso de rajada.** Repetição da mesma assinatura dentro de **1 minuto** vira
contador na linha que já existe, não linha nova. É a defesa contra o bug em
laço: sem ela, um erro viraria uma falha de disponibilidade. O teto por empresa
e o expurgo cuidam do resto, mas eles rodam a cada 30 min — tarde demais para
uma rajada.

**Cliente** (`apps/web/src/lib/erro-report.ts`): o erro vai primeiro para o
`localStorage` e só depois tenta sair, em lote, com backoff. O que não conseguir
sair fica lá, inclusive entre recarregamentos. `api-client.ts` reporta falha de
rede e resposta não-JSON; `providers.tsx` liga `window.onerror` e
`unhandledrejection`.

De quebra, o texto que motivou tudo melhorou: falha de rede agora vira
`ApiError` com status 0 e a mensagem "Não foi possível falar com o servidor" —
não mais o "Failed to fetch" cru do navegador.

## O que foi verificado (dev, 2026-09-04)

- Report do navegador: `POST /erros/cliente` → 204, linha na tela, com empresa,
  usuário, IP e agente.
- Colapso: 4 envios idênticos → **1 linha, contador 4**.
- 4xx com o interruptor **desligado**: 404 e 400 disparados, **nada gravado**.
- 4xx com o interruptor **ligado**: o 404 aparece, e a rota agrupou como
  `GET /api/v1/clientes/:id` (a normalização funcionou).
- 500 real: `SELECT` revogado de `plataforma_app` sobre `produtos`, `GET
  /produtos` → 500 gravado com o stack do Prisma; grant restaurado em seguida.
- Rota de leitura sem token → 401. Apagar grupo → `{"removidos":1}`.
- 11 testes novos em `erros-log.service.spec.ts`, todos passando.

**Ainda não verificado:** a tela em uso real (foi carregada, não operada), e o
expurgo/teto em volume — a varredura roda, mas nunca teve o que cortar.

## Limitações conhecidas

- **Erro na tela de login não é reportado.** A rota de report exige
  autenticação; a alternativa seria uma rota de escrita aberta na internet. O
  incidente que motivou a ferramenta aconteceu com o usuário já logado.
- **Se o banco cair, o log cai junto.** Ele grava no mesmo Postgres. Para esse
  caso o rastro continua sendo o console do container.
- **O log não é monitoramento.** Não há alerta, métrica de latência nem APM. É
  a pergunta "o que deu errado agora?" respondida de dentro do sistema, sem
  abrir log de container — que antes só quem tinha acesso à VPS conseguia
  fazer.
