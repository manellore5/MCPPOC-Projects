import { buildApp } from "./api/app.js";

const PORT = Number(process.env.FINDANADVISOR_API_PORT ?? 3000);

async function main(): Promise<void> {
  const app = await buildApp();

  const shutdown = async (signal: string): Promise<void> => {
    process.stderr.write(`[findanadvisor-api] received ${signal}, shutting down\n`);
    const timer = setTimeout(() => {
      process.stderr.write("[findanadvisor-api] shutdown timed out, forcing exit\n");
      process.exit(1);
    }, 2000);
    timer.unref();
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      process.stderr.write(`[findanadvisor-api] shutdown error: ${(err as Error).message}\n`);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ port: PORT, host: "0.0.0.0" });
  process.stderr.write(`[findanadvisor-api] listening on http://localhost:${PORT}\n`);
}

main().catch((err) => {
  process.stderr.write(`[findanadvisor-api] fatal: ${(err as Error).message}\n`);
  process.exit(1);
});
