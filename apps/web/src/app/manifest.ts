import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Retorno · No regreses vacío",
    short_name: "Retorno",
    description: "Concepto no oficial: la mejor carga de regreso para el hombre-camión.",
    lang: "es-MX",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0e1116",
    theme_color: "#0e1116",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png" },
      { src: "/icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
