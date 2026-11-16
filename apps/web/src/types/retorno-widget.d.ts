import type { DetailedHTMLProps, HTMLAttributes } from "react";

/** Lets React/TSX type-check <retorno-widget> (served from /widget.js). */
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "retorno-widget": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        position?: string;
        base?: string;
        "unit-type"?: string;
        "available-at"?: string;
        limit?: string | number;
        explain?: "" | undefined;
        theme?: "light" | "dark" | "auto";
        "api-base"?: string;
        "no-feedback"?: "" | undefined;
      };
    }
  }
}
