# Website multi-tenant por empresa — institucional, catálogo e loja

## Objetivo

Permitir que cada empresa da plataforma publique um website próprio, com
identidade visual, domínio, páginas institucionais, catálogo de produtos, loja
e entrada para a Área do Cliente.

O website público e o Portal do Cliente usam a mesma base comercial, mas têm
responsabilidades diferentes:

- **website**: aquisição, apresentação da marca, conteúdo público, catálogo e
  compra/solicitação inicial;
- **Portal do Cliente**: dados privados, preços negociados, documentos,
  orçamentos, títulos, histórico e carrinho identificado;
- **sistema base**: configuração, publicação, operação comercial, auditoria e
  atendimento pelo vendedor.

Este plano complementa [`portal-cliente.md`](./portal-cliente.md). A Área do
Cliente não será reimplementada dentro do website.

## Modos de operação

Cada empresa poderá habilitar uma combinação progressiva:

1. **Institucional** — páginas, contatos, unidades, formulários e conteúdo;
2. **Catálogo** — produtos e categorias sem compra;
3. **Catálogo com orçamento** — visitante monta uma lista e solicita contato;
4. **Loja** — carrinho, identificação, endereço, frete, pagamento ou envio de
   pedido;
5. **Área do Cliente** — acesso ao portal autenticado já planejado.

O modo é parâmetro, não um fork de código. Uma empresa pode começar
institucional, publicar o catálogo depois e ativar checkout somente quando
preço, estoque, frete, pagamento e integração com ERP estiverem homologados.

## Arquitetura recomendada

### Aplicação pública dedicada

Criar `apps/sites` em Next.js, separado de `apps/web` e
`apps/portal-cliente`. Uma única aplicação atende todas as empresas e resolve o
tenant pelo host da requisição:

```text
www.empresa-a.com.br ─┐
loja.empresa-b.com.br ├─ apps/sites ─ API pública ─ Postgres/RLS
empresa-c.plataforma.tld ┘
```

Não gerar um projeto ou deploy por empresa. Conteúdo, tema e domínio são dados
multi-tenant. Isso mantém correções, SEO técnico e recursos da loja numa única
base de código.

O site usa Server Components/SSR para páginas públicas indexáveis. JavaScript
cliente fica restrito a busca, filtros, galeria, carrinho e interações que
realmente precisam dele. Dados independentes devem ser carregados em paralelo,
e respostas publicadas podem usar cache por domínio + versão de publicação.

### Resolução de domínio antes do tenant

`SiteDominio` precisa ser consultada antes de existir `empresaId`, pois é a
consulta que descobre o tenant. Ela será uma exceção sem RLS, documentada na
migration, e conterá somente domínio, empresa, status de verificação e
metadados técnicos — nenhum conteúdo comercial.

Depois de resolver o domínio, toda consulta entra em
`PrismaService.withTenant(empresaId, ...)`. Nunca aceitar `empresaId` vindo de
query string ou cabeçalho público.

### API pública separada

Criar `SitePublicoModule` sob `/api/v1/site-publico`, sem os guards internos e
sem liberar os CRUDs administrativos. A API pública só devolve conteúdo
publicado e campos explicitamente permitidos.

Rotas de administração ficam em `/api/v1/sites-admin`, protegidas por JWT,
perfil e rotinas do sistema base. Preview de rascunho usa token assinado curto,
não uma flag pública `?draft=true`.

## Gestão no sistema base

Adicionar **Marketing / Website** com as rotinas:

| Rotina | Responsabilidade |
|---|---|
| Visão geral | status, domínio, publicação e indicadores |
| Identidade visual | logo, cores, tipografia e estilo |
| Navegação | cabeçalho, menus, rodapé e redes sociais |
| Páginas | conteúdo institucional e SEO |
| Banners e vitrines | campanhas, destaques e períodos |
| Catálogo público | produtos/categorias publicados |
| Loja | preços públicos, carrinho e checkout |
| Pedidos do site | operação e conversão comercial |
| Formulários e leads | contatos recebidos e consentimento |
| Domínios | DNS, verificação, SSL e redirects |
| Integrações | analytics, pagamentos, frete e pixels |

Permissões seguem a matriz atual de perfil × rotina × ação. Publicar deve ser
uma ação separada de editar: alguém pode preparar conteúdo sem colocá-lo no ar.

## Identidade visual sem aparência de template

O módulo não deve oferecer apenas troca de cor em um template genérico. Cada
empresa terá uma direção visual composta por tokens e escolhas estruturais:

