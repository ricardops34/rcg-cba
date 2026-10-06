# Plano: WhatsApp 100% integrado à Evolution GO

> **Status (06/10/2026): fatia 1 pronta; fatia 2 em implementação.**

## Pedido (usuário, 06/10/2026)

"Limitar os recursos aos disponíveis na Evolution GO
(github.com/evolution-foundation/evolution-go)" → "vamos fazer já o ajuste para
os recursos da Evo GO, com áudio, listas, botões, etc." → "deixar 100%
integrada com ela". Docker local liberado para teste.

## Contrato de referência

Versão em uso: **0.7.2** (é a última tag; o `main` coincide). Fontes, nesta
ordem de confiança: código (`pkg/sendMessage/handler/send_handler.go`,
`pkg/sendMessage/service/send_service.go` na tag 0.7.2), depois
`docs/swagger.json`, depois os guias `docs/wiki/guias-api/*.md`.

| Recurso | Rota | Situação na plataforma |
|---|---|---|
| Texto (com citação) | `POST /send/text` | ok |
| Mídia: imagem (jpg/png/webp), vídeo (mp4), áudio, documento | `POST /send/media` (JSON com `url` **ou** multipart com `file`) | **quebrado** — ver fatia 1 |
| Áudio de voz | `/send/media` `type=audio` (o gateway converte para Opus/PTT) | **quebrado** — mandávamos `type=ptt`, que a 0.7.2 recusa |
| Link com preview | `POST /send/link` | falta |
| Botões (reply ≤3 / url / call / copy / pix) | `POST /send/button` | falta |
| Lista (seções e linhas) | `POST /send/list` | falta |
| Carrossel (≥2 cards com imagem por URL) | `POST /send/carousel` | falta |
| Enquete | `POST /send/poll` | falta |
| Localização | `POST /send/location` | falta |
| Contato (vCard) | `POST /send/contact` | falta |
| Figurinha | `POST /send/sticker` | falta |
| Reação | `POST /message/react` | ok |
| Marcar lida | `POST /message/markread` | ok |
| Editar (só texto próprio) | `POST /message/edit` | falta |
| Apagar para todos (só própria) | `POST /message/delete` | falta |
| Presença (digitando/gravando) | `POST /message/presence` | falta |
| Clique em botão/lista/carrossel | evento `ButtonClick` (categoria `BUTTON_CLICK` ou `MESSAGE`) | falta |
| Voto de enquete, edição e exclusão recebidas | dentro de `MESSAGE` | falta |
| Histórico, agenda, foto, download de mídia | `/chat/history-sync`, `/user/contacts`, `/user/avatar`, `/message/downloadmedia` | ok |
| Lista de conversas do aparelho | — não existe na 0.7.2 | tela já trata como vazio |

## Fatias

1. **Mídia e áudio corretos** — `/send/media` por multipart (bytes, sem URL
   pública e sem `data:` URI); áudio com `type=audio`; validar no envio o que o
   gateway recusa (imagem só jpg/png/webp, vídeo só mp4) com mensagem clara.
2. **Envio interativo** — botões, lista, enquete, localização, contato, link,
   figurinha; gravação com o conteúdo estruturado (coluna JSON) para a bolha
   desenhar; compositor com menu desses tipos.
3. **Recebimento** — `ButtonClick` vira mensagem de entrada ligada à que a
   originou; voto de enquete; edição e exclusão vindas do celular; figurinha.
4. **Editar, apagar e presença** a partir da plataforma.
5. **Carrossel** (exige imagem por URL pública — decidir de onde vem).

## Regras que valem para todas as fatias

- A instância é da empresa + usuário + vendedor + número
  (`2026-10-06-whatsapp-isolamento-atendimento.md`): todo envio novo passa por
  `conversaParaEnvio`.
- Permissão: enviar qualquer tipo = `whatsapp-conversas.cadastrar`.
- O que o gateway recusa é barrado antes, em código, com mensagem em
  português — não deixar o 500 do gateway chegar à tela.
