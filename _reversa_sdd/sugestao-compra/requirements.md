# sugestao-compra — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `sugestao-compra`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Motor de recomendação de cross-sell: *"clientes parecidos com este compram algo que ele
não compra?"*. Dois modos que **compartilham o mesmo motor** (`gerarLinhasParaCliente`/
cálculo ao vivo com a mesma regra de semelhança) para nunca divergirem:
- **Ao vivo** (`paraCliente`): calcula na hora, devolve evidência completa (quem compra,
  quanto, preço na tabela do cliente). Usado pela tela e por uma ferramenta do agente de
  IA interno (módulo exportado — ver §7).
- **Gravado** (`gerarLote`/`gerarParaCliente` + `calculadaDoCliente`): roda o motor e
  grava em `sugestoes_compra` (`origem: 'local'`), para o catálogo de sugestões não
  depender de uma consulta cara a cada leitura — é o que o WhatsApp de funcionário
  (`clientes_sem_compra_no_mes`, módulo não analisado) espera encontrar já pronto. O lote
  roda em segundo plano (`iniciarLote`/`executarLote`), com acompanhamento por
  `ultimaExecucao` e notificação no sino ao terminar. Disparo manual — não há scheduler.

## Responsabilidades

- Motor de recomendação de cross-sell: *"clientes parecidos com este compram algo que ele
não compra?"*. 🟢
- Dois modos que **compartilham o mesmo motor** (`gerarLinhasParaCliente`/
cálculo ao vivo com a mesma regra de semelhança) para nunca divergirem:
- **Ao vivo** (`paraCliente`): calcula na hora, devolve evidência completa (quem compra,
  quanto, preço na tabela do cliente). 🟢
- Usado pela tela e por uma ferramenta do agente de
  IA interno (módulo exportado — ver §7). 🟢
- - **Gravado** (`gerarLote`/`gerarParaCliente` + `calculadaDoCliente`): roda o motor e
  grava em `sugestoes_compra` (`origem: 'local'`), para o catálogo de sugestões não
  depender de uma consulta cara a cada leitura — é o que o WhatsApp de funcionário
  (`clientes_sem_compra_no_mes`, módulo não analisado) espera encontrar já pronto. 🟢
- O lote
  roda em segundo plano (`iniciarLote`/`executarLote`), com acompanhamento por
  `ultimaExecucao` e notificação no sino ao terminar. 🟢
- Disparo manual — não há scheduler. 🟢

## Regras de Negócio

