# Acompanhamento da equipe (Supervisor, Gerente, Diretor)

Pedido do usuário em 27/10/2026, a partir da pergunta "que estatísticas
coletamos no WhatsApp? sabemos de onde o orçamento nasceu? temos o tempo entre
envio e aprovação?". A resposta era: pouco. Este plano fecha a coleta e dá aos
três perfis uma tela para acompanhar.

## Decisões

- **Rastro do orçamento (etapa 1).** O orçamento passa a guardar
  `canalOrigem` (`whatsapp` quando nasce na conversa), `conversaId`,
  `enviadoEm` e `canalEnvio` (`whatsapp` ou `link`). O envio é marcado no funil
  `registrarAtividadeOrcamento` (eventos `envio_whatsapp` e `link_gerado`), por
  onde os dois caminhos já passam. **Enviar a proposta pelo WhatsApp passa o
  orçamento de rascunho para enviado** — antes só o link fazia isso, e o
  "finalizado × não finalizado" ficaria errado.
- **Tempo envio → decisão** = `clienteDecididoEm − enviadoEm`. Decisão tomada
  pelo próprio vendedor na tela (`clienteDecisaoCanal = 'sistema'`) é mostrada
  à parte: mede o registro, não o cliente.
- **Backfill**: `enviadoEm` dos orçamentos antigos vem do primeiro evento de
  envio/link no histórico (atividades). Origem **não** é reconstruída: não há
  como saber onde o orçamento nasceu.
- **Tela única** em Gerencial > Acompanhamento da equipe, com uma aba por
  assunto e uma linha por vendedor, respeitando o escopo da hierarquia
  (Supervisor vê o time, Gerente e Diretor a carteira que o perfil alcança).
  Rotina `acompanhamento-equipe` (visualizar), concedida a Supervisor, Gerente
  e Diretor, além dos administradores.

## Abas

1. **Atendimento WhatsApp** — conversas, mensagens enviadas, tempo até a
   primeira resposta (média e % em até 15 min), conversas sem resposta.
2. **Não vinculados** — conversas e mensagens com contatos sem cliente
   vinculado, por número/vendedor.
3. **Cobertura de carteira** — clientes ativos, com compra, com contato
   (atendimento, visita) no período, e os sem contato há mais de N dias.
4. **Atualização cadastral** — clientes com e-mail, telefone, contato e
   consulta à Receita recentes; atualizados à mão.
5. **Mix** — produtos distintos por cliente no período × período anterior.
6. **Descontos** — desconto médio praticado nos orçamentos, pedidos de
   liberação, autorizados e recusados.
7. **Orçamentos** — por status (finalizados × não finalizados), conversão,
   tempo envio → decisão, e os nascidos no WhatsApp.
8. **Comodato** — clientes com comodato em poder e **sem compra** no período,
   e clientes com comodato **sem compra dos produtos aplicáveis** a ele (mesma
   regra e janela de 30 dias de `clientes/comodato-sql.ts`).

## Situação (27/10/2026) **[verificado em dev: consultas rodam contra a base; conferência visual da tela pendente]**

- Etapa 1 (rastro do orçamento): feita, commit cd9ecf56. Migration
  `20261027130000_orcamento_origem_envio`.
- Etapa 2 (API): `/acompanhamento/{atendimento,nao-vinculados,carteira,cadastro,mix,descontos,orcamentos,comodato}`.
  As oito consultas foram executadas contra a base de dev (cópia da produção
  de 30/09, por isso muitos números ficam zerados ou extremos).
- Etapa 3 (tela): Gerencial > Acompanhamento da Equipe
  (`/gerencial/acompanhamento`). Migration `20261027140000_acompanhamento_equipe`
  cria menu e rotina e concede `visualizar` a Supervisor, Gerente e Diretor.
- Decisões de leitura: "à mão" no cadastro = `updatedBy` que não é da
  integração (`integracao:...`); a primeira resposta só conta mensagem de
  pessoa (`enviadaPor`); orçamento do ERP fica fora da aba Orçamentos.
- Pendente: conferir a tela; tempo médio de primeira resposta usa média (uma
  conversa respondida semanas depois puxa o número — avaliar mediana);
  exportar PDF/Excel; origem do orçamento criado fora do WhatsApp continua
  desconhecida.
