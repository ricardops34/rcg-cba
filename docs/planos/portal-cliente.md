# Portal do Cliente — planejamento funcional e técnico

## Objetivo

Criar um aplicativo web próprio para clientes consultarem e operarem dados da
mesma plataforma comercial, sem expor a interface nem as credenciais do sistema
interno. O portal será multi-tenant por empresa e cada acesso pertencerá a um
contato de um cliente.

O cliente poderá:

- consultar e, quando permitido, solicitar alteração do cadastro;
- administrar seus contatos conforme o perfil recebido;
- consultar notas fiscais, histórico de compras e títulos;
- gerar segunda via de DANFE e boleto;
- consultar, aprovar ou recusar orçamentos;
- navegar pelo catálogo/mix com fotos e recomendações;
- montar e enviar um carrinho de compras.

No sistema base, administradores e vendedores poderão configurar o portal,
acompanhar acessos e ações, consultar carrinhos em andamento e continuar o
atendimento comercial a partir deles.

## Decisões de arquitetura

### Aplicativo separado, API e banco compartilhados

Criar `apps/portal-cliente` como uma segunda aplicação Next.js. Ela compartilha
`packages/contracts`, componentes realmente genéricos e a mesma API NestJS, mas
tem layout, login, navegação e autorização próprios.

Não colocar as telas externas dentro de `apps/web`: separar os aplicativos
reduz o risco de uma rota interna aparecer para um cliente e permite publicar o
portal em domínio, CSP, cache e ciclo de deploy próprios.

O frontend possui build, imagem Docker, porta, domínio e stack próprios. A
publicação usa `docker/stack.portal-cliente.yml` e não exige republicar o App
Comercial. A futura aplicação `apps/website` seguirá o mesmo isolamento.

Na API, criar `PortalClienteModule` sob `/api/v1/portal-cliente`. Controllers do
portal não reutilizam diretamente controllers internos; reutilizam services de
domínio ou helpers extraídos quando as regras forem idênticas. Todas as rotas
externas usam DTOs Zod próprios e retornam somente os campos necessários.

### Identidade externa separada

Não reutilizar `Usuario` ou `UsuarioEmpresa`. Esses models representam pessoas
com acesso ao sistema interno e possuem regras de perfil, empresa e hierarquia
que não devem alcançar o portal.

A identidade externa será formada por:

- `ClienteContato`: dado de negócio do contato, com `empresaId`, `clienteId`,
  nome, e-mail, telefones, cargo, indicadores de contato principal e ativo;
- `PortalClienteCredencial`: senha e estado de autenticação associados ao
  `clienteContatoId`;
- `PortalClienteSessao` e `PortalClienteAcessoLog`: sessões, refresh tokens e
  auditoria de login;
- `PortalClientePerfil`: papel do contato, por exemplo Administrador,
  Comprador, Financeiro ou Consulta.

O login deve pedir identificação da empresa (alias/subdomínio), e-mail e senha.
E-mail sozinho não pode ser globalmente único: o mesmo endereço pode atender
mais de uma empresa ou cliente.

`PortalClienteCredencial` é consultada antes de existir tenant ativo. Por isso,
assim como `refresh_tokens`, será uma exceção sem RLS, contendo somente dados de
autenticação, `empresaId`, e-mail normalizado e referências. A migration deverá
documentar a exceção. Depois da autenticação, toda leitura de contato, cliente e
dados comerciais passa por `PrismaService.withTenant(empresaId, ...)`.

Access token e refresh token do portal terão audience/issuer próprios. O guard
interno nunca aceitará token do portal e o guard do portal nunca aceitará token
interno.

### RLS e isolamento

Toda nova tabela de negócio com `empresaId` terá RLS e policy na mesma
migration. Toda operação passa por `withTenant`. Além do tenant, cada query do
portal filtra pelo `clienteId` presente no contexto autenticado; o cliente nunca
envia um `clienteId` arbitrário para escolher de quem ler dados.

O contexto autenticado será, no mínimo:

```ts
type PortalClienteAuth = {
  empresaId: string;
  clienteId: string;
  contatoId: string;
  perfilId: string;
  sessaoId: string;
};
```

## Perfis, rotinas e habilitação por cliente

O sistema base terá uma seção **Administração > Portal do Cliente** com:

- perfis do portal;
- matriz perfil × rotina × ação;
- parâmetros da empresa;
- clientes habilitados no portal;
- contatos e credenciais;
- acessos e sessões;
- carrinhos em andamento e pedidos enviados.

Rotinas iniciais:

