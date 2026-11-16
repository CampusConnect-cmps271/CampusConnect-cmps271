
export type RequestMetric = {
  status: number;
};

export type AvailabilityStats = {
  totalRequests: number;
  successfulRequests: number;
  clientErrors: number;
  serverErrors: number;
  availabilityPercent: number | null;
};

export function calculateAvailability(
  requests: RequestMetric[],
): AvailabilityStats {
  let successfulRequests = 0;
  let clientErrors = 0;
  let serverErrors = 0;

  for (const request of requests) {
    const status = request.status;

    if (!Number.isInteger(status) || status < 100 || status > 599) {
      throw new Error("Invalid HTTP status");
    }

    if (status >= 500) {
      serverErrors++;
    } else if (status >= 400) {
      clientErrors++;
    } else {
      successfulRequests++;
    }
  }

  const totalRequests = requests.length;

  const availabilityPercent =
    totalRequests === 0
      ? null
      : Math.round(
          ((totalRequests - serverErrors) / totalRequests) * 10000,
        ) / 100;

  return {
    totalRequests,
    successfulRequests,
    clientErrors,
    serverErrors,
    availabilityPercent,
  };
}