- paleta com papéis semânticos, contraste validado e versões clara/escura;
- famílias tipográficas de marca, leitura e dados;
- densidade, raios, bordas, largura de conteúdo e ritmo vertical;
- estilo de fotografia e proporção das imagens de produto;
- composição do hero, cards e vitrines escolhida entre layouts homologados;
- ícones, tom de voz e assinatura visual.

Primeira versão deve trabalhar com blocos editoriais bem definidos, não com um
page builder de posicionamento livre. Blocos sugeridos:

- hero editorial;
- texto + imagem;
- manifesto/números;
- categorias em destaque;
- vitrine de produtos;
- marcas atendidas;
- depoimentos;
- unidades e mapa;
- perguntas frequentes;
- chamada para orçamento/WhatsApp/Área do Cliente;
- formulário de contato.

Blocos têm variantes deliberadas e acessíveis. O editor escolhe composição e
conteúdo; não injeta HTML, CSS ou JavaScript arbitrário.

## Modelo de dados proposto

### Configuração e publicação

- `SiteConfig`: empresa, modo, nome público, status, locale, moeda, analytics e
  versão publicada;
- `SiteDominio`: domínio/subdomínio, principal, verificado, SSL e redirect;
- `SiteTema`: tokens de cor, tipografia, layout e assets;
- `SiteNavegacao` e `SiteNavegacaoItem`;
- `SitePagina`: slug, título, status, SEO e versão;
- `SitePaginaBloco`: tipo, ordem e conteúdo JSON validado por schema;
- `SitePublicacao`: snapshot/versão, autor, data e changelog;
- `SiteMidia`: arquivo, alt text, dimensões, formato, variantes e autoria.

Todas as tabelas de negócio têm `empresaId`, RLS e policy na mesma migration.
Slugs são únicos por empresa, não globalmente.

### Catálogo público

Não publicar automaticamente todos os produtos internos. Criar uma camada
editorial:

- `SiteProduto`: produto, publicado, slug, nome comercial, descrição pública,
  SEO, ordem e flags de destaque;
- `SiteCategoria`: categoria pública, slug, texto, imagem e ordem;
- `SiteProdutoCategoria`: associação editorial quando a taxonomia pública
  diferir da categoria do ERP;
- `SiteColecao` e `SiteColecaoProduto`: vitrines/campanhas;
- galeria reutiliza `ProdutoFoto`, respeitando uma flag de publicação por foto
  ou uma seleção própria do site.

Dados sensíveis como custo, comissão, regra de desconto e observações internas
nunca entram nos contratos públicos.

### Conteúdo e leads

- `SiteFormulario`: definição dos campos permitidos e consentimentos;
- `SiteLead`: origem, página, dados normalizados, UTM, aceite e status;
- `SiteLeadEvento`: recebimento, atribuição, contato e conversão.

Lead deve criar/relacionar atendimento no sistema base sem criar um `Cliente`
automaticamente. Conversão em cliente continua sendo uma ação controlada.

### Loja e pedidos

- `SiteCarrinho`: sessão anônima ou contato autenticado, moeda, validade e
  totais;
- `SiteCarrinhoItem`: produto, quantidade, preço calculado e snapshot;
- `SitePedido`: comprador, cliente opcional, endereços em snapshot, condição,
  frete, pagamento, totais e status;
- `SitePedidoItem`: produto e valores imutáveis no momento da confirmação;
- `SitePedidoEvento`: linha do tempo operacional;
- `SitePagamento`: provedor, identificador externo, status e valores, sem
  armazenar dados brutos de cartão;
- `SiteEntrega`: modalidade, transportadora, rastreio e status.

Status do pedido sugeridos: `rascunho`, `aguardando_pagamento`, `pago`,
`em_analise`, `confirmado`, `integrado_erp`, `faturado`, `enviado`, `entregue`,
`cancelado` e `falha_integracao`.

## Catálogo, preço e estoque

### Visitante anônimo

Preço público não pode reutilizar silenciosamente a tabela negociada de um
cliente. A empresa escolhe uma política:

- sem preço — “consulte”;
- tabela pública específica;
- preço “a partir de” com regras claras;
- preço completo de varejo.

Estoque também é parametrizado: oculto, disponibilidade textual ou quantidade.
Nunca expor reserva, custo ou saldo de armazém não publicado.

### Cliente autenticado

Ao entrar na Área do Cliente, preços e permissões passam a seguir o plano do
portal. Se o usuário retornar ao catálogo público autenticado, a integração
pode exibir preço do cliente, mas a resposta deve vir de rota autenticada e não
ser armazenada em cache público.

