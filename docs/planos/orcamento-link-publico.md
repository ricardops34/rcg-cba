# Orçamento: link público para o cliente aprovar ou recusar

Status: proposta (2026-10-18), aguardando decisões do usuário.

## Objetivo
O vendedor gera um link do orçamento, envia ao cliente por e-mail ou WhatsApp, e o cliente
aprova ou recusa sem login (recusa exige justificativa). A plataforma grava **por qual
canal** a aprovação ocorreu: link ou sistema.

## O que já existe
- `Orcamento.clienteDecididoEm / clienteDecididoPorContatoId / clienteDecisao /
  clienteDecisaoObservacao` e `PortalClienteService.decidirOrcamento` (decisão pelo portal
  com login): só aceita status `enviado`, trata vencido, grava Atividade.
- Aprovação interna: `OrcamentosService.update` com `status: aprovado`, passando pela trava
  de desconto (`orcamentoExigeAutorizacao`) e `registrarAtividadeOrcamento`.
- `orcamento-pdf.ts` (proposta em PDF), `MailService`, envio de orçamento pelo WhatsApp.
- Não existe nenhuma rota pública (sem JWT) hoje.

## Desenho
1. **Token**: tabela `orcamento_links` (empresaId com RLS + policy na mesma migration):
   `orcamentoId`, `tokenHash` (SHA-256; o token em claro só aparece uma vez), `expiraEm`
   (padrão = `dataValidade` do orçamento), `revogadoEm`, `criadoPor`, `usadoEm`.
   Token aleatório de 32 bytes (url-safe), nunca derivado do id.
2. **API pública** (`/publico/orcamentos/:token`, throttle forte, sem JWT, fora do
   `JwtAuthGuard`): GET devolve só o necessário (itens, totais, condição, validade, vendedor);
   POST `/aprovar` e POST `/recusar` (justificativa obrigatória). Reaproveita a regra de
   `decidirOrcamento` (extraída para um método comum).
3. **Origem da decisão**: novo campo `clienteDecisaoCanal` (`link` | `portal` | `sistema`),
   mais IP e user-agent em `clienteDecisaoIp/Agente` para o link. Aprovação feita pelo
   vendedor na tela grava `sistema` e quem aprovou (hoje o `update` não preenche
   `clienteDecidido*`).
4. **Trava de desconto**: se o orçamento exige autorização de desconto e ela não foi dada, o
   link não deixa aprovar (mostra "em análise"), igual à regra interna.
5. **Tela do vendedor**: botão "Gerar link" no menu do orçamento (copiar, enviar por e-mail,
   enviar por WhatsApp, revogar). Listagem/detalhe mostra "Aprovado pelo cliente via link em
   dd/mm hh:mm" ou "Aprovado no sistema por Fulano".
6. **Página do cliente** (`apps/web/src/app/o/[token]`), mobile first, sem menu.
7. **Segurança**: acesso é código — link expirado/revogado/orçamento fora de `enviado` não
   decide; decisão é única (idempotente); orçamento editado depois do envio derruba o link
   (ou exige reenvio) para o cliente não aprovar valores que mudaram.


## Decisões do usuário (2026-10-18)
- O link é só um endereço: quem envia (e-mail, WhatsApp da plataforma ou externo) é o
  vendedor, por fora. Não há botão de envio por canal; a tela só gera e copia o link.
- A página do link mostra o orçamento com detalhes e dois botões: aprovar e reprovar
  (justificativa obrigatória na reprovação).
- **Uma única resposta** por link, aceita **durante a validade do orçamento**. Depois de
  respondido ou vencido, o link só mostra o resultado.
- Validade do link = `dataValidade` do orçamento (sem prazo próprio).

## Decisões pendentes
- Orçamento alterado depois de gerado o link: invalidar o link ou mostrar a versão atual?
- Gerar o link muda o status de `rascunho` para `enviado` automaticamente?
- Aprovação pelo link efetiva direto (entra na fila do ERP) ou fica "aguardando conferência"
  do vendedor?

## Regra: orçamento com pendência não gera link (2026-10-18)
Pendência = desconto igual ou acima do máximo da regra sem autorização
(`orcamentoExigeAutorizacao` e `descontoAutorizadoEm` nulo). Nesse caso:
- gerar o link é recusado (409) com o motivo, e o botão fica desabilitado na tela;
- a mesma checagem roda na aprovação pelo link (defesa em código), caso o orçamento mude
  depois de gerado;
- editar itens/preços derruba a autorização (regra que já existe) e, com ela, o link.
Outras pendências a confirmar com o usuário (ex.: sem itens, cliente sem contato, vencido).

## Entregue em 2026-10-19 (decisões assumidas: invalidar ao alterar, gerar marca enviado, aprovar efetiva direto)
- Migration `20261019100000_orcamento_link_publico` (tabela com RLS; colunas `clienteDecisaoCanal/Ip/Agente` e
  `decididoPorUsuarioId`). Aplicada em dev.
- API: `POST/GET/DELETE /orcamentos/:id/link` (vendedor) e `/publico/orcamentos/:token` (ver, aprovar,
  recusar — sem login, com limite por IP). Token = `<empresaId>.<32 bytes>`; o vendedor re-copia o mesmo.
- Canal gravado: `link` (IP e agente), `portal`, `sistema` (+ quem, em `decididoPorUsuarioId`).
- Editar o orçamento revoga o link. Pendência de desconto bloqueia gerar e aprovar.
- Web: página `/o/[token]`, item "Link para o cliente" no menu da listagem, "Resposta do cliente" no
  detalhe do orçamento.
- Verificado em dev com curl (aprovar uma vez, recusa sem justificativa, 2ª resposta 409) e 12 testes
  unitários. **Falta:** conferência visual da página no celular e testar "Gerar link" logado na tela;
  produção (migration + restart duplo).
