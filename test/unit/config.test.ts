import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/utils/config.js";

describe("Config", () => {
  describe("loadConfig", () => {
    const originalVersion = process.env.TAILWIND_DOCS_MCP_DEFAULT_VERSION;

    afterEach(() => {
      if (originalVersion === undefined) {
        // biome-ignore lint/performance/noDelete: must truly unset env var, not set to "undefined"
        delete process.env.TAILWIND_DOCS_MCP_DEFAULT_VERSION;
      } else {
        process.env.TAILWIND_DOCS_MCP_DEFAULT_VERSION = originalVersion;
      }
    });

    it("defaults to v3 when env var is not set", () => {
      // biome-ignore lint/performance/noDelete: must truly unset env var, not set to "undefined"
      delete process.env.TAILWIND_DOCS_MCP_DEFAULT_VERSION;
      const config = loadConfig();
      expect(config.defaultVersion).toBe("v3");
    });

    it("accepts v4 from env var", () => {
      process.env.TAILWIND_DOCS_MCP_DEFAULT_VERSION = "v4";
      const config = loadConfig();
      expect(config.defaultVersion).toBe("v4");
    });

    it("falls back to v3 for invalid version", () => {
      process.env.TAILWIND_DOCS_MCP_DEFAULT_VERSION = "v99";
      const config = loadConfig();
      expect(config.defaultVersion).toBe("v3");
    });

    it("derives dbPath and rawDir from dataDir", () => {
      const config = loadConfig();
      expect(config.dbPath).toBe(`${config.dataDir}/docs.db`);
      expect(config.rawDir).toBe(`${config.dataDir}/raw`);
    });

    it("derives modelCacheDir from dataDir", () => {
      const config = loadConfig();
      expect(config.modelCacheDir).toBe(`${config.dataDir}/models`);
    });

    it("sets embedding model defaults", () => {
      const config = loadConfig();
      expect(config.embeddingModel).toBe("Snowflake/snowflake-arctic-embed-xs");
      expect(config.embeddingDimensions).toBe(384);
      expect(config.queryPrefix).toContain("Represent this sentence");
    });
  });
});