### Busca e navegação

Busca inicial pode usar Postgres com texto normalizado, trigram e filtros por
categoria/marca. Um motor externo só entra quando volume, sinônimos, ranking ou
facetas justificarem a complexidade.

Cards usam thumbnail da foto principal; detalhe usa a galeria completa. Servir
formatos modernos e tamanhos responsivos, reservando dimensões para evitar
salto de layout.

## Carrinho e checkout

O carrinho anônimo usa identificador aleatório em cookie `HttpOnly`/`SameSite`
e expira. Não confiar em preço enviado pelo navegador: produto, quantidade,
estoque, preço, desconto, frete e total são recalculados no servidor.

Quando o visitante autenticar no Portal do Cliente, oferecer associação segura
do carrinho anônimo ao contato. A partir daí ele pode:

- continuar no carrinho comercial do portal;
- solicitar orçamento;
- concluir pedido, se a loja estiver habilitada.

Carrinho público e carrinho do portal não devem manter duas cópias divergentes.
Definir um service central de carrinho com canais/origens diferentes e regras
de preço por contexto.

O checkout será dividido em etapas persistentes: identificação, entrega,
pagamento/revisão e confirmação. Repetir a confirmação deve devolver o mesmo
pedido por chave de idempotência.

## Pagamento, frete e ERP

Criar interfaces de provedor, sem acoplar o domínio a uma adquirente:

```ts
interface SitePagamentoProvider {
  criarCobranca(...): Promise<...>;
  consultar(...): Promise<...>;
  estornar(...): Promise<...>;
  validarWebhook(...): Promise<...>;
}
```

Webhooks validam assinatura, são idempotentes e guardam identificador do evento
externo. Dados de cartão ficam exclusivamente no checkout/tokenização do
provedor.

Frete começa com retirada e regras fixas por CEP/faixa; integrações com
transportadoras entram pelo mesmo padrão de adapters.

Pedido pago/confirmado não deve virar nota diretamente. Ele entra numa fila de
integração com o ERP. A API precisa registrar tentativa, resposta e permitir
reprocessamento seguro. Definir com o ERP se o objeto de destino é pedido de
venda ou orçamento aprovado.

## Área do Cliente

O cabeçalho expõe “Área do Cliente” apontando para o domínio do portal ou rota
dedicada. A experiência pode compartilhar marca e navegação, mas autenticação,
cookies e dados privados permanecem isolados.

Com domínio próprio, opções aceitáveis:

- `www.empresa.com.br` para o site e `cliente.empresa.com.br` para o portal;
- `empresa.plataforma.tld` e `cliente-empresa.plataforma.tld` como fallback.

SSO entre site e portal só deve ser avaliado depois; não compartilhar cookie
de sessão entre subdomínios na primeira versão.

## SEO, acessibilidade e performance

- SSR/SSG incremental por domínio e versão publicada;
- sitemap e robots por empresa;
- canonical, Open Graph e dados estruturados Organization/Product/Breadcrumb;
- redirects 301 administráveis ao mudar slug;
- páginas de produto sem preço válido continuam coerentes para buscadores;
- Core Web Vitals monitorados por domínio;
- imagens responsivas, lazy loading abaixo da dobra e preload somente do hero;
- navegação por teclado, foco visível, contraste AA, alt text obrigatório e
  `prefers-reduced-motion`;
- consentimento antes de analytics/pixels não essenciais;
- cache público nunca contém dados ou preços personalizados.

## Segurança pública

- rate limit por host/IP/rota e proteção adicional em login, busca e forms;
- CAPTCHA progressivo somente após comportamento suspeito;
- CSP por aplicação, sanitização dos blocos e nenhuma execução de HTML livre;
- upload validado por MIME real, tamanho e processamento de imagem;
- domínio validado por DNS antes de ativar;
- preview assinado, curto e revogável;
- webhooks com assinatura, replay protection e idempotência;
- LGPD: consentimentos versionados, retenção de leads e canal de exclusão;
- auditoria de publicação, preço, pedido, pagamento e integração;
- testes asseguram que domínio A nunca resolve conteúdo da empresa B.

## API inicial

Pública, resolvida pelo host:

- `GET /site-publico/config`;
- `GET /site-publico/navegacao`;
- `GET /site-publico/paginas/:slug`;
- `GET /site-publico/catalogo`, categorias, coleções e produto por slug;
- `GET/POST/PATCH /site-publico/carrinho` e itens;
- `POST /site-publico/leads`;
- endpoints de checkout quando a loja estiver habilitada.

