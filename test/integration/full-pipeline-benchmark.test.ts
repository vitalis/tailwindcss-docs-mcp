import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Embedder } from "../../src/pipeline/embedder.js";
import type { Database } from "../../src/storage/database.js";
import { createDatabase } from "../../src/storage/database.js";
import type { SearchResult } from "../../src/storage/search.js";
import { hybridSearch } from "../../src/storage/search.js";
import { handleCheckStatus } from "../../src/tools/check-status.js";
import { handleFetchDocs } from "../../src/tools/fetch-docs.js";
import type { TailwindVersion } from "../../src/utils/config.js";
import { loadConfig } from "../../src/utils/config.js";

const TEST_DIR = "/tmp/tailwindcss-docs-mcp-benchmark";

// ---------------------------------------------------------------------------
// Query suite & helpers
// ---------------------------------------------------------------------------

interface QueryCase {
  query: string;
  expectedDoc: string;
  maxRank: number;
}

/**
 * Query suite for search accuracy measurement.
 *
 * Organized by realistic query source:
 * - **LLM-style**: Verbose, full-context queries that AI agents construct
 * - **Human-style**: Shorter, conversational queries from developers
 * - **Class-name**: Queries containing exact Tailwind utility class names
 *
 * `maxRank` is the maximum acceptable position for the expected doc (1-indexed).
 */
const QUERY_SUITE: QueryCase[] = [
  // ── LLM-style queries (verbose, full-context) ──────────────────────────
  // AI agents construct detailed queries with full context.
  {
    query: "Tailwind CSS utility class for controlling an element's padding",
    expectedDoc: "Padding",
    maxRank: 3,
  },
  {
    query: "How to change the background color of an element on hover in Tailwind CSS",
    expectedDoc: "Background Color",
    maxRank: 3,
  },
  {
    query: "Tailwind CSS utility for setting font weight to bold or semibold",
    expectedDoc: "Font Weight",
    maxRank: 3,
  },
  {
    query: "How to vertically center items in a flex container using Tailwind CSS",
    expectedDoc: "Align Items",
    maxRank: 5,
  },
  {
    query: "Tailwind CSS responsive design breakpoints and media queries",
    expectedDoc: "Responsive Design",
    maxRank: 3,
  },
  {
    query: "How to configure dark mode in Tailwind CSS",
    expectedDoc: "Dark Mode",
    maxRank: 3,
  },
  {
    query: "Tailwind CSS utility for creating a three-column grid layout",
    expectedDoc: "Grid Template Columns",
    maxRank: 3,
  },
  {
    query: "Tailwind CSS utility for controlling element width to full or auto",
    expectedDoc: "Width",
    maxRank: 3,
  },
  {
    query: "Tailwind CSS classes for adding border radius to round element corners",
    expectedDoc: "Border Radius",
    maxRank: 3,
  },
  {
    query: "Tailwind CSS animation utilities for animating elements on page load",
    expectedDoc: "Animation",
    maxRank: 5,
  },
  {
    query: "Tailwind CSS utility for controlling z-index stacking order",
    expectedDoc: "Z-Index",
    maxRank: 3,
  },
  {
    query: "Tailwind CSS class for making an element sticky when scrolling",
    expectedDoc: "Position",
    maxRank: 5,
  },
  {
    query: "Tailwind CSS transition duration utilities for hover effects",
    expectedDoc: "Transition Duration",
    maxRank: 3,
  },
  {
    query: "Tailwind CSS utility for setting text color",
    expectedDoc: "Text Color",
    maxRank: 3,
  },
  {
    query: "Tailwind CSS utility for controlling overflow behavior hidden and scroll",
    expectedDoc: "Overflow",
    maxRank: 3,
  },
  {
    query: "Tailwind CSS flex direction utility for column layout",
    expectedDoc: "Flex Direction",
    maxRank: 3,
  },

  // ── Human-style queries (short, conversational) ─────────────────────────
  // Developers typing naturally into their editor or chat.
  { query: "tailwind padding classes", expectedDoc: "Padding", maxRank: 3 },
  { query: "dark mode tailwind", expectedDoc: "Dark Mode", maxRank: 3 },
  {
    query: "tailwind grid 3 columns",
    expectedDoc: "Grid Template Columns",
    maxRank: 3,
  },
  {
    query: "how to center a div tailwind",
    expectedDoc: "Align Items",
    maxRank: 10,
  },
  { query: "tailwind border radius", expectedDoc: "Border Radius", maxRank: 3 },
  { query: "tailwind opacity", expectedDoc: "Opacity", maxRank: 3 },
  { query: "tailwind z-index", expectedDoc: "Z-Index", maxRank: 3 },
  { query: "tailwind font size classes", expectedDoc: "Font Size", maxRank: 3 },
  {
    query: "tailwind space between items",
    expectedDoc: "Space Between",
    maxRank: 5,
  },
  { query: "tailwind box shadow", expectedDoc: "Box Shadow", maxRank: 3 },
  { query: "tailwind max width", expectedDoc: "Max-Width", maxRank: 3 },
  {
    query: "tailwind visibility hidden",
    expectedDoc: "Visibility",
    maxRank: 5,
  },
  { query: "tailwind margin auto center", expectedDoc: "Margin", maxRank: 5 },
  {
    query: "tailwind transition hover",
    expectedDoc: "Transition Duration",
    maxRank: 5,
  },

  // ── Class-name queries (exact utility + context) ────────────────────────
  // Users paste a class name and ask what it does.
  {
    query: "what does pt-6 do in tailwind",
    expectedDoc: "Padding",
    maxRank: 3,
  },
  { query: "tailwind text-lg class", expectedDoc: "Font Size", maxRank: 5 },
  {
    query: "bg-blue-500 tailwind background",
    expectedDoc: "Background Color",
    maxRank: 5,
  },
  { query: "mx-auto tailwind centering", expectedDoc: "Margin", maxRank: 5 },
  {
    query: "rounded-lg tailwind class",
    expectedDoc: "Border Radius",
    maxRank: 3,
  },
  {
    query: "grid-cols-3 tailwind grid",
    expectedDoc: "Grid Template Columns",
    maxRank: 5,
  },
  {
    query: "flex-col tailwind layout",
    expectedDoc: "Flex Direction",
    maxRank: 5,
  },
  { query: "gap-4 tailwind spacing", expectedDoc: "Gap", maxRank: 5 },
];

