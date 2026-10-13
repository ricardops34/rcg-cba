# Arquivos no MinIO, com backup e prazo para a mídia do WhatsApp

## Decisões (13/10/2026)

- **Usar o MinIO da VPS** para os arquivos que hoje ficam no volume `uploads`
  da API. Decisão do usuário.
- **O MinIO hoje não tem backup** — o usuário quer montar. Sem cópia para fora
  da VPS, o MinIO só troca o lugar do risco; o backup faz parte do plano, não é
  extra.
- **Mídia antiga do WhatsApp pode ser apagada** depois de um prazo. Decisão do
  usuário ("se possível, sim").

## Como é hoje

- Tudo é gravado em disco, em `apps/api/uploads` (`UPLOADS_DIR`), num volume
  Docker (`uploads`, `docker/stack.rcgcba.prod.yml`). São 18 arquivos do
  código que leem ou gravam lá direto (`writeFile`, `diskStorage` do multer,
  `readFile` para montar PDF e e-mail).
- A API serve a pasta em `/uploads` (`ServeStaticModule`, `app.module.ts`):
  - `whatsapp/` só com link assinado de 24 h (`common/uploads/link-assinado.ts`);
  - `agente/` e `fichas-importacao/` fechados (`main.ts`);
  - o resto (logos, banners, fotos de produto, fichas, avatares) é aberto.
- O runbook cobre backup do **banco**, não do volume de arquivos. Perder o
  volume deixa mensagens e cadastros apontando para arquivos que não existem.
- `WhatsappConfig.retencaoDias` existe, aparece na tela de WhatsApp como
  "Retenção das conversas", e **nada o aplica** — o comentário no schema deixa
  a rotina para a "Fatia 3 (governança)".

## Plano

### Fase 0 — backup do que já existe (antes de qualquer código)

Independe do MinIO e protege o que está em produção hoje.

- Cópia periódica do volume `uploads` e dos buckets do MinIO para **fora da
  VPS**. Destino em aberto (ver Pendências).
- O MinIO tem replicação de bucket (`mc replicate`) para outro S3/MinIO, e o
  `mc mirror` serve para cópia agendada. Qual usar depende do destino.
- Procedimento vai para o `docs/runbook-operacao.md` — testado com uma
  restauração, não só com a cópia.

### Fase 1 — camada única de armazenamento

Um serviço `Armazenamento` na API com `gravar`, `ler`, `apagar` e
`linkTemporario`, e dois motores:

- **disco** — o comportamento de hoje, para dev e para quem não tiver MinIO;
- **s3** — o MinIO (qualquer S3), escolhido por variável de ambiente.

Os 18 pontos passam a chamar o serviço em vez do disco. O endereço gravado no
banco vira uma **chave** (`whatsapp/<uuid>.jpg`), não um caminho de
`/uploads`, para o mesmo registro valer nos dois motores.

### Fase 2 — mídia do WhatsApp no MinIO

Primeira a migrar: é a maior, a que mais cresce (toda conversa é gravada,
inclusive Sem Vínculo) e a privada.

- Bucket privado. O link temporário vira o **presigned URL** do próprio S3 —
  substitui o HMAC de `link-assinado.ts` e tira o tráfego de vídeo e PDF da
  API.
- Script de cópia dos arquivos que já estão no volume, com conferência de
  quantidade e tamanho antes de apagar do disco.
- `arquivoUrl` das mensagens já gravadas: migrar para a chave, ou o serviço
  aceitar os dois formatos durante a transição.

### Fase 3 — prazo da mídia do WhatsApp

- Rotina diária que, por empresa, apaga a **mídia** das mensagens com
  `criadaEm` além do prazo. A mensagem continua no histórico (texto, quem
  mandou, quando) e mostra "Mídia expirada" no lugar do arquivo.
- O prazo usa `retencaoDias` (0 = guarda tudo, como hoje). O rótulo da tela
  muda para dizer que é da mídia — ver Pendências sobre o texto.
- Alternativa no próprio MinIO: regra de ciclo de vida (lifecycle) no bucket.
  Mais simples, mas o prazo fica igual para todas as empresas e o banco não
  fica sabendo que o arquivo sumiu. Recomendação: a rotina na API.

### Fase 4 — demais pastas

Fichas técnicas, anexos do assistente, importação de fichas, fotos de
produto, avatares, logos, banners. Os públicos (logo, banner, foto) podem ir
para um bucket com leitura pública, ou ficar em disco por mais tempo — são
pequenos e não crescem com o uso.

## Pendências (decisão do usuário)

1. **Destino do backup** fora da VPS: outro provedor S3 (Backblaze B2,
   Wasabi, AWS), um storage box, outro servidor? E a frequência.
2. **Prazo da mídia** do WhatsApp: quantos dias? Vale o mesmo para todas as
   empresas ou cada uma escolhe na tela (como o campo já permite)?
3. **Só a mídia ou a conversa inteira?** O plano apaga só o arquivo e guarda o
   texto. Apagar também o texto é o que o rótulo atual ("Retenção das
   conversas") sugere — e perde histórico comercial.
4. **Dados de acesso do MinIO** (endereço interno, bucket, usuário de
   serviço): seguir o runbook; o que não estiver lá, perguntar e registrar.
