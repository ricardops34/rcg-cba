# Backup por empresa: gerar, exportar e restaurar

## Decisões (13/10/2026, usuário)

- **Finalidade: as duas.** O mesmo pacote serve para **entregar ao cliente**
  (fim de contrato, LGPD, conferência) e para **restaurar a empresa** na
  plataforma sem restaurar a base inteira — que voltaria todas as empresas.
- **Quem gera e baixa: só o administrador da plataforma** (RCG), na área da
  Plataforma, escolhendo a empresa. O administrador da empresa não tem acesso.
- **Conteúdo: dados e arquivos** da empresa — mídia do WhatsApp, fichas,
  fotos, logos, banners.
- **Quando: sob demanda e agendado.** O agendado grava no MinIO, e o NAS do
  escritório puxa junto com o resto (ver
  `2026-10-13-armazenamento-arquivos-minio.md`).

## O que é diferente do backup da base

O backup da base (`pg_dump`, Fase 0 do plano do MinIO) é o seguro contra perder
a VPS: volta **tudo**. Este é por empresa: entrega os dados de um cliente e
volta **uma** empresa sem mexer nas outras. Um não substitui o outro.

## O pacote

Um `.zip` por empresa e data, num bucket privado do MinIO
(`backups-empresas/<empresaId>/<data>.zip`):

```
manifesto.json        empresa, data, quem gerou, versão do schema (última
                      migration), contagem e hash de cada arquivo
dados/<tabela>.jsonl  uma linha por registro, tipos preservados — é o que a
                      restauração lê
planilhas/<tabela>.csv o mesmo conteúdo em planilha, para o cliente abrir
arquivos/...          os arquivos que os registros da empresa referenciam,
                      na mesma chave do armazenamento
LEIA-ME.txt           o que é cada pasta, em português
```

### Quais tabelas

- As que têm `empresaId` (102 das 126 hoje), mais as filhas que pertencem à
  empresa por chave estrangeira sem ter a coluna.
- **Lista explícita em código, com teste que falha** quando um model novo do
  schema não está classificado como "entra" ou "fica de fora". Sem isso, a
  primeira tabela nova some do backup sem ninguém notar.
- Usuários (RLS por grupo econômico): entram os vinculados à empresa, **sem**
  hash de senha nem tokens.
- **Ficam de fora, ou vão mascarados, os segredos:** chaves de API da
  integração, senha de SMTP, credenciais do WhatsApp/SMS, segredos de 2FA.
  Restaurar não os traz de volta — reconfigura-se.

### Arquivos

O pacote junta só os arquivos referenciados pelos registros da empresa (os
`arquivoUrl` das mensagens, fichas, fotos, logo…), lidos pela camada de
armazenamento — por isso este plano vem **depois da Fase 1** do plano do MinIO.

## Como roda

Como o "Calcular" da Sugestão de Compra (`2026-09-30-sugestao-compra-segundo-plano.md`):

- Tabela `empresa_backups`: empresa, origem (manual/agendado), status
  (na fila, gerando, pronto, falhou), chave no MinIO, tamanho, hash, quem
  pediu, erro. **Um em andamento por empresa** (índice parcial único).
- `POST` responde 202; a geração corre em segundo plano, **em streaming**:
  lê as tabelas aos poucos e escreve o zip direto no MinIO (upload em partes),
  sem montar o pacote inteiro em memória nem em disco — mídia pode passar de
  gigabytes.
- **Agendado:** uma varredura no padrão das que já existem (`setInterval`,
  ex. `erros-varredura.service.ts`) dispara o backup de cada empresa conforme
  a frequência configurada.
- **Guarda dos pacotes agendados:** os N últimos por empresa; os anteriores
  são apagados. Os manuais ficam até alguém excluir.
- A geração roda na API, com o papel `plataforma_app` (o `plataforma`, dono
  das tabelas, é de migration e import). Lê por `withTenant(empresaId)`: a
  própria RLS garante que o pacote só leva linhas daquela empresa — um erro
  de filtro no código não vaza outra. As tabelas com RLS por grupo
  (`usuarios`, `empresas`…) usam o modo sistema com o filtro em código,
  conferido por teste.

## Tela (Plataforma → Backups de empresas)

- Lista por empresa: último backup, tamanho, status, próximo agendado.
- **Gerar agora**, **Baixar** (link temporário do MinIO, curto) e
  **Excluir pacote**.
- Configuração do agendamento: frequência e quantos guardar.
- Cada geração, download e exclusão vai para o `audit_logs`: o pacote é a
  empresa inteira.

## Restaurar

A parte mais perigosa: apaga os dados atuais da empresa e põe os do pacote.

- Só no **mesmo schema**: o manifesto guarda a última migration; versão
  diferente é recusada (converter entre versões fica para depois, se precisar).
- Só para a **mesma empresa** (os ids são globais; restaurar como outra
  empresa colidiria).
- Numa transação: apaga na ordem inversa das dependências, insere na ordem
  direta, confere as contagens contra o manifesto e só então confirma.
- Antes de restaurar, gera um backup do estado atual — para voltar atrás.

## Fases

1. **Catálogo das tabelas** com o teste de cobertura do schema.
2. **Gerar e baixar sob demanda** (dados + planilhas + arquivos), tela e
   auditoria.
3. **Agendado** e guarda dos N últimos.
4. **Restaurar.**

Depende da Fase 1 do plano do MinIO (camada de armazenamento) para ler os
arquivos e gravar o pacote.

## Pendências (decisão do usuário)

1. **Restaurar por botão ou por script?** Recomendação: **script**, rodado
   pela equipe com o procedimento no runbook — é raro e destrutivo, e um
   botão na tela é um clique de distância de apagar uma empresa. A tela fica
   só com gerar/baixar/excluir.
2. **Frequência do agendado** e **quantos guardar** (ex.: semanal, 4 últimos).
   Valor único para todas as empresas ou por empresa?
3. **Senha no pacote baixado?** O zip tem a empresa inteira; entregue ao
   cliente por e-mail ou link, uma senha (AES) protege se ele vazar no
   caminho. Custa: a senha precisa chegar ao cliente por outro canal.
