const test = require("node:test");
const assert = require("node:assert/strict");

const { createTagManagerService } = require("../main/tag_manager_service");

function createInMemoryStore() {
  let state = {
    schemaVersion: 1,
    updatedAt: "2026-03-02T00:00:00.000Z",
    visibilityRules: {},
    aliasGroups: [],
  };
  return {
    readState: () => ({ ok: true, state: structuredClone(state) }),
    replaceState: (nextState) => {
      state = structuredClone(nextState);
      return { ok: true };
    },
  };
}

test("phase7 performance smoke: resolver remains responsive for large input", () => {
  const service = createTagManagerService({ tagManagerStore: createInMemoryStore() });
  const rawTags = Array.from({ length: 20_000 }, (_, i) => `tag-${i}`);

  const startedAt = process.hrtime.bigint();
  const result = service.resolveForFilter({
    rawTagsByTaxonomy: {
      tags: rawTags,
      characters: [],
      parodies: [],
    },
    query: "tag-199",
  });
  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

  assert.equal(result.ok, true);
  assert.ok(Array.isArray(result.entries));
  assert.ok(elapsedMs < 500, `resolveForFilter took ${elapsedMs.toFixed(2)}ms`);
});
