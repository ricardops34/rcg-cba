# clientes — Requisitos da Unit (Gestão de Clientes e Carteiras)

> Especificação formal de requisitos operacionais do módulo `clientes`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

O módulo `clientes` é o coração operacional da plataforma comercial multi-tenant (com cerca de 5.000 linhas de código no subsistema). É responsável pela gestão cadastral completa de clientes com isolamento hierárquico estrito de carteiras (vendedor, supervisor, gerente, administrador), fila de aprovação de alterações cadastrais campo a campo (com detecção de concorrência e deduplicação), enriquecimento de dados via Receita Federal (individual e em lote), gestão de CNAEs primários/secundários, exibição da "Posição de Cliente" 360° (vendas, devoluções, títulos a receber, mix de produtos e conversas) e controle de saldo e baixas de equipamentos em comodato com alerta de comodato sem consumo.

## Responsabilidades

- Gestão do ciclo de vida cadastral de clientes (criação, edição, detalhamento, contatos e soft delete com proteção de registros ERP). 🟢
- Aplicação rigorosa do escopo hierárquico de carteira (vendedor vê apenas a própria carteira, supervisores e gerentes veem o time). 🟢
- Resposta deliberada de 404 Not Found (e nunca 403 Forbidden) para clientes fora da carteira do usuário. 🟢
- Verificação de titularidade e anti-duplicidade por CNPJ/CPF com resposta mínima deliberada. 🟢
- Fila de aprovação de alterações cadastrais (`ClienteAlteracao`) para ~34 campos acompanhados com auditoria integral. 🟢
- Aprovação granular campo a campo com resolução de conflitos contra alterações concorrentes (`ConflictException`). 🟢
- Integração e enriquecimento cadastral via Receita Federal (MinhaReceita) individual e em lote assíncrono. 🟢
- Normalização fonética e estrutural de endereços, telefones e textos para evitar propostas de alteração cosméticas. 🟢
- Gestão de vínculos cliente x CNAE (principal e secundários) com união não-destrutiva. 🟢
- Visão agregada 360° da Posição de Cliente e cálculo em tempo real de KPIs de compras (últimos 30/90 dias). 🟢
- Controle unificado de saldo de equipamentos em comodato com detecção performática de clientes sem consumo aplicável. 🟢

## Regras de Negócio

