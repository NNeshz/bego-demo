import type { Metadata, Viewport } from "next";
import { Geist_Mono, Poppins } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { ThemeProvider } from "@/components/theme";
import { UnofficialBanner } from "@/components/unofficial-banner";
import "./globals.css";

// Poppins is not a variable font: declare only the weights we use.
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Retorno · No regreses vacío", template: "%s · Retorno" },
  description:
    "Concepto no oficial: copiloto que recomienda la mejor carga de regreso para el hombre-camión.",
  applicationName: "Retorno",
  appleWebApp: { capable: true, title: "Retorno", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fffdeb" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1116" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // next-themes sets the class on <html> before hydration.
    <html
      lang="es-MX"
      suppressHydrationWarning
      className={`${poppins.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <UnofficialBanner />
          {children}
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
