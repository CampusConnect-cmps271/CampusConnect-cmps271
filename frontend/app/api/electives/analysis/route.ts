import { analysisPOST } from "@/modules/electives";
import { trackApiRequest } from "@/modules/logging/api-metrics";

export const POST = trackApiRequest(
  "/api/electives/analysis",
  "POST",
  analysisPOST
);
