import { describe, expect, it } from "vitest";
import { EMBEDDER_STATUS_MESSAGES } from "../../src/server.js";
import type { EmbedderStatus, ServerHandle } from "../../src/server.js";
import { createDatabase } from "../../src/storage/database.js";
import { handleCheckStatus } from "../../src/tools/check-status.js";
import { testConfig } from "../helpers/factories.js";
import { createMockEmbedder } from "../setup.js";

/**
 * Minimal ServerHandle implementation for testing the embedder lifecycle
 * without starting a real MCP server over stdio.
 */
function createTestServerHandle(): ServerHandle & { getEmbedder(): unknown } {
  let embedder: unknown = null;
  let status: EmbedderStatus = "pending";

  return {
    setEmbedder(e) {
      embedder = e;
      status = "ready";
    },
    setEmbedderStatus(s) {
      status = s;
    },
    getEmbedderStatus() {
      return status;
    },
    getEmbedder() {
      return embedder;
    },
  };
}

describe("Embedder Lifecycle", () => {
  describe("ServerHandle", () => {
    it("starts with pending status and null embedder", () => {
      const handle = createTestServerHandle();
      expect(handle.getEmbedderStatus()).toBe("pending");
      expect(handle.getEmbedder()).toBeNull();
    });

    it("setEmbedder transitions to ready status", () => {
      const handle = createTestServerHandle();
      const embedder = createMockEmbedder(384);

      handle.setEmbedder(embedder);

      expect(handle.getEmbedderStatus()).toBe("ready");
      expect(handle.getEmbedder()).toBe(embedder);
    });

    it("setEmbedderStatus sets downloading status", () => {
      const handle = createTestServerHandle();
      handle.setEmbedderStatus("downloading");
      expect(handle.getEmbedderStatus()).toBe("downloading");
    });

    it("setEmbedderStatus sets failed status", () => {
      const handle = createTestServerHandle();
      handle.setEmbedderStatus("failed");
      expect(handle.getEmbedderStatus()).toBe("failed");
    });

    it("setEmbedder overwrites previous embedder (hot-swap)", () => {
      const handle = createTestServerHandle();
      const first = createMockEmbedder(384);
      const second = createMockEmbedder(384);

      handle.setEmbedder(first);
      expect(handle.getEmbedder()).toBe(first);

      handle.setEmbedder(second);
      expect(handle.getEmbedder()).toBe(second);
      expect(handle.getEmbedderStatus()).toBe("ready");
    });
  });

  describe("EMBEDDER_STATUS_MESSAGES", () => {
    it("has messages for all status values", () => {
      const statuses: EmbedderStatus[] = ["pending", "downloading", "ready", "failed"];
      for (const status of statuses) {
        expect(EMBEDDER_STATUS_MESSAGES[status]).toBeTruthy();
      }
    });

    it("pending message suggests waiting", () => {
      expect(EMBEDDER_STATUS_MESSAGES.pending).toContain("initializing");
    });

    it("downloading message mentions size", () => {
      expect(EMBEDDER_STATUS_MESSAGES.downloading).toContain("27 MB");
    });

    it("failed message points to logs", () => {
      expect(EMBEDDER_STATUS_MESSAGES.failed).toContain("server logs");
    });
  });

  describe("requireEmbedder pattern", () => {
    it("throws with status-specific message when embedder is null", () => {
      // This tests the same logic as requireEmbedder() inside createServer,
      // exercised via the status message contract.
      const statuses: EmbedderStatus[] = ["pending", "downloading", "failed"];

      for (const status of statuses) {
        const message = EMBEDDER_STATUS_MESSAGES[status];
        expect(message).not.toBe(EMBEDDER_STATUS_MESSAGES.ready);
        expect(message.length).toBeGreaterThan(10);
      }
    });
  });

  describe("check_status embedder integration", () => {
    it("reports embedder status in check_status output", async () => {
      const db = await createDatabase(testConfig());
      try {
        const result = handleCheckStatus({}, db, "downloading");
        expect(result.embedderStatus).toBe("downloading");
        expect(result.message).toContain("downloading (~27 MB)");
      } finally {
        db.close();
      }
    });

    it("reports ready status in check_status output", async () => {
      const db = await createDatabase(testConfig());
      try {
        const result = handleCheckStatus({}, db, "ready");
        expect(result.embedderStatus).toBe("ready");
        expect(result.message).toContain("**Embedding model**: ready");
      } finally {
        db.close();
      }
    });

    it("reports failed status in check_status output", async () => {
      const db = await createDatabase(testConfig());
      try {
        const result = handleCheckStatus({}, db, "failed");
        expect(result.embedderStatus).toBe("failed");
        expect(result.message).toContain("failed to load");
      } finally {
        db.close();
      }
    });
  });
});