| Rotina | Ações principais |
|---|---|
| Meu cadastro | visualizar, solicitar edição |
| Contatos | visualizar, cadastrar, editar, desativar |
| Notas fiscais | visualizar, baixar DANFE/XML |
| Histórico de compras | visualizar |
| Títulos | visualizar, gerar boleto |
| Orçamentos | visualizar, aprovar, recusar, baixar PDF |
| Catálogo | visualizar |
| Carrinho | visualizar, adicionar, alterar, enviar |

O perfil define a permissão do contato. Uma configuração por cliente define
quais rotinas estão disponíveis para aquela conta. A autorização efetiva é a
interseção:

```text
rotina habilitada pela empresa
  ∩ rotina habilitada para o cliente
  ∩ ação permitida ao perfil do contato
```

Isso permite, por exemplo, que um contato Financeiro veja títulos e notas sem
comprar, enquanto um Comprador use catálogo e carrinho sem administrar usuários.

## Parâmetros

Criar parâmetros tipados por empresa, com possibilidade de override por
cliente apenas onde houver necessidade comercial real.

| Parâmetro | Padrão sugerido | Regra |
|---|---:|---|
| Portal ativo | não | Liberação geral por empresa |
| Cliente pode atualizar cadastro | não | Alteração entra na fila já existente, nunca grava direto |
| Cliente pode manter contatos | não | Restrito a perfil administrador do cliente |
| Exibir desconto no mix/catálogo | não | Se não, mostrar somente preço final |
| Permitir solicitar desconto no carrinho | não | Percentual solicitado, sujeito às regras comerciais |
| Desconto máximo solicitável | 0% | Limite de entrada, não autorização automática |
| Exibir estoque | não | Preferir disponibilidade textual quando necessário |
| Permitir produto fora do mix | sim | Controla catálogo completo versus mix comprado |
| Dias de validade do carrinho | 7 | Depois expira, sem excluir histórico |
| Exigir aceite de termos | sim | Versionar aceite por contato |

“Adicionar desconto” significa **solicitar** um desconto. O preço final é sempre
recalculado no servidor usando tabela de preço e regras vigentes. Pedido acima
da autonomia segue o fluxo de autorização já usado em orçamento.

## Modelo de dados proposto

### Acesso e configuração

- `ClienteContato`: filho de `Cliente`, com RLS;
- `PortalClienteCredencial`: hash da senha, tentativas, bloqueio, MFA futuro e
  recuperação de senha; exceção de RLS documentada;
- `PortalClientePerfil` e `PortalClientePerfilPermissao`;
- `PortalClienteRotina`: catálogo de rotinas, global/seed;
- `PortalClienteConfig`: habilitação e parâmetros por empresa;
- `PortalClienteHabilitacao`: ativação, perfil padrão e parâmetros específicos
  por cliente;
- `PortalClienteRotinaHabilitada`: allowlist/override por cliente;
- `PortalClienteSessao` e `PortalClienteAcessoLog`.

### Carrinho

- `CarrinhoCliente`: empresa, cliente, contato criador, vendedor da carteira,
  status, validade, totais e datas;
- `CarrinhoClienteItem`: produto, quantidade, preço de tabela, preço final,
  desconto calculado, desconto solicitado e snapshot da descrição/unidade;
- `CarrinhoClienteEvento`: inclusão, alteração, remoção, envio, expiração,
  conversão ou cancelamento.

Status sugeridos: `aberto`, `enviado`, `convertido`, `cancelado`, `expirado`.
Haverá no máximo um carrinho `aberto` por cliente/contato, salvo decisão futura
de permitir listas paralelas.

Ao enviar, o carrinho deve gerar um orçamento `rascunho` ou `enviado` usando o
mesmo cálculo central de preços e descontos. O vínculo `carrinhoId` deve ficar
no orçamento para rastreabilidade. A conversão precisa ser idempotente: repetir
a chamada de envio devolve o mesmo orçamento, sem duplicar.

Quando o cliente aprovar esse orçamento no portal, o status passa para
`aprovado`. Com `codigoLegado` ainda nulo, ele fica imediatamente disponível no
mesmo endpoint de orçamentos pendentes que o ERP já consome no App Comercial.
Não existirá fila ou contrato de integração paralelo para o portal.

### Auditoria e histórico de atendimento

Criar `PortalClienteEvento` como log imutável com:

- empresa, cliente, contato e sessão;
- tipo do evento;
- entidade e id relacionados;
- data, IP, user agent e metadados JSON sem dados sensíveis.

