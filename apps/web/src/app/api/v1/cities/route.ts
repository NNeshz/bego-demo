import { getContext } from "@/server/context";
import { json, route } from "@/server/api/http";
import { listCities } from "@/server/services";

export { OPTIONS } from "@/server/api/http";

// Static reference data (does not depend on the date).
export const GET = route(async () => json({ cities: await listCities(getContext()) }));
