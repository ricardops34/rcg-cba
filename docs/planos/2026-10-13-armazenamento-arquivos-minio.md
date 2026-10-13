# Arquivos no MinIO, com backup e exclusão da mídia do WhatsApp

## Decisões (13/10/2026)

- **Usar o MinIO da VPS** para os arquivos que hoje ficam no volume `uploads`
  da API. Decisão do usuário.
- **O MinIO hoje não tem backup** — o usuário quer montar. Sem cópia para fora
  da VPS, o MinIO só troca o lugar do risco; o backup faz parte do plano, não é
  extra.
- **Mídia do WhatsApp só sai pela exclusão do administrador** (excluir o
  histórico de uma instância, ou a instância com o histórico — permissão
  `whatsapp-historico.excluir`). **Sem rotina de retenção por prazo.**
  Decisão do usuário (13/10/2026), que substitui o "apagar depois de um
  prazo" anotado antes no mesmo dia.

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
- **A exclusão do administrador apaga as linhas, não os arquivos.**
  `limparConversas` e `excluirInstanciaComHistorico`
  (`whatsapp-sessao.service.ts`) passam por `apagarConversas`
  (`apagar-conversas.ts`), que remove conversas e mensagens do banco; a mídia
  delas fica em `uploads/whatsapp` sem nada que aponte para ela, para sempre.
  Toda exclusão feita até hoje deixou arquivo órfão.
- `WhatsappConfig.retencaoDias` existe, aparece na tela de WhatsApp como
  "Retenção das conversas", e **nada o aplica** — o comentário no schema deixa
  a rotina para a "Fatia 3 (governança)". Pela decisão de 13/10 não haverá
  essa rotina; o campo engana quem o preenche (ver Pendências).

## Plano

### Fase 0 — backup numa máquina externa (antes de qualquer código)

Destino: **uma máquina fora da VPS** (decisão do usuário, 13/10/2026). Os
dados da stack do MinIO estão no runbook, seção "MinIO".

**A máquina externa busca; a VPS não empurra.** A credencial fica só na
máquina de backup, e é de **leitura**. Se a VPS for invadida, quem está nela
não tem como apagar nem cifrar a cópia — com replicação empurrada pela VPS
(`mc replicate`), teria.

- **A máquina é um NAS no escritório** (usuário, 13/10/2026). Encaixa no
  "puxar": o NAS só faz conexões de saída (para `s3.rcgdist.com.br` e o SSH
  da VPS) — nenhuma porta aberta no escritório.
- No NAS: a cópia em pastas comuns, sem MinIO. A tarefa roda num contêiner
  agendado (`rclone` ou `mc` para o S3, `ssh`/`rsync` para o volume e o
  banco), ou na ferramenta de sincronização S3 do próprio NAS, se ela fizer
  só download — depende da marca.
- O "volta atrás" é o **snapshot do NAS** (Btrfs/ZFS), diário e guardado 30
  dias, no lugar do versionamento de bucket: mais simples, e cobre também o
  banco e o volume.
- Na VPS: um usuário de serviço do MinIO só com `s3:GetObject` e
  `s3:ListBucket` nos buckets da plataforma. Nunca o root.
- Cópia incremental por agendamento (cron/systemd timer):
  `mc mirror --remove origem/ destino/` — de hora em hora para a mídia do
  WhatsApp; uma vez por dia basta para o resto.
- Com o `--remove` a exclusão do administrador chega ao backup (é a decisão:
  mídia excluída sai), mas os snapshots a deixam recuperável por 30 dias — e
  um apagão por engano ou ataque também.
- **Banco junto:** o `pg_dump` (formato custom, o do runbook) puxado pela
  mesma máquina, diário, com alguns dias guardados. Arquivo sem o banco que
  o referencia não restaura nada.
- Até a mídia ir para o MinIO (Fase 2), o volume `uploads` entra no mesmo
  esquema por `rsync` sobre SSH, também puxado pela máquina externa, com uma
  chave SSH restrita àquele comando.
- **Restauração testada**, não só a cópia: subir o backup numa base e num
  MinIO de teste e abrir uma conversa com mídia. O procedimento vai para o
  runbook.

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

### Fase 3 — a exclusão do administrador leva os arquivos junto

Não depende do MinIO: vale já com o disco, pela camada da Fase 1 (ou direto,
se vier antes).

- `apagarConversas` junta os `arquivoUrl` das mensagens antes do delete e,
  **depois do commit** da transação, apaga os arquivos. Ordem importa: apagar
  o arquivo antes e a transação falhar deixaria mensagem sem mídia; o inverso
  (linha apagada, arquivo não) só sobra lixo, e a varredura abaixo recolhe.
- Falha ao apagar um arquivo não desfaz a exclusão — vai para o log.
- **Varredura de órfãos**, uma vez, para o que as exclusões já feitas
  deixaram: arquivo de `whatsapp/` que nenhuma mensagem referencia. Roda em
  modo "listar" primeiro (quantidade e tamanho), apaga só depois de conferido.
  Cuidado com arquivo recém-gravado cuja mensagem ainda não foi salva (corte
  por data de modificação).
- Sem rotina de retenção por prazo e sem regra de ciclo de vida no bucket.

### Fase 4 — demais pastas

Fichas técnicas, anexos do assistente, importação de fichas, fotos de
produto, avatares, logos, banners. Os públicos (logo, banner, foto) podem ir
para um bucket com leitura pública, ou ficar em disco por mais tempo — são
pequenos e não crescem com o uso.

## Pendências (decisão do usuário)

1. ~~A máquina externa~~ — **NAS no escritório** (13/10). Falta: marca e
   modelo (Synology, QNAP, TrueNAS… — muda a ferramenta), se roda contêiner,
   espaço livre, se faz snapshot, e o tamanho atual do volume `uploads` e do
   MinIO (a primeira cópia desce tudo pela internet do escritório).
2. **Como o backup do banco é feito hoje** na produção (o runbook descreve
   restaurar, não gerar): para não duplicar nem conflitar.
3. ~~Campo "Retenção das conversas"~~ — **resolvido 13/10**: saiu da tela; a
   coluna fica no banco, sem uso.
4. ~~Dados do MinIO~~ — **recebidos 13/10**: stack registrada no runbook. Os
   usuários de serviço (API e backup) ainda vão ser criados.
