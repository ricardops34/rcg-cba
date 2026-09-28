import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build de produção autocontido (docker/web.Dockerfile copia .next/standalone).
  output: "standalone",
  // Monorepo: o file tracing do standalone precisa partir da raiz do workspace.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  allowedDevOrigins: ["rcgcba.bjsoft.com.br"],
  experimental: {
    // O proxy de /api/v1 corta o corpo em 10 MB por padrão — e corta calado:
    // a API recebe o arquivo truncado. A carga por arquivo aceita até 100 MB
    // (INTEGRACAO_CARGA_MAX_BYTES); a tela compacta antes de subir, mas um
    // arquivo grande passa de 10 MB mesmo compactado.
    proxyClientMaxBodySize: "100mb",
  },
  // Cadastro de Clientes mudou de módulo (Comercial → Cadastros) junto com a
  // URL; mantém de pé o que já estava salvo/compartilhado do caminho antigo.
  async redirects() {
    return [
      {
        source: "/comercial/clientes/:path*",
        destination: "/cadastros/clientes/:path*",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    const apiTarget = process.env.INTERNAL_API_URL ?? "http://api:3001";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiTarget}/api/v1/:path*`,
      },
      {
        source: "/uploads/:path*",
        destination: `${apiTarget}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
