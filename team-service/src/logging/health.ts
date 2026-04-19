import { config } from "../config.js";

export function buildServiceHealthPayload() {
  return {
    ok: true,
    service: "team-service",
    role: "integrated-backend",
    appEnvironment: config.appEnvironment,
    whatsapp: {
      publicRuntime: "node",
      workersEnabled: config.whatsappEnableWorkers,
      agentEnabled: config.whatsappEnableAgent,
      drainBatchSize: config.whatsappDrainBatchSize,
    },
    fallback: {
      n8nCentralRuntime: false,
    },
  };
}
