import { Plug } from "lucide-react";
import { CopyBlock } from "./copy-block";

const TOOLS: Array<[string, string]> = [
  ["find_return_loads", "Mejores cargas de regreso vs. regresar vacío"],
  ["plan_load_chain", "Cadenas de 2 cargas"],
  ["explain_recommendation", "“Te conviene porque…” con números del motor"],
  ["get_fleet_empty_km", "Km en vacío de la flota: hoy vs. con Retorno"],
];

/** How to plug the same tools into any MCP-compatible agent. */
export function ConnectPanel({ origin }: { origin: string }) {
  const url = `${origin}/api/mcp`;
  return (
    <div className="flex flex-col gap-4">
      <div className="glass flex flex-col gap-3 p-4">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Plug className="size-4" /> Conéctalo a tu agente (MCP)
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Las mismas herramientas que usa este chat están expuestas como servidor MCP: cualquier
          agente compatible (Claude, o el asistente de tu producto) las puede llamar. Streamable
          HTTP, sin estado, solo lectura.
        </p>
        <CopyBlock label="Endpoint" code={url} />
        <ul className="flex flex-col gap-1.5 text-xs">
          {TOOLS.map(([name, description]) => (
            <li key={name} className="flex flex-col">
              <code className="font-mono font-medium">{name}</code>
              <span className="text-muted-foreground">{description}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="glass flex flex-col gap-3 p-4">
        <h3 className="eyebrow">Claude Desktop</h3>
        <p className="text-xs text-muted-foreground">
          En <code className="font-mono">claude_desktop_config.json</code> (usa el puente{" "}
          <code className="font-mono">mcp-remote</code>):
        </p>
        <CopyBlock
          code={JSON.stringify(
            { mcpServers: { retorno: { command: "npx", args: ["-y", "mcp-remote", url] } } },
            null,
            2,
          )}
        />
        <p className="text-xs text-muted-foreground">
          Con la URL pública (después del deploy) también se puede agregar como conector remoto.
        </p>
      </div>

      <div className="glass flex flex-col gap-3 p-4">
        <h3 className="eyebrow">Probarlo sin cliente</h3>
        <p className="text-xs text-muted-foreground">
          MCP Inspector → transporte “Streamable HTTP” → el endpoint de arriba:
        </p>
        <CopyBlock code="npx @modelcontextprotocol/inspector" />
        <p className="text-xs text-muted-foreground">O directo con curl:</p>
        <CopyBlock
          code={`curl -s ${url} \\
  -H 'content-type: application/json' \\
  -H 'accept: application/json, text/event-stream' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"find_return_loads","arguments":{"position":"nuevo-laredo","base":"queretaro","unit_type":"dry_van_53","limit":1}}}'`}
        />
      </div>
    </div>
  );
}
