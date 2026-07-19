import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#16a34a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "Teknos CRM",
  description: "Sistema omnichannel de atendimento com IA",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Teknos CRM",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
