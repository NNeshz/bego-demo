import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { UnofficialBanner } from "@/components/unofficial-banner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Retorno · No regreses vacío",
  description:
    "Concepto no oficial: copiloto que recomienda la mejor carga de regreso para el hombre-camión.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-MX" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <UnofficialBanner />
        {children}
      </body>
    </html>
  );
}
