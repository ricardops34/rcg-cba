"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * Imagem (data URL) do QR de pareamento a partir do que o provedor devolveu.
 *
 * O provedor devolve o *conteúdo* do QR (`2@...`), desenhado aqui, ou — em
 * alguns, como a Evolution GO — a imagem pronta em data URL. A imagem pronta é
 * usada como está: passá-la ao gerador falha (é longa demais para caber num
 * código) e a tela ficava no quadro vazio para sempre.
 *
 * O QR expira em segundos e o provedor renova; cada conteúdo novo é
 * redesenhado. A imagem gerada fica guardada junto do conteúdo que a gerou,
 * para nunca exibir o desenho de um código que já foi trocado.
 */
export function useImagemQr(conteudo: string | null | undefined): string | null {
  const [gerada, setGerada] = useState<{ conteudo: string; url: string } | null>(
    null,
  );

  const pronta = conteudo?.startsWith("data:image/") ? conteudo : null;

  useEffect(() => {
    if (!conteudo || pronta) return;
    let cancelado = false;
    QRCode.toDataURL(conteudo, { margin: 1, width: 512 })
      .then((url) => {
        if (!cancelado) setGerada({ conteudo, url });
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, [conteudo, pronta]);

  if (!conteudo) return null;
  if (pronta) return pronta;
  return gerada?.conteudo === conteudo ? gerada.url : null;
}