Eventos relevantes também serão registrados no histórico de atendimento do
cliente por um helper único, por exemplo `registrarEventoPortalCliente`. Não
espalhar inserts manuais pelos services.

Eventos mínimos:

- login, logout e falha de login;
- visualização e solicitação de alteração cadastral;
- inclusão, edição e desativação de contato;
- consulta e download de DANFE/XML/boleto;
- consulta, aprovação e recusa de orçamento;
- inclusão/remoção de item, desconto solicitado e envio do carrinho;
- geração do orçamento a partir do carrinho.

Downloads continuam usando as regras existentes: DANFE somente com XML
autorizado e boleto somente com cobrança registrada e dentro do prazo aceito.

## Regras dos módulos

### Cadastro e contatos

O cliente nunca altera diretamente o `Cliente`. Quando o parâmetro permitir,
o portal cria uma `ClienteAlteracao` com origem nova `portal_cliente`; a fila de
aprovação existente decide a aplicação.

Mudanças de e-mail de login exigem confirmação do novo endereço. Desativar um
contato revoga imediatamente suas sessões e refresh tokens. O último contato
administrador ativo não pode se remover nem perder o perfil administrador.

### Notas, compras e títulos

Consultas são sempre fixadas ao `clienteId` do token. Histórico de compras deve
ser paginado no servidor e pode oferecer agrupamento por produto, período e
categoria. Não carregar todos os itens históricos de uma vez.

Segundas vias reutilizam os geradores atuais, acrescentando o ator externo ao
registro de atividade. O portal não emite NF nem registra boleto.

### Orçamentos

O portal lista somente orçamentos do cliente autenticado. Aprovar ou recusar
usa endpoint transacional e idempotente, grava contato/data/IP e impede decisão
quando expirado, inativo ou já decidido.

Adicionar ao orçamento campos específicos de decisão externa, sem reaproveitar
`descontoAutorizadoPor`, pois esse campo representa autorização interna:

- `clienteDecididoEm`;
- `clienteDecididoPorContatoId`;
- `clienteDecisao` (`aprovado`/`recusado`);
- `clienteDecisaoObservacao`.

### Catálogo, mix e fotos

O catálogo usa a galeria de `ProdutoFoto`: principal nos cards e secundárias no
detalhe. Imagens devem ser lazy-loaded, ter dimensões reservadas e versões
otimizadas/thumbnails para não servir o original de 5 MB numa grade.

Preço e desconto são calculados no backend a partir da tabela do cliente. Se o
parâmetro esconder desconto, o contrato de resposta não deve enviar
`vlrTabela`/`percDesconto`; esconder apenas na interface vazaria o dado pela
rede.

### Recomendações

“Quem comprou este também comprou” será calculado com itens de notas efetivas,
por empresa, excluindo devoluções/inativos e sem misturar tenants.

Primeira versão:

1. considerar pedidos dos últimos 12 meses;
2. para um produto A, contar clientes distintos que compraram A e B;
3. ordenar por confiança (`clientes(A e B) / clientes(A)`), com suporte mínimo;
4. excluir itens já no carrinho, produto atual, inativos e sem estoque quando
   essa restrição estiver habilitada;
5. combinar com a sugestão individual já existente quando houver resultado.

Pré-calcular associações em job periódico ou tabela materializada; não executar
o cruzamento completo a cada abertura de produto.

### Visibilidade do vendedor

Criar no sistema base uma tela em **Comercial > Carrinhos de clientes**, sob o
mesmo escopo de carteira já aplicado a clientes/notas/orçamentos.

O vendedor poderá ver itens, quantidades, alterações e última atividade do
carrinho, mas não editar silenciosamente o carrinho do cliente. Ações possíveis
devem ser explícitas: contatar cliente, gerar orçamento ou assumir atendimento,
todas auditadas. Atualização em tempo real pode começar com polling moderado;
SSE/WebSocket fica para quando o volume justificar.

## API inicial

Base `/api/v1/portal-cliente`:

- `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/esqueci-senha` e
  `/auth/redefinir-senha`;
- `GET /me`, `/config` e `/navegacao`;
- `GET/PATCH /cadastro` (PATCH cria solicitação);
- CRUD controlado de `/contatos`;
- `GET /notas`, `GET /notas/:id`, downloads de XML/DANFE;
- `GET /compras` e `GET /compras/produtos`;
- `GET /titulos` e `GET /titulos/:id/boleto`;
- `GET /orcamentos`, `GET /orcamentos/:id`, `POST /:id/aprovar` e
  `POST /:id/recusar`;