/** Find the 1-indexed rank of `expectedDoc` in results. Returns 0 if not found. */
function findDocRank(results: SearchResult[], expectedDoc: string): number {
  const needle = expectedDoc.toLowerCase();
  for (let i = 0; i < results.length; i++) {
    if (results[i].docTitle.toLowerCase().includes(needle)) return i + 1;
  }
  return 0;
}

/** Compute the p-th percentile from an array of numbers. */
function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

interface AccuracyResult {
  rank: number;
  latencyMs: number;
  failure: string | null;
}

/** Run a single query and evaluate accuracy. */
async function evaluateQuery(
  db: Database,
  embedder: Embedder,
  { query, expectedDoc, maxRank }: QueryCase,
  version: TailwindVersion,
  limit: number,
): Promise<AccuracyResult> {
  const t0 = performance.now();
  const results = await hybridSearch(db, embedder, { query, version, limit });
  const latencyMs = performance.now() - t0;
  const rank = findDocRank(results, expectedDoc);

  let failure: string | null = null;
  if (rank === 0 || rank > maxRank) {
    const got = results
      .slice(0, 5)
      .map((r, i) => `  ${i + 1}. ${r.docTitle}`)
      .join("\n");
    failure = `MISS: "${query}" — expected "${expectedDoc}" in top ${maxRank}, rank=${rank || "NOT FOUND"}\n${got}`;
  }

  return { rank, latencyMs, failure };
}

