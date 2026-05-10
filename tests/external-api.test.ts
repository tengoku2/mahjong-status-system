import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Client } from "discord.js";
import { createApiServer } from "../src/external-api.js";

const servers: ReturnType<typeof createApiServer>[] = [];

function fakeClient(discordReady: boolean): Client {
  return {
    isReady: () => discordReady
  } as unknown as Client;
}

async function get(path: string) {
  const server = createApiServer(fakeClient(true));
  servers.push(server);

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return fetch(`http://127.0.0.1:${port}${path}`);
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        })
    )
  );
});

describe("health endpoint", () => {
  it("returns ok on /health", async () => {
    const response = await get("/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      discordReady: true
    });
  });

  it("returns ok on / for uptime monitors configured without a path", async () => {
    const response = await get("/");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      discordReady: true
    });
  });
});
