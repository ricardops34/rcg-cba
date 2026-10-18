# leads — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `leads`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Lado da **distribuição** dos leads que a IA capta no número institucional de WhatsApp.
A captação (criar/reescrever o lead, um por conversa) mora em
`WhatsappTriagemService.registrarLead` (módulo `whatsapp`); aqui a supervisão vê a fila,
entrega a um vendedor, devolve à fila, converte ou descarta. Lead é anterior ao cliente:
não tem carteira.

## Responsabilidades

- Lado da **distribuição** dos leads que a IA capta no número institucional de WhatsApp. 🟢
- A captação (criar/reescrever o lead, um por conversa) mora em
`WhatsappTriagemService.registrarLead` (módulo `whatsapp`); aqui a supervisão vê a fila,
entrega a um vendedor, devolve à fila, converte ou descarta. 🟢
- Lead é anterior ao cliente:
não tem carteira. 🟢

## Regras de Negócio

- **RN-LEAD-01 (3.1 Recorte próprio: quem distribui vê tudo):** `distribui` = escopo sem restrição (Administrador, Diretor), **ou** usuário sem cadastro de 🟢
- **RN-LEAD-02 (3.2 Situação acompanha o dono):** No `atualizar`, quando `vendedorId` muda e `situacao` **não** veio no mesmo PATCH: 🟢
- **RN-LEAD-03 (3.3 Aviso ao vendedor):** Só quando o dono **mudou** para alguém (não na devolução): notificação `lead_novo` com o 🟢
- **RN-LEAD-04 (3.4 Achados):** 🔴 **`atualizar` não aplica o recorte de `listar`.** Qualquer usuário com `leads.editar` 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `listar — GET /leads` (`leads.visualizar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `atualizar — PATCH /leads/:id` (`leads.editar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `distribui(tx, empresa, user, escopo) (privada)` (—) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `avisarVendedor (privada)` (—) | Should | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/leads` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/leads` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/leads` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "leads"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "leads"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `leads` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/leads/leads.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/leads/leads.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/leads/leads.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/leads/dto/lead.dto.ts` | Componente central | 🟢 |

