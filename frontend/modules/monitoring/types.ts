export type ComponentHealth = "operational" | "degraded" | "outage";
export type OverallHealth = "healthy" | "degraded" | "unhealthy";

export type HealthCheck = {
  service: "website" | "database" | "ai";
  label: string;
  status: ComponentHealth;
  message: string;
  latencyMs: number;
};

export type HealthSnapshot = {
  overall: OverallHealth;
  checkedAt: string;
  checks: HealthCheck[];
};
