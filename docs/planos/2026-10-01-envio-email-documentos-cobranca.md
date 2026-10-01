# Plano: 2ª via e cobrança por e-mail, e histórico na Posição do Cliente

> **Status (01/10/2026): implementado.** Rotas em `documentos-email`, botões de
> e-mail na 2ª via (Posição do Cliente, Notas de Saída, Títulos a Receber),
> "Enviar cobrança por e-mail" e a aba Histórico de atendimento na Posição do
> Cliente. Testado em dev com dados reais: a cobrança saiu (para o Mailhog) com
> o boleto atualizado e o DANFE anexados, o título sem boleto foi listado como
> aviso, e a atividade do tipo e-mail entrou no histórico do cliente.

## Pedido (usuário, 01/10/2026)

1. A 2ª via de **XML, DANFE e boleto** pode ser enviada por e-mail. O
   destinatário é **sempre o e-mail do cadastro do cliente**.
2. **E-mail de cobrança**: a posição dos títulos vencidos do cliente, com os
   **PDFs dos DANFEs e dos boletos** anexados.
3. O envio da cobrança entra no **histórico de atendimento** do usuário e do
   cliente.
4. Na **Posição do Cliente**, uma aba **Histórico de atendimento**.

## Desenho

### Envio

- **Destinatário:** `clientes.email`, sem campo de digitação. Mais de um
  endereço no cadastro (separados por `;` ou `,`) vai para todos. Cliente sem
  e-mail: 409 com o motivo — não há para quem mandar.
- **SMTP:** o da empresa (Administração > Parâmetros, `SMTP_*`), com o
  ambiente como reserva — a mesma regra do e-mail de senha. Sem SMTP: 409
  dizendo onde configurar. Falha do servidor: o erro dele volta para a tela.
  Diferente do e-mail de senha, aqui o envio **é** a ação: não há o que
  preservar se ele falhar.
- **Rotas** (módulo `documentos-email`), cada uma com a permissão de quem já
  baixa o documento:
  - `POST /documentos-email/nota/:id` — DANFE em PDF e, por padrão, o XML
    (`notas-saida.visualizar`);
  - `POST /documentos-email/titulo/:id` — boleto, atualizado ou original
    (`titulos-receber.visualizar`);
  - `POST /documentos-email/cobranca/:clienteId` — cobrança
    (`titulos-receber.visualizar`).
- **Escopo:** os documentos saem dos serviços que a tela já usa
  (`gerarDanfe`, `obterXml`, `gerarBoleto`, `findAll` de títulos), com o
  usuário que pede — a carteira dele vale sem ser reimplementada.

### Cobrança

- **Títulos:** em aberto e vencidos do cliente, até 30 (os mais antigos
  primeiro). O corpo do e-mail traz a tabela (título, parcela, vencimento,
  dias de atraso, saldo) e o total.
- **Boletos:** o atualizado de cada título que tiver 2ª via. Os que o ERP não
  permite reemitir (sem nosso número, vencido além do prazo) ficam na tabela
  com "boleto indisponível — fale conosco".
- **DANFEs:** título não aponta para nota; a nota é a de **mesmo número e
  mesmo cliente** (conferido em 01/10/2026: 78% dos vencidos casam assim; o
  prefixo do título, `IMP`, não é a série). Só com XML. Uma nota por número,
  mesmo com várias parcelas.

### Histórico

- Cada envio vira **Atividade concluída do tipo e-mail**, ligada ao cliente e
  ao vendedor da carteira, com o usuário como autor — o mesmo mecanismo de
  "DANFE enviado pelo WhatsApp". Eventos novos: `danfe_email`, `boleto_email`,
  `cobranca_email`.
- **Aba Histórico de atendimento** na Posição do Cliente: as atividades do
  cliente, mais recentes primeiro (a mesma consulta de CRM › Atividades,
  filtrada pelo cliente).

### E-mail

- Um layout só para os e-mails da plataforma: nome da empresa no assunto e
  no rodapé com os dados do cadastro, e o aviso de e-mail automático — o
  mesmo do e-mail de senha.
