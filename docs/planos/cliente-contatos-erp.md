# Contatos do cliente vindos do ERP (A1_CT*01 a 04)

Decisões do usuário (2026-10-19): importar os 4 contatos do SA1; e-mail opcional; tipo vira campo; os
campos entram no controle de campos editáveis e a edição segue a fila de Alterações (volta ao ERP); o
vínculo do WhatsApp é com um destes — com os quatro vazios, o vínculo preenche o primeiro; aba "Contatos".

## Modelo
- 20 colunas planas em `clientes`: `contato{1-4}{Tipo,Nome,Telefone,Whatsapp,Email}` (= A1_CTTIP/NOM/NUM/WAT/EML).
  Tipo: cliente | comprador | financeiro | geral (ERP 1-4). Planas para entrarem sozinhas no controle de
  campos editáveis, na fila de alterações, no histórico e no contrato da integração.
- `cliente_contatos` ganhou `tipo`, `whatsapp`, `origem` (plataforma|erp), `posicaoErp`; `email` ficou opcional.
  `sincronizarContatosErp` espelha cada posição em um registro `origem=erp` (integração, alteração aplicada,
  cadastro). Posição esvaziada: apaga o registro, ou só inativa se tem portal/WhatsApp/decisão de orçamento.
  Contato digitado na plataforma nunca é apagado por esta sincronização.
- Integração: campos no contrato de clientes; `CAMPOS_ENVIO_ERP` leva os 20 de volta; BJPLA003 sobe (com
  FieldPos) e BJPLA004 volta (tipo 1-4, WhatsApp 1/2).
- Vínculo do WhatsApp: `ClientesService.contatoErpDoVinculo`. Só contato `origem=erp` serve; sem número, o
  número atendido entra nele (pela fila, aplicada direto). Quatro vazios: preenche o contato 1 com nome e
  número da conversa. Alguns preenchidos e nenhum escolhido: fica sem pessoa. As telas não oferecem mais
  "cadastrar novo contato" no vínculo.
- Tela: aba "Contatos" no cliente (4 blocos), grupo "Contatos (ERP)" em Admin > Campos do Cliente.

## Pendências
- `docs/integracao/sql/01-instalar.sql` (view de clientes) não foi alterada.
- Conferência visual; produção (migration `20261019130000_cliente_contatos_erp` e fontes BJPLA003/004).
