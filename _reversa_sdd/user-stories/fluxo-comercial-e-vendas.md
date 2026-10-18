# Histórias de Usuário — Ciclo Comercial e Operacional

> Documentação formal de casos de uso e histórias de usuário (User Stories) da plataforma comercial multi-tenant \`rcgcba\`.
> Baseado no fluxo operacional de ponta a ponta e na rastreabilidade com as unidades de especificação (SDD).

---

## Épico 1: Acesso, Identidade e Governança Multi-Tenant

### US-01: Autenticação Segura com Sessão Única Simultânea
- **Como** Usuário do sistema (Vendedor, Gestor ou Administrador),
- **Quero** Me autenticar com e-mail e senha recebendo par de tokens JWT (Access Token de 15m e Refresh Token de 7d),
- **Para que** Eu acesse a plataforma com minha identidade corporativa garantindo que nenhuma outra sessão simultânea permaneça ativa com minha conta.
- **Regras de Negócio:** `RN-AUTH-01`, `RN-AUTH-02`, `RN-AUTH-03`, `RN-AUTH-06`.
- **Critérios de Aceitação:**
  ```gherkin
  Dado que o usuário "vendedor@rcg.com.br" possui uma sessão ativa no computador do escritório
  Quando ele realiza um novo login pelo celular
  Então o sistema autentica o novo dispositivo com status 200
  E a sessão anterior no computador é desconectada imediatamente com motivo MOTIVO_NOVO_ACESSO
  E qualquer tentativa de refresh da sessão antiga é rejeitada com SessaoEncerradaException
  ```
- **MoSCoW:** Must | **Units:** `auth`, `acessos`, `politica-senha`

### US-02: Alternância Dinâmica de Empresa Ativa em Grupos Econômicos
- **Como** Usuário vinculado a múltiplas filiais de um grupo econômico,
- **Quero** Alternar a empresa ativa sem precisar deslogar ou reiniciar minha sessão,
- **Para que** Eu possa operar dados da filial correspondente mantendo o tempo de uso contínuo e a auditoria preservada.
- **Regras de Negócio:** `RN-AUTH-04`, `RN-AUTH-05`.
- **Critérios de Aceitação:**
  ```gherkin
  Dado que o usuário está logado na empresa "Filial SP"
  Quando ele seleciona a opção de alternar para "Filial RJ" onde possui vínculo ativo
  Então o sistema reemite o access token com empresaId da "Filial RJ" e permissões correspondentes
  E o mesmo identificador de sessão (sessaoId) é preservado
  ```
- **MoSCoW:** Must | **Units:** `auth`, `empresas`, `grupos-economicos`

---

## Épico 2: Gestão de Carteira, Titularidade e Posição 360°

### US-03: Visualização Restrita de Carteira Hierárquica
- **Como** Vendedor externo,
- **Quero** Visualizar na listagem de clientes exclusivamente os clientes vinculados à minha carteira,
- **Para que** Não haja interferência na base de clientes de outros representantes da equipe.
- **Regras de Negócio:** `RN-CLI-01`.
- **Critérios de Aceitação:**
  ```gherkin
  Dado que o vendedor "Carlos" tenta acessar diretamente a URL de um cliente da vendedora "Ana"
  Quando a requisição GET /clientes/:id é processada
  Então o sistema responde com status 404 Not Found
  E a existência do cliente não é confirmada ao usuário
  ```
- **MoSCoW:** Must | **Units:** `clientes`, `vendedores`, `escopo`

### US-04: Consulta de Titularidade sem Vazamento de Dados
- **Como** Representante de vendas em prospecção,
- **Quero** Consultar se um determinado CNPJ/CPF já é cliente cadastrado na empresa,
- **Para que** Eu não prospecte clientes que já possuam titularidade atribuída a outro vendedor, sem que dados confidenciais sejam revelados.
- **Regras de Negócio:** `RN-CLI-02`.
- **Critérios de Aceitação:**
  ```gherkin
  Dado que um vendedor consulta o CNPJ de uma empresa pertencente à carteira de outro colega
  Quando o endpoint de titularidade é executado
  Então o sistema informa que o cliente já existe e exibe o nome do vendedor responsável
  E suprime estritamente o clienteId, contatos, dados de faturamento e limites de crédito
  ```
- **MoSCoW:** Must | **Units:** `clientes`

### US-05: Posição de Cliente 360° em Tempo Real
- **Como** Vendedor ou Gestor comercial,
- **Quero** Acessar a tela de Posição de Cliente consolidando notas de venda, títulos em aberto, mix de produtos e equipamentos em comodato,
- **Para que** Eu tenha diagnóstico completo da saúde comercial e financeira antes de negociar uma proposta.
- **Regras de Negócio:** `RN-CLI-09`, `RN-CLI-10`.
- **Critérios de Aceitação:**
  ```gherkin
  Dado que o cliente possui compras faturadas, duplicatas vencidas e comodatos
  Quando a Posição de Cliente é carregada
  Então o sistema apresenta notas de venda ativas (excluindo canceladas e comodatos)
  E exibe o alerta de "comodato sem consumo" caso ele não tenha adquirido consumíveis aplicáveis há mais de 30 dias
  E calcula o atraso de títulos considerando os dias úteis corporativos
  ```
- **MoSCoW:** Must | **Units:** `clientes`, `notas-saida`, `titulos-receber`, `equipamentos-comodato`

---

## Épico 3: Governança Cadastral e Fila de Aprovação

### US-06: Solicitação de Alteração Cadastral Campo a Campo
- **Como** Vendedor responsável pela carteira,
- **Quero** Propor alterações cadastrais para meus clientes (endereço, telefone, limite de crédito),
- **Para que** Os dados sejam atualizados sem que mudanças críticas entrem em produção sem a chancela do supervisor.
- **Regras de Negócio:** `RN-CLI-03`, `RN-CLI-05`.
- **Critérios de Aceitação:**
  ```gherkin
  Dado que o vendedor altera o limite de crédito do cliente
  Quando ele salva o formulário sem possuir a permissão "clientes.aprovar"
  Então uma solicitação é criada na fila com status "pendente" e diff calculado
  E o cadastro oficial permanece com o limite anterior até a decisão do gestor
  ```
- **MoSCoW:** Must | **Units:** `clientes`, `cliente-campo-config`

### US-07: Aprovação Granular com Proteção contra Concorrência
- **Como** Supervisor Comercial ou Administrador,
- **Quero** Revisar a fila de alterações de clientes e aprovar apenas os campos válidos,
- **Para que** Propostas inconsistentes sejam rejeitadas individualmente e conflitos concorrentes sejam bloqueados.
- **Regras de Negócio:** `RN-CLI-04`.
- **Critérios de Aceitação:**
  ```gherkin
  Dado que uma proposta de alteração está pendente para o cliente "X"
  E outro usuário alterou o cadastro concorrentemente antes da revisão do supervisor
  Quando o supervisor tenta aprovar a solicitação
  Então o sistema rejeita a transação com status 409 Conflict
  E impede que dados divergentes sobrescrevam o cadastro atual
  ```
- **MoSCoW:** Must | **Units:** `clientes`, `integracao`

---

## Épico 4: Catálogo de Produtos e Busca Semântica

### US-08: Localização Rápida de Produtos por Similaridade e Aplicação
- **Como** Representante comercial durante atendimento ao cliente,
- **Quero** Buscar produtos tanto por filtros tradicionais (código/descrição) quanto por busca semântica em fichas técnicas,
- **Para que** Eu encontre rapidamente o item substituto ideal ou o equipamento adequado à necessidade do cliente.
- **Regras de Negócio:** `RN-PROD-01`, `ADR-004`.
- **Critérios de Aceitação:**
  ```gherkin
  Dado que o vendedor busca por "óleo lubrificante resistente a alta pressão"
  Quando a pesquisa semântica vetorial é executada
  Então o sistema retorna produtos com embeddings similares mesmo sem correspondência literal de texto
  E exibe o preço vigente na tabela do cliente consultado
  ```
- **MoSCoW:** Should | **Units:** `produtos`, `produto-campos`

---

## Épico 5: Orçamentos Comerciais e Política de Descontos

### US-09: Emissão de Proposta Comercial com Preço da Tabela do Cliente
- **Como** Vendedor externo,
- **Quero** Montar orçamentos selecionando produtos com cálculo automático de preços, descontos e comissões,
- **Para que** A proposta reflita rigorosamente a tabela de preços acordada e a margem comercial permitida.
- **Regras de Negócio:** `RN-ORCA-01`, `RN-ORCA-02`, `RN-ORCA-06`.
- **Critérios de Aceitação:**
  ```gherkin
  Dado que o vendedor insere itens em um novo orçamento
  Quando o cálculo é processado no servidor
  Então o preço base é obtido da tabela de preço vinculada ao cliente
  E o número sequencial do orçamento é reservado atomicamente sem gaps
  ```
- **MoSCoW:** Must | **Units:** `orcamentos`, `orcamento-config`, `clientes`

### US-10: Alçada de Desconto e Autorização em Duas Etapas
- **Como** Supervisor Comercial,
- **Quero** Ser notificado quando um orçamento ultrapassar a margem máxima de desconto do vendedor,
- **Para que** Eu possa analisar a rentabilidade da venda e autorizar ou recusar a concessão especial.
- **Regras de Negócio:** `RN-ORCA-03`, `RN-ORCA-04`.
- **Critérios de Aceitação:**
  ```gherkin
  Dado que um orçamento com desconto acima da alçada foi gravado como pendente de autorização
  Quando o supervisor aprova a concessão de desconto
  Então o status é atualizado para "autorizado"
  E se o vendedor alterar os itens posteriormente, a autorização anterior é cancelada automaticamente
  ```
- **MoSCoW:** Must | **Units:** `orcamentos`, `notificacoes`

---

## Épico 6: Integração ERP, Faturamento e Documentos sob Demanda

### US-11: Envio Automático de Orçamentos Aprovados para o Protheus
- **Como** Administrador do sistema,
- **Quero** Que orçamentos aprovados pelo cliente sejam enfileirados para geração de Pedido de Venda no ERP,
- **Para que** O setor de expedição e faturamento processe a entrega sem redigitação de pedidos.
- **Regras de Negócio:** `RN-INTEG-01`, `ADR-005`.
- **Critérios de Aceitação:**
  ```gherkin
  Dado que um orçamento atinge o status "aprovado"
  Quando a rotina de sincronização executa
  Então o pedido é gerado na tabela SC5/SC6 do ERP com o código do orçamento
  E o status de integração é registrado com rastreabilidade total
  ```
- **MoSCoW:** Must | **Units:** `orcamentos`, `integracao`, `integracao-keys`

### US-12: Emissão de DANFE e Boletos sob Demanda
- **Como** Cliente no Portal ou Vendedor em campo,
- **Quero** Clicar em uma nota ou duplicata para visualizar o DANFE ou Boleto Bancário gerado na hora,
- **Para que** Não seja necessário armazenar milhares de PDFs estáticos no servidor e a via emitida contenha sempre os dados atualizados.
- **Regras de Negócio:** `RN-NTS-01`, `RN-TIT-01`, `ADR-005`.
- **Critérios de Aceitação:**
  ```gherkin
  Dado que existe uma nota de saída com XML autorizado ou um título com remessa bancária
  Quando o usuário solicita a impressão do documento
  Então o backend monta o PDF dinamicamente com layout oficial e código de barras
  E entrega o stream do arquivo em menos de 1 segundo sem persistir arquivo no disco
  ```
- **MoSCoW:** Must | **Units:** `notas-saida`, `titulos-receber`

---

## Épico 7: Gestão Patrimonial de Equipamentos em Comodato

### US-13: Alerta Proativo de Comodato sem Consumo
- **Como** Gerente Comercial,
- **Quero** Identificar quais clientes possuem equipamentos em comodato sem realizar compras de consumíveis há mais de 30 dias,
- **Para que** A equipe de vendas tome ação de recompra ou solicite o recolhimento do equipamento ocioso.
- **Regras de Negócio:** `RN-CLI-10`, `RN-COMO-01`.
- **Critérios de Aceitação:**
  ```gherkin
  Dado que um cliente possui uma máquina de café em comodato
  E nenhuma compra de pó ou café em grãos ocorreu nos últimos 30 dias
  Quando a listagem de comodatos ou Posição de Cliente é gerada
  Então o badge "Comodato sem consumo" é destacado em vermelho
  ```
- **MoSCoW:** Should | **Units:** `clientes`, `equipamentos-comodato`

### US-14: Baixa Total de Saldo de Comodato com Histórico
- **Como** Vendedor ou Supervisor,
- **Quero** Efetuar a baixa do saldo de um equipamento devolvido ou recolhido do cliente,
- **Para que** O saldo patrimonial seja zerado e uma atividade seja automaticamente inserida no histórico de atendimento.
- **Regras de Negócio:** `RN-CLI-11`.
- **Critérios de Aceitação:**
  ```gherkin
  Dado que um equipamento é baixado na Posição de Cliente
  Quando a baixa é confirmada com justificativa
  Então o saldo em poder do cliente é zerado
  E uma Atividade concluída é registrada no histórico do vendedor titular
  ```
- **MoSCoW:** Should | **Units:** `clientes`, `atividades`

---

## Épico 8: Atendimento Omnichannel e WhatsApp

### US-15: Atendimento Integrado ao Histórico do Cliente
- **Como** Atendente comercial,
- **Quero** Interagir com o cliente via WhatsApp diretamente pela interface da plataforma,
- **Para que** O histórico de mensagens fique vinculado ao cadastro do cliente e à linha do tempo de vendas.
- **Regras de Negócio:** `RN-WHTS-01`.
- **Critérios de Aceitação:**
  ```gherkin
  Dado que uma mensagem é recebida no webhook da Meta WhatsApp Cloud API
  Quando o sistema faz a triagem pelo número do contato
  Então a conversa é vinculada ao cliente cadastrado
  E a notificação aparece no painel de atendimento do vendedor
  ```
- **MoSCoW:** Should | **Units:** `whatsapp`, `meus-atendimentos`, `notificacoes`

