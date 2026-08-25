import { afterEach, describe, expect, it, vi } from "vitest";

import { AomiClient } from "../src/client";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AomiClient application-scoped discovery", () => {
  it("passes application and platform filters and normalizes artifact availability", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            {
              name: "somm-agent",
              application_id: 42,
              platform: "somm.finance",
              artifact_ready: false,
              artifact_status: "fetch_backoff",
            },
          ]),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchImpl);
    const client = new AomiClient({
      baseUrl: "http://unit.test",
    });

    await expect(
      client.getApps("session-1", {
        applicationId: 42,
        platforms: ["somm.finance", "community"],
      }),
    ).resolves.toEqual([
      {
        name: "somm-agent",
        applicationId: 42,
        platform: "somm.finance",
        artifactReady: false,
        artifactStatus: "fetch_backoff",
        secrets: [],
      },
    ]);

    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      "http://unit.test/api/thread/apps?platform=somm.finance&platform=community&application_id=42",
    );
  });

  it("routes model discovery by application id", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Promise.resolve(new Response(JSON.stringify(["gpt-5"]))),
    );
    vi.stubGlobal("fetch", fetchImpl);
    const client = new AomiClient({
      baseUrl: "http://unit.test",
    });

    await client.getModels("session-1", { applicationId: 2936606 });

    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      "http://unit.test/api/thread/models?application_id=2936606",
    );
  });
});
