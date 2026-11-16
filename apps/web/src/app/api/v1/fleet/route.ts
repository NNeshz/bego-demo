import { connection } from "next/server";
import { getContext } from "@/server/context";
import { json, route } from "@/server/api/http";
import { getFleet } from "@/server/services";

export { OPTIONS } from "@/server/api/http";

export const GET = route(async () => {
  // Depends on today's date: must run at request time, never prerendered at build.
  await connection();
  return json(await getFleet(getContext()));
});
