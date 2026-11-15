import type { ApiAvailabilityRow } from "./dashboard-server";

export type AvailabilitySummary = {
  total_requests: number;
  successful_requests: number;
  client_errors: number;
  server_errors: number;
  availability_percent: number | null;
};

export function summarizeApiAvailability(
  rows: readonly ApiAvailabilityRow[],
): AvailabilitySummary {
  let total_requests = 0;
  let successful_requests = 0;
  let client_errors = 0;
  let server_errors = 0;

  for (const row of rows) {
    total_requests += row.total_requests;
    successful_requests += row.successful_requests;
    client_errors += row.client_errors;
    server_errors += row.server_errors;
  }

  const availability_percent =
    total_requests === 0
      ? null
      : Math.round(((total_requests - server_errors) / total_requests) * 10000) / 100;

  return {
    total_requests,
    successful_requests,
    client_errors,
    server_errors,
    availability_percent,
  };
}
