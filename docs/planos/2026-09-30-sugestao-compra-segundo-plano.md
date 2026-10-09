# Sugestão de Compra: "Calcular" em segundo plano

## Decisão (30/09/2026)

O usuário pediu que o **Calcular** de `/consultas/sugestao-compra` (desde
2026-10-09 `/gerencial/sugestao-compra`, no módulo Gerencial — decisão do
usuário; o caminho antigo redireciona) rode em
segundo plano. O lote recalcula cliente a cliente sobre a base inteira e
prendia a requisição por até 15 minutos, com a tela esperando.

O **Calcular por linha** (um cliente) é rápido e continua respondendo com o
resultado na hora.

## Como ficou

O projeto não tem fila de jobs (nem Bull, nem worker de tarefas), então o
cálculo roda dentro da própria API, sem prender a requisição:

- `POST /sugestao-compra/gerar` grava uma execução em
  `sugestao_compra_execucoes` e responde **202** com ela. O cálculo
  (`gerarLote`, o mesmo de antes) corre depois (`executarLote`) e grava o
  resultado ou o erro.
- **Uma execução em andamento por empresa.** Quem garante é o índice parcial
  único da migration `20260930190000_sugestao_compra_execucoes`; um segundo
  pedido recebe 409.
- Uma execução que ficou "rodando" além do tempo máximo do lote (15 min, mais
  5 de folga) é dada como **falha** no próximo pedido, porque a API reiniciou no
  meio. Sem isso, a empresa ficaria travada.
- `GET /sugestao-compra/execucoes/ultima` alimenta a tela: uma faixa
  "Calculando…", o botão travado e atualização a cada 5 s enquanto roda; a
  lista recarrega ao terminar.
- Quem pediu recebe um aviso no **sino** (tipo `sugestao_compra_calculada`),
  com sucesso ou falha.
- A tabela tem RLS por empresa na mesma migration.

**Limite conhecido:** se a API reiniciar durante o cálculo, ele não é retomado.
A execução fica como falha (na verificação acima) e é preciso pedir de novo.

## Testado em 30/09/2026 (base de dev = cópia da produção)

Com a faixa de um cliente só (00035001, BOM ALMOÇO):

- o POST respondeu 202 em 0,06 s;
- um segundo pedido junto recebeu 409;
- a execução terminou como concluída (1 cliente, 10 sugestões);
- o aviso chegou no sino.