/** Aggregate accuracy metrics from individual query results. */
function computeAccuracyMetrics(results: AccuracyResult[], n: number) {
  let top1 = 0;
  let top3 = 0;
  let top5 = 0;
  let rrSum = 0;

  for (const { rank } of results) {
    if (rank === 1) top1++;
    if (rank >= 1 && rank <= 3) top3++;
    if (rank >= 1 && rank <= 5) top5++;
    if (rank >= 1) rrSum += 1 / rank;
  }

  return {
    mrr: rrSum / n,
    top1Recall: top1 / n,
    top3Recall: top3 / n,
    top5Recall: top5 / n,
    top1,
    top3,
    top5,
  };
}

/** Log per-query accuracy detail to stderr. */
async function logQueryDetail(
  db: Database,
  embedder: Embedder,
  version: TailwindVersion,
  failures: string[],
): Promise<void> {
  console.error("\n--- Search accuracy detail ---");
  for (const { query, expectedDoc } of QUERY_SUITE) {
    const results = await hybridSearch(db, embedder, {
      query,
      version,
      limit: 10,
    });
    const rank = findDocRank(results, expectedDoc);
    const marker = rank === 1 ? "OK" : rank <= 3 ? "ok" : rank <= 5 ? ".." : "MISS";
    console.error(
      `  [${marker.padEnd(4)}] "${query}" -> #${rank || "-"} (expected: ${expectedDoc})`,
    );
  }
  if (failures.length > 0) {
    console.error("\n--- FAILURES ---");
    for (const f of failures) console.error(f);
  }
  console.error("");
}

// ---------------------------------------------------------------------------
// Benchmark test suite
// ---------------------------------------------------------------------------

/**
 * Full end-to-end pipeline benchmark.
 *
 * Downloads the real ONNX model, fetches real docs from GitHub,
 * indexes everything, and benchmarks search accuracy + latency.
 *
 * Gated behind RUN_FULL_BENCHMARK=1 — takes 2-5 minutes depending on network.
 *
 *   RUN_FULL_BENCHMARK=1 bun run test test/integration/full-pipeline-benchmark.test.ts
 */
