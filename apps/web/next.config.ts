import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build de produção autocontido (docker/web.Dockerfile copia .next/standalone).
  output: "standalone",
  // Monorepo: o file tracing do standalone precisa partir da raiz do workspace.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  allowedDevOrigins: ["rcgcba.bjsoft.com.br"],
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
};

export default nextConfig;