- **RN-CLI-01 (Escopo Hierárquico de Carteira):** Consultas e mutações filtram registros pelo `vendedorId` do cliente conforme o usuário autenticado. Vendedores acessam exclusivamente sua carteira; gestores acessam a árvore de liderados; administradores acessam toda a empresa. Clientes fora do escopo respondem **404 Not Found** para não confirmar a existência do registro a terceiros. 🟢 `apps/api/src/modules/clientes/clientes.service.ts:230-237`
- **RN-CLI-02 (Consulta de Titularidade sem Vazamento):** As rotas de titularidade (`verificarTitularidade`, `titularidadePorCnpj`) ignoram intencionalmente o escopo de carteira para evitar prospecção duplicada. Contudo, dados sensíveis (contatos, valores, histórico e o próprio `clienteId`) são suprimidos se o cliente não pertencer à carteira de quem consulta. 🟢 `apps/api/src/modules/clientes/clientes.service.ts:240-247`
- **RN-CLI-03 (Fila de Alterações e Diff Acompanhado):** Alterações cadastrais submetidas por usuários sem permissão `clientes.aprovar` entram na fila `ClienteAlteracao` em estado `pendente`. Apenas os ~34 campos cadastrados em `CAMPOS_ACOMPANHADOS` (+ CNAEs) são monitorados. Reenvios do ERP com status pendente atualizam a pendência existente em vez de empilhar registros (deduplicação por empresa, cliente, origem e status). 🟢 `apps/api/src/modules/clientes/cliente-alteracoes.service.ts:250-259`
- **RN-CLI-04 (Aprovação Granular Campo a Campo):** O aprovador pode selecionar quais campos aceita. Campos não selecionados são registrados no histórico como `reprovado`. Se o cadastro do cliente tiver mudado entre a abertura da solicitação e a aprovação (conflito entre o valor atual e o valor "de" do diff), a transação é abortada com HTTP 409 Conflict. 🟢 `apps/api/src/modules/clientes/cliente-alteracoes.service.ts:260-264`
- **RN-CLI-05 (Equivalência Semântica de Endereço e Contato):** A comparação de campos de texto livre, endereços e telefones remove acentuação, formatação, pontuação e normaliza abreviações de logradouros ("AVENIDA" → "AV.") e DDDs. Diferenças puramente cosméticas não geram solicitações de alteração nem diff. 🟢 `apps/api/src/modules/clientes/endereco-equivalente.ts:1-75`
- **RN-CLI-06 (Regra de Preenchimento da Receita Federal):** Dados obtidos da Receita Federal preenchem automaticamente campos que estejam vazios no sistema (auto-aprovação), exceto quando o campo estiver travado na configuração de campos da empresa (`ClienteCampoConfigService`). Divergências em campos já preenchidos abrem proposta na fila de aprovação. A Receita nunca apaga campos locais já preenchidos. 🟢 `apps/api/src/modules/clientes/clientes.service.ts:280-287`
- **RN-CLI-07 (CNAEs Cumulativos / Aditivos):** Sincronizações de CNAEs via Receita Federal ou aprovações de cadastro são estritamente aditivas. Vínculos de CNAE nunca são removidos automaticamente para não apagar ramos de atividade incluídos manualmente. Códigos sem referência local no IBGE são listados em `cnaesSemReferencia`. 🟢 `apps/api/src/modules/clientes/cliente-alteracoes.service.ts:268-270`
- **RN-CLI-08 (Lote Assíncrono da Receita com Proteção contra Falhas):** Processamento em lote roda em background (fire and forget) com limitação de uma execução simultânea por empresa (HTTP 409 em corrida). Aplica intervalo de 1s entre chamadas à API pública, tolera execuções órfãs (> 3h) e aborta o lote após 20 falhas seguidas da fonte externa. Ao final, emite uma única notificação consolidada. 🟢 `apps/api/src/modules/clientes/clientes-receita-lote.service.ts:295-305`
- **RN-CLI-09 (Definição Estrita de Nota de Venda em Posição de Cliente):** Na visualização de Posição de Cliente, apenas notas ativas, de tipo 'N' (normal), com condição de pagamento e que não sejam remessas de comodato (`NOTA_DE_VENDA`) compõem os totais de compra. Notas canceladas no ERP são estritamente ignoradas. Devoluções abatem apenas via `vlrDev` da própria nota. 🟢 `apps/api/src/modules/clientes/clientes.service.ts:308-314`
- **RN-CLI-10 (Alerta de Comodato sem Consumo):** Equipamentos em comodato ativo disparam aviso de "comodato sem consumo" quando o cliente não adquire nenhum produto consumível aplicável (`tipo='aplicacao'`) nos últimos 30 dias (`COMODATO_DIAS_SEM_CONSUMO`). A subquery SQL é otimizada como `cliente.id IN (...)` descorrelacionada para evitar timeout transacional. 🟢 `apps/api/src/modules/clientes/comodato-sql.ts:1-80`
- **RN-CLI-11 (Baixa Integral de Comodato):** A baixa de comodato (`ComodatoBaixasService`) zera o saldo total atual do produto em poder do cliente (não aceita quantidade fracionada) e registra uma Atividade concluída no histórico do vendedor responsável. 🟢 `apps/api/src/modules/clientes/comodato-baixas.service.ts:333-336`
- **RN-CLI-12 (Proteção de Soft Delete para Clientes do ERP):** Clientes integrados ao ERP (possuidores de `codigoErp` ou `chave`) não podem ser excluídos via API (HTTP 409 Conflict), sendo permitida apenas a sua inativação para manter integridade com orçamentos, pedidos e notas. 🟢 `apps/api/src/modules/clientes/clientes.service.ts:369-371`

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Listagem paginada de clientes com busca e filtros de carteira | Must | Retorna apenas clientes dentro do escopo hierárquico com busca facetada por vendedor/UF/cidade |
| RF-02 | Detalhamento completo do cliente com escopo estrito | Must | Responde 404 se o cliente estiver fora da carteira do usuário |
| RF-03 | Cadastro e edição de clientes com trava de campos configuráveis | Must | Valida `ClienteCampoConfigService` no backend e desvia para fila de aprovação se sem alçada |
| RF-04 | Consulta pública e enriquecimento cadastral via CNPJ (MinhaReceita) | Should | Retorna dados e CNAEs casados com a tabela do IBGE local; 404 para CNPJ inválido e 502 se offline |
| RF-05 | Fila de aprovação de alterações cadastrais (`clientes-alteracoes`) | Must | Lista solicitações pendentes; permite aprovação campo a campo e recusa com justificativa obrigatória |
| RF-06 | Resolução de conflitos de concorrência em aprovações | Must | Lança 409 Conflict se o cadastro tiver mudado entre a proposta e o momento da aprovação |
| RF-07 | Enriquecimento em lote pela Receita Federal | Should | Executa em background a 1 req/s, preenche vazios, propõe divergentes e emite notificação única |
| RF-08 | Posição de Cliente 360° com histórico de notas, títulos e mix | Must | Exibe notas normais, notas de comodato separadas, títulos recalculados e saldo em aberto |
| RF-09 | Listagem de Posição de Cliente com ordenação por colunas agregadas | Must | Suporta ordenação SQL direta por compras dos últimos 30/90 dias e dias sem comprar |
| RF-10 | Gestão de CNAEs do cliente (adição, edição de principal, remoção) | Should | Vínculo subordinado a permissão `clientes.editar` com preservação de integridade |
| RF-11 | Baixa e reversão de baixa de equipamentos em comodato | Should | Zera saldo total do item no cliente, registra log em Atividades e permite estorno auditado |
| RF-12 | Verificação de titularidade de CNPJ/CPF entre carteiras | Must | Permite checar se o cliente já existe sem revelar dados sensíveis nem `clienteId` alheio |
| RF-13 | Gestão de contatos do cliente com integração ao Portal e WhatsApp | Should | Permite cadastrar múltiplos contatos vinculáveis ao atendimento |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Performance | Subquery SQL descorrelacionada para cálculo de comodato sem consumo | `apps/api/src/modules/clientes/comodato-sql.ts:40-60` | 🟢 |
| Performance | Listagem de Posição de Cliente com SQL puro via `Prisma.sql` para ordenação pré-limit | `apps/api/src/modules/clientes/clientes.service.ts:338-345` | 🟢 |
| Segurança | Resposta deliberada de 404 Not Found para clientes fora de carteira | `apps/api/src/modules/clientes/clientes.service.ts:235-237` | 🟢 |
| Segurança | Comparação de CNPJ no banco usando `regexp_replace` para neutralizar máscaras | `apps/api/src/modules/clientes/clientes.service.ts:372-373` | 🟢 |
| Resiliência | Controle de execução órfã no lote da Receita Federal (timeout de 3 horas) | `apps/api/src/modules/clientes/clientes-receita-lote.service.ts:298-299` | 🟢 |
| Confiabilidade | Deduplicação automática de solicitações pendentes na fila de aprovação | `apps/api/src/modules/clientes/cliente-alteracoes.service.ts:257-259` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Vendedor tenta acessar cliente de outro vendedor
```gherkin
Dado que o vendedor "João" possui em sua carteira apenas clientes da região Norte
E existe o cliente "Padaria Central" vinculado exclusivamente à carteira da vendedora "Maria"
Quando o vendedor "João" envia uma requisição GET /clientes/:padariaCentralId
Então a API responde com status 404 Not Found
E nenhuma informação do cliente é revelada
```

