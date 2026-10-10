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

async function request(path: string, method: "GET" | "HEAD", checkDatabase?: () => Promise<void>) {
  const server = createApiServer(fakeClient(true), checkDatabase);
  servers.push(server);

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return fetch(`http://127.0.0.1:${port}${path}`, { method });
}

async function get(path: string, checkDatabase?: () => Promise<void>) {
  return request(path, "GET", checkDatabase);
}

async function head(path: string, checkDatabase?: () => Promise<void>) {
  return request(path, "HEAD", checkDatabase);
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

  it("checks the database on /health/db", async () => {
    let checks = 0;
    const response = await get("/health/db", async () => {
      checks += 1;
    });

    expect(checks).toBe(1);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      databaseReady: true
    });
  });

  it("returns 503 when the database check fails", async () => {
    const response = await get("/health/db", async () => {
      throw new Error("database unavailable");
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      databaseReady: false
    });
  });

  it("checks the database and returns no body for HEAD /health/db", async () => {
    let checks = 0;
    const response = await head("/health/db", async () => {
      checks += 1;
    });

    expect(checks).toBe(1);
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("");
  });

  it("returns 503 for HEAD /health/db when the database check fails", async () => {
    const response = await head("/health/db", async () => {
      throw new Error("database unavailable");
    });

    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toBe("");
  });
});
