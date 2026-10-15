# Fluxograma de função — `NotasSaidaService.gerarDanfe`

```mermaid
flowchart TD
    Start["gerarDanfe(empresaId, quem, id, opcoes?)"] --> F1["lerXml(empresaId, quem, id) — privado"]
    F1 --> F2[recorteDoSolicitante tx, empresaId, quem]
    F2 --> F3["findFirst notaSaida: id, empresaId, deletedAt null + recorte (escopoVendedores e/ou clienteId)"]
    F3 --> F4{nota encontrada?}
    F4 -- não --> X1[throw NotFoundException]
    F4 -- sim --> F5["findUnique NotaSaidaXml por notaSaidaId (select só conteudo)"]
    F5 --> F6{xml existe?}
    F6 -- não --> X2["throw ConflictException: NF sem XML autorizado, ERP precisa enviar"]
    F6 -- sim --> F7["retorna {nota, conteudo: Buffer}"]

    F7 --> F8["extrairNfe(conteudo.toString('utf8'))"]
    F8 --> F9{"NfeXmlInvalidoError?"}
    F9 -- sim --> X3["throw ConflictException: XML da NF {numero} não pôde ser lido: {causa}"]
    F9 -- não --> F10{"outro erro?"}
    F10 -- sim --> X4[propaga erro]
    F10 -- não --> F11["numero = dados.numero ?? nota.numero"]

    F11 --> F12["findFirst Empresa (fora da transação de tenant): logoDanfeUrl, logoUrl"]
    F12 --> F13["carregarLogo(logoDanfeUrl)"]
    F13 --> F14{logo encontrado?}
    F14 -- sim --> F17[logo = resultado]
    F14 -- não --> F15["carregarLogo(logoUrl)"]
    F15 --> F17
    F17 --> F18["montarDanfePdf(dados, {segundaVia: true, logo})"]

    F18 --> F19{opcoes.registrarEvento !== false?}
    F19 -- não --> R1
    F19 -- sim --> F20["registrarEvento: autorDoEvento(quem), nota, 'danfe_gerado', numero, detalhes"]
    F20 --> F21["detalhes = [cancelada? 'NOTA CANCELADA', dataEmissao formatada, valorTotal em BRL]"]
    F21 --> F22["registrarAtividadeDocumento no histórico do cliente"]
    F22 --> R1["retorna {conteudo: pdf, nomeArquivo: danfe-{numero}.pdf, chave, cancelada, numero, clienteId, vendedorId}"]
```

**Pontos de atenção:**
- A ordem importa: o evento só é gravado **depois** que o PDF existe (`F18` antes de
  `F19`). Um XML ilegível vira 409 em `F9` e nunca chega a `F19` — o histórico do cliente
  não registra uma 2ª via que ninguém recebeu.
- `F12` (busca da `Empresa` para o logo) roda **fora** da transação `withTenant` usada em
  `lerXml` — `Empresa` não é tabela de tenant (mesmo padrão do PDF de orçamento,
  referenciado no comentário do código).
- `F9`/`F10` distinguem o tipo de erro: só `NfeXmlInvalidoError` vira 409 com mensagem
  amigável citando o número da nota; qualquer outro erro de `extrairNfe` propaga sem
  tratamento especial (bug de parsing legítimo, não XML malformado esperado).
- `opcoes.registrarEvento === false` é usado pelo fluxo de WhatsApp, que grava um evento
  mais específico ("DANFE enviado") em vez de deixar este método gravar "DANFE gerado" —
  evita duplicidade no histórico do cliente para a mesma ação.
- O escopo de acesso inteiro (quem pode chegar a este método) é resolvido **antes** de
  `extrairNfe` sequer rodar, em `lerXml`/`recorteDoSolicitante` — usuário logado e cliente
  via WhatsApp (`QuemPede`) passam pelo mesmo código, cada um com seu recorte.
