# equipamentos-comodato — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `equipamentos-comodato`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Cadastro dos **equipamentos emprestados em comodato** (dispenser, saboneteira…) e dos
**produtos aplicáveis** a cada um (o refil, o papel, o sabonete). O cabeçalho é
`equipamentos_comodato` (um por produto); os itens **não** são tabela própria — são a
relação `aplicacao` de `produto_relacionados`, a mesma que o card "Relacionados" do
produto edita (as duas telas mexem no mesmo dado, pelo mesmo `ProdutoRelacionadosService.criar`).
Ajuda a montar o cadastro com dados: "Popular pelas notas" (cria equipamento para todo
produto que já saiu em remessa de comodato), **sugestões** por compra conjunta e **itens
comuns** aos clientes que estão com o equipamento.

## Responsabilidades

- Cadastro dos **equipamentos emprestados em comodato** (dispenser, saboneteira…) e dos
**produtos aplicáveis** a cada um (o refil, o papel, o sabonete). 🟢
- O cabeçalho é
`equipamentos_comodato` (um por produto); os itens **não** são tabela própria — são a
relação `aplicacao` de `produto_relacionados`, a mesma que o card "Relacionados" do
produto edita (as duas telas mexem no mesmo dado, pelo mesmo `ProdutoRelacionadosService.criar`). 🟢
- Ajuda a montar o cadastro com dados: "Popular pelas notas" (cria equipamento para todo
produto que já saiu em remessa de comodato), **sugestões** por compra conjunta e **itens
comuns** aos clientes que estão com o equipamento. 🟢

## Regras de Negócio

- **RN-EC-01 (3.1 Sugestões por compra conjunta ("lift")  — `flowcharts/equipamentos-comodato-sugestoes.md`):** `cli_eq`: clientes que **algum dia** receberam o equipamento (item `comodato = true`). 🟢
- **RN-EC-02 (3.2 Itens comuns por subcategoria  — `flowcharts/equipamentos-comodato-comuns.md`):** `em_poder`: clientes **ainda** com o equipamento — remessa (saída comodato) menos 🟢
- **RN-EC-03 (3.3 "Popular pelas notas"):** Produtos distintos de itens de saída `comodato = true` (CFOP 5908/6908), **produto ativo e 🟢
- **RN-EC-04 (3.4 Descrição parecida (`descricao-parecida.ts`)):** Raízes de 5 letras das palavras da descrição do equipamento, **sem a primeira palavra** 🟢
- **RN-EC-05 (3.5 Aplicações pertencem ao produto, não ao equipamento):** Excluir o equipamento não apaga as aplicações; recadastrá-lo (manual ou pelo Popular) 🟢
- **RN-EC-06 (3.6 Achados):** 🟡 **Bases diferentes entre as duas ferramentas.** Sugestões usam quem **um dia** recebeu 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `findAll — GET /equipamentos-comodato` (`visualizar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `findOne — GET /:id` (`visualizar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `create — POST` (`cadastrar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `update — PATCH /:id` (`editar`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `remove — DELETE /:id` (`excluir`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-06 | Execução de `removerLote — POST /excluir-lote` (`excluir`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-07 | Execução de `adicionarAplicacao / adicionarAplicacoesLote — POST /:id/aplicacoes[/lote]` (`editar`) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-08 | Execução de `removerAplicacao — DELETE /:id/aplicacoes/:relacaoId` (`editar`) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-09 | Execução de `sugestoes — GET /:id/sugestoes?categoriaId=` (`visualizar`) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-10 | Execução de `comuns — GET /:id/comuns?minimo=&categoriaId=` (`visualizar`) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-11 | Execução de `popular — POST /popular` (`importar`) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-12 | Execução de `categoriasPopular — GET /popular/categorias` (`importar`) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-13 | Execução de `categoriasSugestoes — GET /sugestoes/categorias` (`visualizar`) | Could | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/equipamentos-comodato` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/equipamentos-comodato` | 🟢 |
| Configuração | Constante `SUGESTAO_MESES` com valor `24` (janela de compra (sugestões e comuns)) | `apps/api/src/modules/equipamentos-comodato` | 🟢 |
| Configuração | Constante `SUGESTAO_MIN_CLIENTES` com valor `3` (mínimo de clientes com equipamento que compram) | `apps/api/src/modules/equipamentos-comodato` | 🟢 |
| Configuração | Constante `SUGESTAO_MIN_LIFT` com valor `1,5` (quanto acima da taxa geral) | `apps/api/src/modules/equipamentos-comodato` | 🟢 |
| Configuração | Constante `SUGESTAO_CANDIDATOS / SUGESTAO_LIMITE` com valor `40 / 20` (corte antes e depois da descrição parecida) | `apps/api/src/modules/equipamentos-comodato` | 🟢 |
| Configuração | Constante `COMUNS_PRODUTOS_POR_GRUPO` com valor `15` (produtos mostrados por subcategoria) | `apps/api/src/modules/equipamentos-comodato` | 🟢 |
| Configuração | Constante `minimo (query de comuns)` com valor `1–100, padrão 50` (cobertura mínima do grupo) | `apps/api/src/modules/equipamentos-comodato` | 🟢 |
| Configuração | Constante `RAIZES_IGNORADAS, TAMANHO_RAIZ` com valor `10 raízes, 5 letras` (descrição parecida) | `apps/api/src/modules/equipamentos-comodato` | 🟢 |
| Configuração | Constante `Lote de aplicações` com valor `até 100 ids` (contrato) | `apps/api/src/modules/equipamentos-comodato` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "equipamentos-comodato"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "equipamentos-comodato"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `equipamentos-comodato` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/equipamentos-comodato/equipamentos-comodato.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/equipamentos-comodato/equipamentos-comodato.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/equipamentos-comodato/equipamentos-comodato.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/equipamentos-comodato/descricao-parecida.ts` | Componente central | 🟢 |
| `apps/api/src/modules/equipamentos-comodato/dto/equipamento-comodato.dto.ts` | Componente central | 🟢 |

