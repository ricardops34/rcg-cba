# atividades — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `atividades`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Agenda e histórico de atendimento do CRM. Uma atividade é **tarefa futura** (ligação,
reunião, e-mail, visita, tarefa com vencimento) **ou registro do que já aconteceu**
(entra concluída). Pode se ligar a cliente, oportunidade e orçamento. O service é
exportado e reusado pelo agente interno (`agendar_atividade`, histórico do cliente) e
pelo WhatsApp (`whatsapp-acoes.service.ts`, agendar visita). Boa parte das atividades,
porém, **não passa por este service**: é gravada direto por outros módulos como
histórico automático (§3.5).

## Responsabilidades

- Agenda e histórico de atendimento do CRM. 🟢
- Uma atividade é **tarefa futura** (ligação,
reunião, e-mail, visita, tarefa com vencimento) **ou registro do que já aconteceu**
(entra concluída). 🟢
- Pode se ligar a cliente, oportunidade e orçamento. 🟢
- O service é
exportado e reusado pelo agente interno (`agendar_atividade`, histórico do cliente) e
pelo WhatsApp (`whatsapp-acoes.service.ts`, agendar visita). 🟢
- Boa parte das atividades,
porém, **não passa por este service**: é gravada direto por outros módulos como
histórico automático (§3.5). 🟢

## Regras de Negócio

- **RN-ATIV-01 (3.1 Escopo hierárquico e vínculos):** Mesmo padrão de `oportunidades`: leitura e escrita recortadas por `vendedorId IN escopo`. 🟢
- **RN-ATIV-02 (3.2 Vencimento em dia útil):** `create`/`update` carregam `carregarCalendarioUtil` (feriados da empresa) quando há 🟢
- **RN-ATIV-03 (3.3 Conclusão):** `concluida=true` sem `dataConclusao` → agora; `concluida=false` → `dataConclusao=null`. 🟢
- **RN-ATIV-04 (3.4 Dono da carteira × quem atendeu):** `create(…, { ignorarEscopo, vendedorAtendimentoId })` existe só para o atendimento de 🟢
- **RN-ATIV-05 (3.5 Atividades gravadas fora do service):** Sete pontos gravam `tx.atividade.create` direto, sem escopo e sem ajuste de calendário 🟢
- **RN-ATIV-06 (3.6 Uso pelo agente e WhatsApp):** `agendar_atividade` (agente): vendedor = `vendedorDoUsuario`; cliente conferido com 🟢
- **RN-ATIV-07 (3.7 Achados):** 🔴 **Hora do agente sem fuso.** `new Date('2026-09-23T14:00')` é interpretado no fuso 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `findAll — GET /atividades` (`atividades.visualizar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `feriados — GET /atividades/feriados` (`atividades.visualizar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `findOne — GET /atividades/:id` (`atividades.visualizar`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `create — POST /atividades` (`atividades.cadastrar`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `update — PATCH /atividades/:id` (`atividades.editar`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-06 | Execução de `remove — DELETE /atividades/:id` (`atividades.excluir`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-07 | Execução de `vendedorDoUsuario (pública)` (—) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-08 | Execução de `normalizarConclusao (privada)` (—) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-09 | Execução de `limpar (privada)` (—) | Could | Operação realizada com validação de parâmetros e persistência segura |
| RF-10 | Execução de `garantir{Vendedor,Cliente,Oportunidade,Orcamento}NoEscopo (privadas)` (—) | Could | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/atividades` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/atividades` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/atividades` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "atividades"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "atividades"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `atividades` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/atividades/atividades.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/atividades/atividades.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/atividades/atividades.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/atividades/dto/atividade.dto.ts` | Componente central | 🟢 |
| `apps/api/src/modules/atividades/atividades-feriados.spec.ts` | Componente central | 🟢 |