### Cenário 2: Alteração de cliente por usuário sem alçada de aprovação
```gherkin
Dado que o usuário possui permissão "clientes.editar" mas não possui "clientes.aprovar"
Quando ele altera o limite de crédito do cliente de R$ 5.000 para R$ 15.000
Então o cadastro do cliente permanece com limite de crédito em R$ 5.000
E uma solicitação em "ClienteAlteracao" é criada com status "pendente" e diff calculado
E o supervisor da carteira visualiza a solicitação na fila de aprovação
```

### Cenário 3: Aprovação de alteração com concorrência detectada
```gherkin
Dado que existe uma solicitação pendente para alterar a razão social de "Mercado A" para "Mercado B"
E outro usuário atualizou diretamente o cliente para "Mercado A Ltda" após a abertura da solicitação
Quando o supervisor tenta aprovar a solicitação pendente
Então a API responde com status 409 Conflict
E a mensagem indica que o cadastro original foi modificado concorrentemente
E o banco de dados não aplica a alteração inconsistente
```

### Cenário 4: Identificação de comodato sem consumo aplicável
```gherkin
Dado que o cliente possui 2 comodatos ativos de "Máquina de Café Modelo X"
E o produto consumível aplicável a este equipamento é "Café em Grãos 1kg"
E a última nota de venda de "Café em Grãos 1kg" para este cliente foi emitida há 45 dias
Quando a Posição de Cliente é consultada
Então a flag "comodatoSemConsumo" é retornada como verdadeira
E o alerta é exibido no card de equipamentos em comodato
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| CRUD de Clientes e Escopo Hierárquico (RF-01, RF-02, RF-03) | Must | Base cadastral e isolamento operacional mandatório da força de vendas |
| Fila de Aprovação e Gestão de Concorrência (RF-05, RF-06) | Must | Integridade de dados cadastrais e conformidade com alçadas comerciais |
| Posição de Cliente 360° e Listagem de KPIs (RF-08, RF-09) | Must | Principal ferramenta de tomada de decisão e atendimento dos vendedores |
| Anti-duplicidade e Titularidade de Clientes (RF-12) | Must | Prevenção de conflito de canal e sobreposição de carteiras |
| Gestão de Comodatos e Baixas (RF-11) | Should | Gestão de patrimônio e auditoria de comodatos em clientes |
| Consulta e Atualização em Lote pela Receita Federal (RF-04, RF-07) | Should | Produtividade e higienização cadastral automatizada |
| Gestão de Contatos e CNAEs Subordinados (RF-10, RF-13) | Should | Dados complementares para faturamento e atendimento |

## Rastreabilidade de Código

| Arquivo | Função / Elemento | Cobertura |
|---------|-------------------|-----------|
| `apps/api/src/modules/clientes/clientes.controller.ts` | `ClientesController` | 🟢 |
| `apps/api/src/modules/clientes/clientes.service.ts` | `ClientesService.findAll` / `findOne` | 🟢 |
| `apps/api/src/modules/clientes/clientes.service.ts` | `ClientesService.posicao` / `listagemPosicao` | 🟢 |
| `apps/api/src/modules/clientes/clientes.service.ts` | `ClientesService.verificarTitularidade` | 🟢 |
| `apps/api/src/modules/clientes/cliente-alteracoes.service.ts` | `ClienteAlteracoesService.calcularDiff` / `aprovar` | 🟢 |
| `apps/api/src/modules/clientes/clientes-receita-lote.service.ts` | `ClientesReceitaLoteService.executar` | 🟢 |
| `apps/api/src/modules/clientes/comodato-baixas.service.ts` | `ComodatoBaixasService.baixar` / `desfazer` | 🟢 |
| `apps/api/src/modules/clientes/comodato-sql.ts` | Expressões SQL de saldo e consumo de comodato | 🟢 |
| `apps/api/src/modules/clientes/endereco-equivalente.ts` | Normalização fonética e equivalência de endereços | 🟢 |
| `apps/api/src/modules/clientes/enriquecimento.service.ts` | `EnriquecimentoService.consultarCnpj` | 🟢 |