describe.skipIf(!process.env.RUN_FULL_BENCHMARK)(
  "Full pipeline benchmark",
  { timeout: 300_000 },
  () => {
    let db: Database;
    let embedder: Embedder;
    const config = {
      ...loadConfig(),
      dataDir: TEST_DIR,
      dbPath: join(TEST_DIR, "docs.db"),
      rawDir: join(TEST_DIR, "raw"),
      modelCacheDir: join(TEST_DIR, "models"),
    };

    const metrics: Record<string, string | number> = {};

    beforeAll(async () => {
      rmSync(TEST_DIR, { recursive: true, force: true });
      mkdirSync(TEST_DIR, { recursive: true });
      db = await createDatabase(config);
    });

    afterAll(() => {
      db?.close();

      console.error("\n┌─────────────────────────────────────────────┐");
      console.error("│         BENCHMARK RESULTS                   │");
      console.error("├─────────────────────────────────────────────┤");
      for (const [key, value] of Object.entries(metrics)) {
        console.error(`│  ${key.padEnd(25)} ${String(value).padStart(15)} │`);
      }
      console.error("└─────────────────────────────────────────────┘\n");

      rmSync(TEST_DIR, { recursive: true, force: true });
    });

    it("downloads and loads the embedding model", async () => {
      const { createEmbedder } = await import("../../src/pipeline/embedder.js");

      const t0 = performance.now();
      embedder = await createEmbedder(config);
      metrics["Model load (ms)"] = Math.round(performance.now() - t0);

      expect(embedder.isReady()).toBe(true);

      const vector = await embedder.embed("Tailwind CSS padding utility");
      expect(vector).toBeInstanceOf(Float32Array);
      expect(vector.length).toBe(384);

      let mag = 0;
      for (let i = 0; i < vector.length; i++) mag += vector[i] * vector[i];
      expect(Math.sqrt(mag)).toBeCloseTo(1.0, 3);
    });

    it("fetches and indexes all v4 docs", async () => {
      const t0 = performance.now();
      const result = await handleFetchDocs({ version: "v4" }, config, db, embedder);
      const elapsed = performance.now() - t0;

      metrics["Index time (ms)"] = Math.round(elapsed);
      metrics.Documents = result.docCount;
      metrics.Chunks = result.chunkCount;
      metrics["Docs/sec"] = (result.docCount / (elapsed / 1000)).toFixed(1);
      metrics["Chunks/sec"] = (result.chunkCount / (elapsed / 1000)).toFixed(1);

      expect(result.docCount).toBeGreaterThan(50);
      expect(result.chunkCount).toBeGreaterThan(200);

      const status = handleCheckStatus({ version: "v4" }, db, "ready");
      expect(status.indexed).toBe(true);
      expect(status.versions[0].doc_count).toBe(result.docCount);
      expect(status.versions[0].chunk_count).toBe(result.chunkCount);
    });

    it("search accuracy: relevance and ranking with real embeddings", async () => {
      const evalResults: AccuracyResult[] = [];
      for (const qc of QUERY_SUITE) {
        evalResults.push(await evaluateQuery(db, embedder, qc, "v4", 10));
      }

      const n = QUERY_SUITE.length;
      const acc = computeAccuracyMetrics(evalResults, n);
      const latencies = evalResults.map((r) => r.latencyMs);
      const failures = evalResults.map((r) => r.failure).filter((f): f is string => f !== null);

      // Record accuracy metrics
      metrics.MRR = acc.mrr.toFixed(3);
      metrics["Top-1 recall"] = `${(acc.top1Recall * 100).toFixed(0)}% (${acc.top1}/${n})`;
      metrics["Top-3 recall"] = `${(acc.top3Recall * 100).toFixed(0)}% (${acc.top3}/${n})`;
      metrics["Top-5 recall"] = `${(acc.top5Recall * 100).toFixed(0)}% (${acc.top5}/${n})`;

      // Record latency metrics
      metrics["Avg search (ms)"] = Math.round(latencies.reduce((a, b) => a + b, 0) / n);
      metrics["P50 search (ms)"] = Math.round(percentile(latencies, 50));
      metrics["P99 search (ms)"] = Math.round(percentile(latencies, 99));

      await logQueryDetail(db, embedder, "v4", failures);

      // Hard gates
      expect(
        acc.top3Recall,
        `Top-3 recall ${(acc.top3Recall * 100).toFixed(0)}% below 80% threshold`,
      ).toBeGreaterThanOrEqual(0.8);
      expect(
        acc.top5Recall,
        `Top-5 recall ${(acc.top5Recall * 100).toFixed(0)}% below 88% threshold`,
      ).toBeGreaterThanOrEqual(0.88);
      expect(acc.mrr, `MRR ${acc.mrr.toFixed(3)} below 0.7 threshold`).toBeGreaterThanOrEqual(0.7);
    });

    it("incremental re-index skips unchanged content", async () => {
      const statusBefore = handleCheckStatus({ version: "v4" }, db, "ready");
      const chunksBefore = statusBefore.versions[0].chunk_count;

      const t0 = performance.now();
      const result = await handleFetchDocs({ version: "v4" }, config, db, embedder);
      const elapsed = performance.now() - t0;

      metrics["Re-index time (ms)"] = Math.round(elapsed);

      expect(result.docCount).toBe(statusBefore.versions[0].doc_count);
      expect(result.chunkCount).toBe(chunksBefore);

      const firstRunMs = metrics["Index time (ms)"] as number;
      expect(elapsed).toBeLessThan(firstRunMs * 0.5);
    });

    it("captures database size", () => {
      const dbFile = config.dbPath;
      if (existsSync(dbFile)) {
        const sizeMB = statSync(dbFile).size / (1024 * 1024);
        metrics["DB size (MB)"] = sizeMB.toFixed(2);
      }
    });
  },
);
