# agente — Requisitos da Unit

> Especificação formal de requisitos operacionais do módulo `agente`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Visão Geral

Assistente de IA interno para o funcionário **logado**: chat com ferramentas que
consultam e (com confirmação) gravam no CRM, delegando aos services das telas. Também
contém:

- a camada de **provedor de IA** reaproveitada pela triagem do WhatsApp
  (`ProvedorIaModule`: Anthropic Messages, OpenAI-compatível e Codex Responses por OAuth);
- a **configuração por empresa** (provedor, chave cifrada, modelo, temperatura, limites,
  personalidade, embeddings);
- a **governança do catálogo** (ligar/desligar ferramenta, restringir por perfil,
  reescrever descrição e instruções, versões de prompt, termos de aceite, auditoria);
- a **abertura do dia** (`meu_dia`, resumo diário) e os **anexos** (ficha técnica em PDF,
  foto de produto).

## Responsabilidades

- Assistente de IA interno para o funcionário **logado**: chat com ferramentas que
consultam e (com confirmação) gravam no CRM, delegando aos services das telas. 🟢
- Também
contém:

- a camada de **provedor de IA** reaproveitada pela triagem do WhatsApp
  (`ProvedorIaModule`: Anthropic Messages, OpenAI-compatível e Codex Responses por OAuth);
- a **configuração por empresa** (provedor, chave cifrada, modelo, temperatura, limites,
  personalidade, embeddings);
- a **governança do catálogo** (ligar/desligar ferramenta, restringir por perfil,
  reescrever descrição e instruções, versões de prompt, termos de aceite, auditoria);
- a **abertura do dia** (`meu_dia`, resumo diário) e os **anexos** (ficha técnica em PDF,
  foto de produto). 🟢

## Regras de Negócio

- **RN-AGEN-01 (3.1 O turno — `AgenteChatService.enviar`):** 1. `config.paraUso` (credencial em claro, só em memória); confere o anexo (`anexos.meu`) 🟢
- **RN-AGEN-02 (3.2 Fronteira de dados — `anonimizar-agente.ts`):** Mascara **por nome de chave conhecida** (não por heurística de texto): nome de cliente, 🟢
- **RN-AGEN-03 (3.3 Confirmação — `confirmar` / `cancelar`):** `confirmar`: a conversa é do usuário, a pendência existe nela e ainda está `pendente`, a 🟢
- **RN-AGEN-04 (3.4 Catálogo e alcance):** **31 ferramentas** no código: 22 de leitura e 9 de escrita (4 exigem WhatsApp 🟢
- **RN-AGEN-05 (3.5 Governança — `AgenteFerramentasService`):** Uma linha por (empresa, ferramenta): `ativa`, `nome`, `descricao`, `instrucoes`, 🟢
- **RN-AGEN-06 (3.6 Provedores e credenciais):** `AgenteCredencial` por (empresa, provedor): trocar de provedor mantém as duas chaves e 🟢
- **RN-AGEN-07 (3.7 Anexos):** Material de passagem: o modelo lê uma vez (o PDF vira Markdown na ficha técnica, a foto 🟢
- **RN-AGEN-08 (3.8 Achados):** 🟡 **Confirmação não é atômica.** `confirmar` lê `pendente=true`, executa e só depois 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|------------|-------------------|
| RF-01 | Execução de `Grupo` (Rotas) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-02 | Execução de `Uso` (`GET apresentacao`, `GET resumo-diario`, `POST resumo-diario/:data/exibido`, `GET ferramentas-disponiveis`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-03 | Execução de `Conversa` (`GET conversas`, `GET conversas/:id`, `POST conversas/mensagens`, `POST conversas/mensagens/stream` (SSE), `POST anexos`, `POST conversas/:id/confirmar/:pendenciaId`, `POST conversas/:id/cancelar/:pendenciaId`) | Must | Operação realizada com validação de parâmetros e persistência segura |
| RF-04 | Execução de `Configuração` (`GET/PUT config`, `POST config/testar`, `config/oauth/{iniciar, concluir, importar, desconectar}`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-05 | Execução de `Governança` (`GET ferramentas`, `PUT ferramentas/:chave`, `GET/POST ferramentas/termos`, `POST ferramentas/restaurar-todos`, `POST ferramentas/:chave/restaurar`, `GET ferramentas/auditoria`) | Should | Operação realizada com validação de parâmetros e persistência segura |
| RF-06 | Execução de `Prompt` (`POST prompt/previa` (sem custo), `POST prompt/testar` (consome tokens)) | Should | Operação realizada com validação de parâmetros e persistência segura |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Isolamento multi-tenant por RLS (`empresaId`) | `apps/api/src/modules/agente` | 🟢 |
| Segurança | Controle de acesso via Guards (`JwtAuthGuard`, `PermissionsGuard`) | `apps/api/src/modules/agente` | 🟢 |
| Performance | Consultas indexadas e paginadas com limite de payload | `apps/api/src/modules/agente` | 🟢 |

## Critérios de Aceitação

### Cenário 1: Operação com sucesso (Happy Path)
```gherkin
Dado que o usuário está autenticado e possui a permissão correspondente do módulo "agente"
Quando executa a operação principal com parâmetros válidos
Então o sistema processa a requisição e retorna status 200/201
E os dados são persistidos no banco respeitando o tenant ativo
```

### Cenário 2: Falha por falta de autorização ou dados inválidos
```gherkin
Dado que o usuário não possui permissão para acessar o módulo "agente"
Quando envia uma requisição para o endpoint protegido
Então a API retorna status 403 Forbidden
E nenhuma alteração é persistida no banco
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Consultas e mutações fundamentais de `agente` | Must | Caminho crítico e responsabilidade central do módulo |
| Filtros avançados e operações auxiliares | Should | Importante para eficiência operacional e usabilidade |
| Exportações e rotinas de suporte secundárias | Could | Operações de conveniência ou baixa frequência |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `apps/api/src/modules/agente/agente.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/agente/agente.controller.ts` | Componente central | 🟢 |
| `apps/api/src/modules/agente/agente-chat.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/agente/agente-tools.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/agente/agente-ferramentas.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/agente/agente-config.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/agente/agente-referencias.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/agente/anonimizar-agente.ts` | Componente central | 🟢 |
| `apps/api/src/modules/agente/agente-anexos.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/agente/agente-meu-dia.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/agente/agente-resumo-diario.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/agente/agente-prompt-versoes.ts` | Componente central | 🟢 |
| `apps/api/src/modules/agente/agente-progresso.ts` | Componente central | 🟢 |
| `apps/api/src/modules/agente/agente-cripto.ts` | Componente central | 🟢 |
| `apps/api/src/modules/agente/embeddings.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/agente/provedor-ia.ts` | Componente central | 🟢 |
| `apps/api/src/modules/agente/provedor-ia.module.ts` | Componente central | 🟢 |
| `apps/api/src/modules/agente/provedor.factory.ts` | Componente central | 🟢 |
| `apps/api/src/modules/agente/anthropic.client.ts` | Componente central | 🟢 |
| `apps/api/src/modules/agente/openai-compativel.client.ts` | Componente central | 🟢 |
| `apps/api/src/modules/agente/codex.client.ts` | Componente central | 🟢 |
| `apps/api/src/modules/agente/codex-oauth.service.ts` | Componente central | 🟢 |
| `apps/api/src/modules/agente/dia-operacional.ts` | Componente central | 🟢 |
| `apps/api/src/modules/agente/dto/agente.dto.ts` | Componente central | 🟢 |

