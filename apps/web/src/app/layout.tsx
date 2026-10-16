import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { PwaRegistro } from "@/components/pwa-registro";

export const metadata: Metadata = {
  title: "CRM",
  description: "Gestão comercial multiempresa",
  appleWebApp: { capable: true, title: "CRM", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#1d4ed8",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
        <PwaRegistro />
      </body>
    </html>
  );
}
