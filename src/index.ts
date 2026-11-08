import "dotenv/config";

export * from "./core/domain/index.js";
export * from "./core/use-cases/index.js";
export * from "./contracts/index.js";
export * from "./infra/index.js";

async function main() {
  console.info(
    JSON.stringify({
      level: "INFO",
      service: "financial-ledger-service",
      status: "initialized",
      timestamp: new Date().toISOString(),
    })
  );
}

if (process.env["NODE_ENV"] !== "test") {
  main().catch((err) => {
    console.error("Failed to start financial-ledger-service:", err);
    process.exit(1);
  });
}
