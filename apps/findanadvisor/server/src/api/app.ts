import Fastify, { type FastifyInstance } from "fastify";
import { createMcpClient, type MatchAdvisorsClient } from "./mcp-client.js";
import { investorProfileJsonSchema } from "./schemas/investor-profile.js";

type Deps = {
  mcpClient: MatchAdvisorsClient;
};

export async function buildApp(overrides: Partial<Deps> = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: overrides.mcpClient ? false : { level: "info" },
  });

  const mcpClient = overrides.mcpClient ?? (await createMcpClient());

  app.post(
    "/api/match-advisors",
    {
      schema: {
        body: investorProfileJsonSchema,
      },
    },
    async (request, reply) => {
      try {
        const structured = await mcpClient.callMatch(request.body);
        return reply.code(200).send(structured);
      } catch (err) {
        request.log.error(err);
        return reply.code(500).send({ error: (err as Error).message || "MCP tool failed" });
      }
    },
  );

  app.addHook("onClose", async () => {
    await mcpClient.close();
  });

  return app;
}
