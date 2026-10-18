# Máquinas de Estado do Sistema — rcgcba

> Gerado pelo Detective. Nível de documentação: **detalhado**.
> Escala de confiança: 🟢 CONFIRMADO · 🟡 INFERIDO · 🔴 LACUNA

---

## 1. Máquina de Estados: `Orcamento` 🟢

O orçamento comercial representa uma proposta formal de venda emitida pelo vendedor ao cliente.

### Valores de Status (`OrcamentoStatus`)
- `rascunho`: Orçamento em edição pelo vendedor; itens, descontos e prazos podem ser modificados livremente.
- `enviado`: Proposta formalizada e enviada ao cliente via WhatsApp, E-mail ou impressa; bloqueada para edição direta.
- `aprovado`: Proposta aceita pelo cliente; gera envio do pedido ao ERP (criação do pedido de venda SC5/SC6 no Protheus).
- `recusado`: Proposta rejeitada pelo cliente com registro obrigatório de motivo de recusa.
- `expirado`: Atingiu a `dataValidade` sem decisão registrada; bloqueia aprovação sem revalidação de preços.

```mermaid
stateDiagram-v2
    [*] --> rascunho: Criado pelo vendedor
    rascunho --> rascunho: Edição de itens e condições
    rascunho --> enviado: Envio via WhatsApp / PDF / E-mail
    rascunho --> cancelado: Descarte manual
    
    enviado --> aprovado: Cliente aceita (envio ao ERP)
    enviado --> recusado: Cliente recusa (motivo obrigatório)
    enviado --> expirado: dataValidade ultrapassada
    enviado --> rascunho: Reabertura para negociação
    
    expirado --> rascunho: Atualizar validade/preços
    
    aprovado --> [*]: Pedido faturado no ERP
    recusado --> [*]
    cancelado --> [*]
```

---

## 2. Máquina de Estados: `Lead` e Funil de Vendas 🟢

O lead representa um contato prospectado antes da formalização do cadastro como cliente ativo.

```mermaid
stateDiagram-v2
    [*] --> novo: Captura (Manual, WhatsApp, Landing Page)
    novo --> em_qualificacao: Atribuição a pré-vendedor / vendedor
    em_qualificacao --> qualificado: Confirmação de perfil / CNPJ / interesse
    em_qualificacao --> desqualificado: Sem perfil / telefone inválido / sem interesse
    
    qualificado --> [*]: Converte em Cliente + Oportunidade
    desqualificado --> [*]: Arquivado para nutrição
```

---

## 3. Máquina de Estados: `Oportunidade` (CRM Pipeline) 🟢

Oportunidades mapeiam negociações de vendas em andamento com clientes da carteira.

```mermaid
stateDiagram-v2
    [*] --> aberta: Criada na carteira do vendedor
    aberta --> em_andamento: Primeiro contato / envio de catálogo
    em_andamento --> proposta_apresentada: Orçamento vinculado anexado
    proposta_apresentada --> ganha: Orçamento aprovado / venda faturada
    proposta_apresentada --> perdida: Motivo de perda registrado
    em_andamento --> perdida: Desistência do cliente
    
    ganha --> [*]
    perdida --> [*]
```

---

## 4. Máquina de Estados: `ClienteAlteracao` (Fila de Aprovação) 🟢

Gerencia propostas de atualização de dados cadastrais sensíveis de clientes.

```mermaid
stateDiagram-v2
    [*] --> pendente: Proposta gerada (Vendedor, IA, Receita Federal)
    pendente --> aprovada: Supervisor aprova (total ou campo a campo)
    pendente --> rejeitada: Supervisor recusa proposta
    
    aprovada --> disparada_erp: Gera registro em ClienteEnvioErp
    disparada_erp --> [*]
    rejeitada --> [*]
```

---

## 5. Máquina de Estados: `ClienteEnvioErp` (Sincronização ERP) 🟢

Fila transacional de despacho de atualizações de clientes para o ERP Protheus.

```mermaid
stateDiagram-v2
    [*] --> pendente: Alteração cadastral aprovada
    pendente --> processando: Job de sincronização consome lote
    processando --> sucesso: ERP responde HTTP 200 / ExecAuto OK
    processando --> erro: Falha de conexão / validação Protheus
    erro --> pendente: Reprocessamento manual ou automático
    sucesso --> [*]
```

---

## 6. Máquina de Estados: `IntegracaoCarga` (Carga Batch) 🟢

Representa o processamento assíncrono de cargas de dados massivas de produtos, estoque ou clientes.

```mermaid
stateDiagram-v2
    [*] --> pendente: Arquivo/payload recebido via API ou upload
    pendente --> processando: Worker assume execução
    processando --> concluido: 100% dos registros processados sem erro
    processando --> com_erros: Concluído com falhas parciais em registros
    processando --> erro: Falha fatal de estrutura / timeout
    com_erros --> reprocessando: Reprocessar apenas itens com falha
    reprocessando --> concluido
    reprocessando --> com_erros
    concluido --> [*]
```

---

## 7. Máquina de Estados: `TourExecucao` (Onboarding Guiado) 🟢

Registra a experiência do usuário nos tours visuais das rotinas do sistema.

```mermaid
stateDiagram-v2
    [*] --> em_andamento: Tour iniciado (automático na 1ª visita ou manual)
    em_andamento --> em_andamento: Avança/retrocede passoAtual
    em_andamento --> concluido: Usuário atinge o último passo
    em_andamento --> dispensado: Usuário fecha ou pressiona Esc
    
    concluido --> [*]
    dispensado --> [*]
```

---

## 8. Máquina de Estados: `Assinatura` / `Empresa` (Ciclo SaaS) 🟢

Governa o acesso e as limitações de uso da empresa na plataforma multi-tenant.

```mermaid
stateDiagram-v2
    [*] --> teste: Criação de nova empresa (trial 14/30 dias)
    teste --> ativa: Contrato formalizado / pagamento registrado
    teste --> bloqueada: Prazo de teste expirado sem conversão
    
    ativa --> inadimplente: Fatura em atraso
    inadimplente --> ativa: Pagamento regularizado
    inadimplente --> bloqueada: Atraso superior a 15 dias (acesso suspenso)
    
    bloqueada --> ativa: Desbloqueio pelo Admin da Plataforma
    bloqueada --> cancelada: Encerramento de contrato
    cancelada --> [*]
```

