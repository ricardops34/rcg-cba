# Ordem dos eventos da mesma chave (ERP → plataforma)

Status: **feito no fonte, falta compilar e publicar no Protheus** (2026-09-30).
Aprovado pelo usuário em 2026-09-30; aplicado em `BJMAPNFS`, `BJMAPNFE`,
`BJMAPTIT` e `BJMAPPED` (`docs/integracao/advpl/BJPLA003.prw`).

A geração do JSON por SQL (`docs/integracao/sql/01-instalar.sql`) não mudou:
ela é só a carga inicial, lê apenas linhas ativas (`D_E_L_E_T_ = ' '`) no
cabeçalho e nos itens e não gera exclusão. Uma chave com versão excluída e
versão ativa sai com a ativa; exclusões posteriores ficam com o job.

## Pedido do usuário (2026-09-30)

Quando chegam dois eventos para a **mesma chave** — a exclusão de uma versão e
a inclusão de outra, como numa nota excluída e reemitida com o mesmo número —,
a plataforma tem de terminar no estado atual do ERP. A sugestão inicial foi
ordenar pela S_T_A_M_P_.

## Caso que levantou o pedido

Nota 000117238 (E-COMMERCE, 09/2026): emitida em 09/09, excluída e reemitida
em 15/09 com o mesmo número. O sistema anterior ficou com a exclusão e perdeu
a venda (R$ 235,44). As duas versões são do **mesmo cliente e loja** (a
consulta no ERP liga SF2 e SD2 por cliente e loja e trouxe os dois
cabeçalhos), logo da **mesma chave** (`filial-doc-série-cliente-loja-
formulário-tipo`, o X2_UNICO da SF2). Na plataforma o resultado ficou certo
— a chave está ativa com a versão de 15/09 —, mas só porque a exclusão saiu
antes da reemissão.

## O que já protege a ordem hoje

1. **Coleta por R_E_C_N_O_** (`BJMAPNFS` e demais). Com a mesma chave, o
   Protheus só inclui uma geração nova depois de excluir a anterior; logo a
   geração mais nova tem sempre o R_E_C_N_O_ maior e sai por último. Numa
   coleta que pega as duas, o DELETE da velha sai antes do POST da nova.
2. **Mensagem superada no envio** (`BJSuperada`, `BJPLA004`): mensagem de
   uma chave que já tem outra em lote mais novo não é enviada. Cobre o lote
   com erro reenviado depois de um mais novo.
3. **Itens repetidos na mesma nota** (`consolidarFilhos`, API): se o JOIN
   trouxer o item excluído e o ativo com a mesma chave, o ativo prevalece.

## Por que a S_T_A_M_P_ não é a ordem certa aqui

Para gerações da mesma chave, ordenar pela S_T_A_M_P_ dá o mesmo resultado
que pelo R_E_C_N_O_ no caso normal — e **erra** no caso raro em que a linha
excluída é regravada depois (a S_T_A_M_P_ dela avança): a exclusão velha
passaria a sair **depois** da inclusão nova e apagaria a nota válida.

## Brecha que sobra

Uma linha excluída de geração antiga que volta a aparecer numa coleta
**sozinha** (sua S_T_A_M_P_ mudou depois que a geração nova já foi enviada)
vira um DELETE da chave — e apaga a versão válida. Nenhuma ordenação resolve,
porque a versão nova não está naquela coleta.

## Proposta

No mapeador dos documentos (`BJMAPNFS`, `BJMAPNFE`, `BJMAPTIT`, `BJMAPPED`):
**não gerar DELETE para uma linha excluída quando existe linha ativa com a
mesma chave** (`NOT EXISTS` na própria tabela). O estado da chave passa a ser
sempre o da linha ativa, independentemente da ordem de chegada.

A proposta anterior (gravar a S_T_A_M_P_ na plataforma e ignorar evento mais
antigo) fica descartada: o `BJSuperada` já cobre o reenvio, e a S_T_A_M_P_
não ordena corretamente as gerações da mesma chave.