- `GET /catalogo`, `GET /catalogo/:produtoId` e recomendações;
- `GET /carrinho`, operações de item e `POST /carrinho/enviar`.

Todas as operações recebem rate limit por IP/contato, validação Zod, Swagger e
testes de autorização negativa.

## Telas do portal

1. Login, recuperação e redefinição de senha;
2. Início com atalhos, orçamentos pendentes, títulos próximos e recompra;
3. Meu cadastro e acompanhamento de solicitações;
4. Contatos e acessos;
5. Notas fiscais e detalhe/downloads;
6. Histórico de compras;
7. Títulos e boletos;
8. Orçamentos e decisão;
9. Catálogo/mix, detalhe com galeria e relacionados;
10. Carrinho e confirmação de envio;
11. Perfil, segurança, sessões e termos.

O portal começa mobile-first e instalável como PWA, mas não depende de app
nativo no primeiro ciclo.

## Fases de entrega

### Fase 0 — decisões e protótipo

- validar nomenclatura, domínio e identidade visual;
- fechar perfis iniciais e matriz de rotinas;
- decidir convite de contatos e recuperação de senha;
- prototipar login, início, catálogo, carrinho e orçamento;
- definir política de privacidade, termos e retenção de acessos.

### Fase 1 — fundação segura

- models/migrations/RLS;
- contatos, credenciais, perfis, parâmetros e telas administrativas;
- autenticação externa, sessões, recuperação e logs;
- shell do novo app, navegação por rotina e testes de isolamento.

### Fase 2 — consultas e documentos

- cadastro somente leitura, notas, compras e títulos;
- DANFE, XML e boleto com auditoria;
- paginação, filtros e responsividade.

### Fase 3 — orçamentos

- consulta/PDF;
- aprovação e recusa idempotentes;
- notificações ao vendedor e histórico de atendimento.

### Fase 4 — catálogo e carrinho

- mix, catálogo, galeria e preços parametrizados;
- carrinho persistente e visibilidade no sistema base;
- envio idempotente e conversão em orçamento;
- solicitação de desconto e autorização existente.

### Fase 5 — recomendações e operação

- “quem comprou também comprou” pré-calculado;
- sugestões individuais combinadas;
- métricas, alertas, expiração de carrinhos e rotina operacional;
- hardening, carga e rollout gradual por cliente.

## Critérios de segurança e aceite

- contato da empresa A nunca autentica ou lê dados da empresa B;
- contato do cliente A nunca lê dados do cliente B, mesmo alterando UUIDs;
- token interno é recusado no portal e token do portal é recusado internamente;
- senha nunca é armazenada ou registrada em log; recuperação usa token curto,
  único e com expiração;
- desativação revoga todas as sessões do contato;
- parâmetros que escondem desconto removem os campos da resposta;
- aprovação/envio repetido não duplica evento, orçamento ou pedido;
- todo download e decisão aparece no histórico do cliente;
- vendedor só vê carrinhos dentro do escopo de carteira;
- todas as migrations de negócio com `empresaId` habilitam RLS e policy na
  mesma migration;
- testes E2E cobrem troca de tenant, troca de cliente, perfil sem permissão,
  sessão revogada e acesso direto por UUID.

## Questões que precisam de decisão antes da Fase 1

1. Um contato pode estar ligado a mais de um cliente da mesma empresa?
2. Quem cria o primeiro administrador: equipe interna ou convite enviado ao
   e-mail principal do cadastro?
3. Fechado: aprovação do orçamento muda o status para `aprovado` e o deixa
   pendente para consumo pela API existente do ERP (`codigoLegado` nulo).
4. O envio do carrinho gera orçamento para conferência ou pedido direto?
5. O cliente verá estoque numérico, disponibilidade textual ou nenhum estoque?
6. Haverá preço para todo o catálogo ou somente produtos com tabela válida?
7. Alterações de contatos também exigem aprovação interna?
8. Quais canais serão usados para recuperação e notificações: e-mail,
   WhatsApp ou ambos?
9. O portal será uma marca única da plataforma ou terá tema/logo por empresa?

## Ordem recomendada para o próximo passo

Antes de criar migrations, fechar as nove questões acima e produzir um
wireframe navegável das cinco jornadas críticas: ativação do cliente, primeiro
login, segunda via de documento, aprovação de orçamento e envio de carrinho.
Com essas decisões, a Fase 1 pode ser quebrada em histórias pequenas sem
retrabalho no modelo de identidade.