- **RN-SC-01 (3.1 Elegibilidade: só CNPJ com CNAE, só o ramo como universo de comparação):** `motivoInelegivel`: CPF (documento com 11 dígitos) ou cliente sem nenhum `ClienteCnae` 🟢
- **RN-SC-02 (3.2 Escopo decide quem é identificado, não quem entra no cálculo):** Comentário no topo da classe é explícito sobre a inversão: o **alvo** precisa estar na 🟢
- **RN-SC-03 (3.3 Score de semelhança — dois eixos combinados, com peso de hierarquia de CNAE):** `buscarSemelhantes` roda uma única consulta SQL com CTEs (`cestas`, `medidas`, 🟢
- **RN-SC-04 (3.4 `gerarLinhasParaCliente` — o motor gravado, espelho do ao vivo com uma diferença):** Compartilhado por `gerarLote` e `gerarParaCliente`, mas **não** é o mesmo código de 🟢
- **RN-SC-05 (3.5 "O que conta como venda" — mesmo critério do Dashboard e das Consultas):** A constante SQL `NOTA_DE_VENDA` (nota ativa, tipo `'N'`, sem comodato, **e com 🟢
- **RN-SC-06 (3.6 Lote: substituição por **recorte inteiro**, não por quem foi recalculado):** `gerarLote` apaga a sugestão anterior de **todo o recorte elegível** (escopo + faixa de 🟢
- **RN-SC-07 (3.7 Lote em segundo plano: 202 imediato, execução sem `await`, notificação no fim):** `iniciarLote`: antes de criar a execução, marca como `falhou` qualquer execução que 🟢
- **RN-SC-08 (3.8 `anonimizar.ts` — fronteira de dados para a IA, preparada mas não conectada):** Arquivo isolado, pequeno de propósito (comentário explícito: "é aqui que a regra pode ser 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `listagem(empresaId, user, query)` (filtros (`ativo`, `uf`, `municipio`, `vendedorId`, `bloqueado`, `search`) + paginação) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `calculadaDoCliente(empresaId, user, clienteId)` (id do cliente) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `gerarLinhasParaCliente(...) *(privado)*` (cliente, janela de datas) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `gerarLote(empresaId, user, body)` (escopo + faixa de código opcional) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `iniciarLote/executarLote` (mesmo body) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-06 | Execução de `gerarParaCliente(empresaId, user, clienteId, meses?)` (1 cliente) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-07 | Execução de `excluirCalculo(empresaId, user, filtro)` (1 cliente ou recorte (escopo + faixa)) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-08 | Execução de `ultimaExecucao(empresaId)` (—) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-09 | Execução de `clientesDoMesmoRamo/motivoInelegivel/clientesElegiveis *(privados)*` (cliente/escopo) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-10 | Execução de `buscarSemelhantes/produtosDosSemelhantes/cestaDoCliente/precosNaTabelaDoCliente *(privados)*` (parâmetros de cálculo) | Could | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/sugestao-compra` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/sugestao-compra` | 🟢 |
| Configuração | Constante `TEMPO_MAXIMO_LOTE_MS` com valor `15 min` (timeout da transação do lote e janela de "execução travada" em `iniciarLote`) | `apps/api/src/modules/sugestao-compra` | 🟢 |
| Configuração | Constante `TETO_VIZINHO` com valor `0,2` (teto do sinal de ramo vizinho — ver §3.3) | `apps/api/src/modules/sugestao-compra` | 🟢 |
| Configuração | Constante `PESO_NIVEL_CNAE (@plataforma/contracts)` com valor `subclasse 1 / classe 0,7 / grupo 0,4 / divisão 0,2` (peso por nível de parentesco hierárquico de CNAE) | `apps/api/src/modules/sugestao-compra` | 🟢 |
| Configuração | Constante `NIVEL_CNAE` com valor `{4: subclasse, 3: classe, 2: grupo, 1: divisao}` (traduz o `MAX(nivel)` numérico do SQL para o nome) | `apps/api/src/modules/sugestao-compra` | 🟢 |
| Configuração | Constante `parâmetro SUGESTAO_COMPRA_MESES (ParametrosService)` com valor `configurável por empresa, default do schema = 12` (janela de histórico quando a query não informa `meses`) | `apps/api/src/modules/sugestao-compra` | 🟢 |
| Configuração | Constante `sugestaoCompraQuerySchema defaults` com valor `meses:12 (1–60), limite:10 (1–50), semelhantes:30 (3–100), baseSemelhanca:'ambos', afinidadeCnae:'hierarquica'` (parâmetros ajustáveis da consulta ao vivo) | `apps/api/src/modules/sugestao-compra` | 🟢 |
| Configuração | Constante `CAMPOS_PROIBIDOS (anonimizar.ts)` com valor `16 chaves (razaoSocial, cnpjCpf, valorTotal, preco...)` (lista de bloqueio da barreira em runtime (§3.8)) | `apps/api/src/modules/sugestao-compra` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "sugestao-compra"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "sugestao-compra"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `sugestao-compra` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/sugestao-compra/sugestao-compra.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/sugestao-compra/sugestao-compra.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/sugestao-compra/sugestao-compra.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/sugestao-compra/dto/sugestao-compra.dto.ts` | Componente central | 🟢 |
| `apps/api/src/modules/sugestao-compra/anonimizar.ts` | Componente central | 🟢 |

