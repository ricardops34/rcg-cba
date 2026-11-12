/**
 * Build que o servidor está servindo agora. O app aberto compara com o build
 * que carregou (o mesmo `NEXT_PUBLIC_VERSAO`, embutido no bundle) e oferece
 * recarregar depois de um deploy. Público e sem dado nenhum além do número.
 */
export const dynamic = "force-static";

export function GET() {
  return Response.json(
    { versao: process.env.NEXT_PUBLIC_VERSAO ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
