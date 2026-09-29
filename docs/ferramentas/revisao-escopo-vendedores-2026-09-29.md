# Escopo dos vendedores nas ferramentas do agente

Revisão do agente interno em 29/09/2026. As permissões de rotina e a configuração de ferramentas da empresa continuam sendo requisitos; o cargo não libera uma ferramenta desativada.

## Consultas comerciais

| Ferramentas | Regra conferida |
|---|---|
| buscar_cliente, posicao_cliente, sugerir_compras | Carteira autorizada pelo serviço de clientes/sugestão; empresa ativa e hierarquia |
| titulos_em_aberto, listar_orcamentos | filtroCarteira mais escopo do serviço de títulos/orçamentos |
| vendas_por_cliente, vendas_por_produto | filtroCarteiraConsulta mais escopo do serviço de consultas |
| execucao_objetivos | Agregado da carteira/equipe/empresa autorizada |
| execucao_objetivos_vendedores | Linhas por vendedor do Dashboard Gerencial, exigindo dashboard-gerencial.visualizar |
| minha_agenda, listar_oportunidades | filtroCarteira mais escopo dos serviços de atividades/oportunidades |
| historico_atendimento_cliente | CRM da carteira/equipe autorizada; WhatsApp somente da própria conexão |

`AgenteToolsService.filtroCarteira` retorna filtro explícito somente para vendedor puro. Para Admin, superior (gerente/supervisor) e usuário sem cadastro de vendedor, o serviço de destino resolve o escopo. Retornar objeto vazio não equivale a remover a RLS ou a hierarquia: os serviços recebem a empresa ativa e o usuário autenticado. O comportamento para usuário sem cadastro de vendedor é o mesmo já aplicado nas telas.

## Exceções que não devem ser confundidas com recusa de acesso à equipe

- `resumo_atendimentos`: padrão pessoal; aceita `escopo: equipe`, e MeusAtendimentosService decide quem pode ser incluído. A ferramenta já instrui o agente a usar essa opção em pedidos sobre a equipe.
- `meu_dia`: a agenda usa o escopo autorizado; a meta da saudação é pessoal, quando existe vendedor associado ao usuário, para não apresentar a meta da empresa como se fosse dele. Para comparar equipe, usar `execucao_objetivos_vendedores`.
- `conversas_whatsapp`, `mensagens_whatsapp`, agendamento/envio por WhatsApp e a parte WhatsApp do histórico: própria conexão. A regra documentada de privacidade diferencia monitorar conversas na tela de enviá-las ao provedor de IA. Não foi ampliada nesta revisão.
- `verificar_cliente_na_base` e a identificação cadastral em `consultar_cnpj`: podem indicar existência do cliente e vendedor responsável fora da carteira, sem liberar dados financeiros/histórico. Exceção cadastral já documentada.

## Escrita

Agendar atividade e registrar oportunidade atribuem o registro ao vendedor do usuário; isso define o responsável, não o escopo de consulta. O cliente é conferido pelo serviço antes da gravação. Mover oportunidade e criar orçamento mantêm verificações de carteira/hierarquia nos serviços. Não foi adicionada atribuição arbitrária a outro vendedor pelo modelo.

## Resultado e validação

Não foi encontrada nas demais consultas comerciais uma restrição geral de equipe semelhante à instrução antiga da ferramenta de metas. Foram corrigidos comentários antigos sobre histórico e vendas por cliente. Acrescentados testes para Admin, superior, vendedor e ausência de cadastro, cobrindo os dois formatos do filtro compartilhado. Esses testes verificam a delegação do escopo; não substituem teste integrado de hierarquia/RLS em banco.
