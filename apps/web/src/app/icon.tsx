import { ImageResponse } from "next/og";
import { MarkImage } from "@/components/brand/mark-image";

const ICONS = {
  "32": { size: 32, maskable: false },
  "192": { size: 192, maskable: false },
  "512": { size: 512, maskable: false },
  maskable: { size: 512, maskable: true },
} as const;

/** Browser tab + PWA icons: /icon/32, /icon/192, /icon/512, /icon/maskable. */
export function generateImageMetadata() {
  return Object.entries(ICONS).map(([id, { size }]) => ({
    id,
    size: { width: size, height: size },
    contentType: "image/png",
  }));
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const icon = ICONS[String(await id) as keyof typeof ICONS] ?? ICONS["32"];
  return new ImageResponse(<MarkImage size={icon.size} maskable={icon.maskable} />, {
    width: icon.size,
    height: icon.size,
  });
}