Administrativa:

- CRUD de configuração, tema, domínio, páginas, blocos e navegação;
- seleção/publicação de produtos, categorias, coleções e fotos;
- preview, validação e publicação;
- leads, carrinhos e pedidos;
- configuração de preço, estoque, frete, pagamento e integrações.

O Swagger público deve documentar somente o contrato público; endpoints
administrativos permanecem no documento autenticado da aplicação interna.

## Telas administrativas

1. Assistente de ativação do website;
2. Painel de status e checklist de publicação;
3. Identidade visual com preview responsivo;
4. Editor de navegação e rodapé;
5. Lista/editor de páginas por blocos;
6. Catálogo público e publicação em lote;
7. Coleções, vitrines e banners agendados;
8. Configuração da loja;
9. Leads, carrinhos abandonados e pedidos;
10. Domínios, redirects, SEO e integrações;
11. Histórico de versões e publicação.

## Fases de entrega

### Fase 0 — produto e direção visual

- definir os modos que entram no primeiro lançamento;
- escolher três empresas piloto com setores e identidades diferentes;
- desenhar sistema de temas e blocos contra conteúdo real dessas empresas;
- prototipar home, categoria, produto, carrinho e transição para o portal;
- fechar estratégia de domínio e publicação.

### Fase 1 — infraestrutura multi-site

- `apps/sites`, resolução de domínio, RLS e cache;
- configuração, tema, mídia, navegação e publicação versionada;
- domínio fallback por empresa, preview e página institucional inicial.

### Fase 2 — CMS institucional

- editor por blocos, páginas, formulários, SEO e redirects;
- leads integrados ao atendimento;
- domínio próprio, SSL e observabilidade.

### Fase 3 — catálogo

- seleção editorial de produtos/categorias/fotos;
- busca, filtros, coleções, preço/estoque parametrizados;
- sitemap de produtos e dados estruturados.

### Fase 4 — orçamento e integração com portal

- carrinho público persistente;
- solicitação de orçamento/contato;
- associação após login e continuidade no Portal do Cliente;
- visibilidade para vendedor e recuperação de carrinho.

### Fase 5 — loja e checkout

- endereços, frete, pagamento, pedido e webhooks;
- integração idempotente com ERP;
- operação de pedidos, cancelamento e notificações.

### Fase 6 — crescimento

- recomendações, campanhas e carrinho abandonado;
- analytics por funil e origem;
- experimentos controlados, sem fragmentar temas ou SEO;
- internacionalização apenas se houver empresa com demanda concreta.

## Critérios de aceite

- host desconhecido não revela empresas existentes;
- domínio só publica após verificação;
- rascunho nunca aparece na API pública;
- conteúdo e catálogo respeitam tenant via `withTenant` e RLS;
- preço personalizado nunca entra em cache público;
- troca de UUID/slug/host não acessa produto ou página de outro tenant;
- edição e publicação são permissões separadas e auditadas;
- total do carrinho é sempre recalculado no servidor;
- confirmação e webhooks são idempotentes;
- dados de cartão não passam nem ficam armazenados na plataforma;
- páginas públicas atendem acessibilidade AA e metas de Core Web Vitals;
- sitemap, canonical, metadata e dados estruturados são específicos por empresa;
- Área do Cliente mantém tokens e cookies isolados do site público.

## Questões a decidir antes da Fase 1

1. O primeiro lançamento terá apenas institucional + catálogo, ou também
   solicitação de orçamento?
2. Loja significa pagamento online desde o início ou envio de pedido para
   faturamento posterior?
3. Qual tabela de preço será pública para visitantes anônimos?
4. A empresa pode publicar produto sem saldo e aceitar encomenda?
5. Quais meios de pagamento e regras de frete entram no piloto?
6. O pedido do site vira pedido de venda ou orçamento no ERP?
7. A identidade visual será configurada pela equipe da plataforma ou pelo
   administrador de cada empresa?
8. Cada empresa poderá usar domínio próprio já na primeira versão?
9. Quais páginas e blocos são obrigatórios no template inicial?
10. Produtos e fotos precisam de aprovação antes da publicação?

## Próximo passo recomendado

Selecionar três empresas piloto diferentes e responder às dez questões acima.
Depois, criar um protótipo com conteúdo real — não lorem ipsum — para validar se
o sistema de temas consegue produzir três sites reconhecivelmente distintos
sem criar três bases de código. Só então fechar o schema do CMS e iniciar a
Fase 1.
