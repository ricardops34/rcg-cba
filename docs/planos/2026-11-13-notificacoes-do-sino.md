# Notificações do sino escolhidas pelo usuário

Pedido de 2026-11-13: em "Meu perfil", o usuário escolhe que notificações
aparecem no sino — uma lista com uma caixa de seleção para cada tipo.

## Decisões

- **Onde:** aba nova **Notificações** em Meu perfil (`/perfil#notificacoes`),
  com os tipos agrupados por assunto (WhatsApp, Agenda e roteiro, Orçamentos,
  Clientes, Equipe e supervisão, Processos em lote). Marcado = recebe.
- **O que se guarda:** `usuarios.notificacoesSilenciadas` — a lista do que foi
  **desligado**. Tipo novo do enum nasce ligado para todo mundo.
- **Vale para o usuário, não para a empresa:** como o tamanho das listagens,
  a escolha vale em todas as empresas do grupo.
- **Regra em código, não na tela:** `registrarNotificacao` não grava o tipo
  silenciado (`NOT EXISTS` no próprio `INSERT`). Por isso some do sino **e**
  do push do celular, que lê da mesma tabela. Os três lugares que gravavam
  direto na tabela (recado interno, Sugestão de Compra, Receita em lote)
  passaram a usar `registrarNotificacao`.
- **Ao desligar:** o que já estava pendente daquele tipo é marcado como lido,
  em todas as empresas do usuário — o sino fica limpo na hora.
- **Salvar no rodapé** do cartão (com Desfazer), e não "vale na hora": quem
  desliga vários tipos não quer um aviso por clique.
- Nenhum tipo é obrigatório por ora. Desligar "Desconto aguardando sua
  liberação" não tira a tarefa da Agenda — só o aviso do sino.

## Onde está

- Contrato: `NOTIFICACAO_TIPO_INFO`, `NOTIFICACAO_GRUPOS` e
  `updateNotificacoesSilenciadasSchema` em `packages/contracts/src/notificacao.ts`.
- API: `PATCH /auth/me/notificacoes` (`AuthService.updateNotificacoesSilenciadas`).
- Migration: `20261113130000_notificacoes_silenciadas`.
- Tela: `apps/web/src/components/perfil/notificacoes-sino-card.tsx`.

## Situação

- [x] Implementado, typecheck da API e do web limpos, testes passando.
- [x] Migration aplicada na base de dev; `INSERT` com tipo silenciado testado
      no Postgres (não grava o silenciado, grava o outro).
- [ ] Conferência visual da aba (o container da API/web não estava no ar).
- [ ] Publicar.
