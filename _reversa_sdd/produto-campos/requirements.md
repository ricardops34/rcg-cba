# produto-campos — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `produto-campos`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Campos complementares de produto: o cadastro das definições (o que cada empresa decide
guardar — diluição, tensão, pictograma de risco etc., já que uma coluna nova em `produtos`
por empresa não escala) e o preenchimento desses campos por produto, com validação e
normalização de valor por tipo.

## Responsabilidades

- Campos complementares de produto: o cadastro das definições (o que cada empresa decide
guardar — diluição, tensão, pictograma de risco etc., já que uma coluna nova em `produtos`
por empresa não escala) e o preenchimento desses campos por produto, com validação e
normalização de valor por tipo. 🟢

## Regras de Negócio

- **RN-PC-01 (3.1 Chave única mesmo para excluídos (`criar`)):** A constraint `@@unique([empresaId, chave])` não distingue excluído: tentar recriar uma 🟢
- **RN-PC-02 (3.2 Trava de mudança de tipo com valores preenchidos (`atualizar`)):** Mudar o `tipo` de um campo já preenchido (`texto` → `numero`, por exemplo) quebraria a 🟢
- **RN-PC-03 (3.3 Normalização de valor por tipo (`normalizar-valor.ts`)):** Módulo isolado "para poder ser testado direto — é a regra mais fácil de quebrar sem 🟢
- **RN-PC-04 (3.4 `gravarValores` — formulário inteiro, apagar por valor vazio):** Recusa (não ignora) campo inexistente/excluído/desativado referenciado no payload — do 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `listar` (Definições ativas (ou todas) da empresa, ordenadas por `ordem`/`nome`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `criar/atualizar/remover` (CRUD da definição; chave imutável; trava de mudança de tipo com valores preenchidos) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `valoresDoProduto/valoresDoProdutoTx` (Formulário do produto: **toda** definição ativa + valor quando houver; recortes `apenasAgente`/`apenasPreenchidos`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `gravarValores` (Grava o formulário inteiro, validando e normalizando cada valor contra o tipo da definição) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `normalizarValorDoCampo` (Texto digitado → formato canônico por tipo (número, booleano, data, lista)) | Should | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/produto-campos` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/produto-campos` | 🟢 |
| Configuração | Constante `produtoCampoTipoSchema` com valor `texto/texto_longo/numero/booleano/data/lista` (tipos de campo complementar) | `apps/api/src/modules/produto-campos` | 🟢 |
| Configuração | Constante `produtoCampoChaveSchema (regex)` com valor `^[a-z0-9]+(-[a-z0-9]+)*$, 2–40 chars` (formato da chave estável, referenciada pela IA/integrações) | `apps/api/src/modules/produto-campos` | 🟢 |
| Configuração | Constante `opcoes` com valor `máx. 50, cada até 60 chars` (opções de campo `lista`) | `apps/api/src/modules/produto-campos` | 🟢 |
| Configuração | Constante `produtoCamposGravarSchema.valores` com valor `máx. 200 itens, valor até 2000 chars` (tamanho do payload de gravação em lote) | `apps/api/src/modules/produto-campos` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "produto-campos"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "produto-campos"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `produto-campos` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/produto-campos/produto-campos.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/produto-campos/produto-campos.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/produto-campos/produto-campos.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/produto-campos/normalizar-valor.ts` | Componente central | 🟢 |
| `apps/api/src/modules/produto-campos/dto/produto-campo.dto.ts` | Componente central | 🟢 |

