import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build de produção autocontido (docker/web.Dockerfile copia .next/standalone).
  output: "standalone",
  // Monorepo: o file tracing do standalone precisa partir da raiz do workspace.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  allowedDevOrigins: ["rcgcba.bjsoft.com.br"],
};

export default nextConfig;
