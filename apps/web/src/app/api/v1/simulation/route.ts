import { connection } from "next/server";
import { getContext } from "@/server/context";
import { json, readQuery, route } from "@/server/api/http";
import { SimulationQuerySchema } from "@/server/api/schemas";
import { runSimulation } from "@/server/services";

export { OPTIONS } from "@/server/api/http";

export const GET = route(async (request: Request) => {
  await connection();
  const { days } = readQuery(request, SimulationQuerySchema);
  return json(await runSimulation(getContext(), days));
});
