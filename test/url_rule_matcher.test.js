const test = require("node:test");
const assert = require("node:assert/strict");

const { matchesPathPattern, matchesUrlRules } = require("../renderer/browser/url_rule_matcher");

test("matchesPathPattern supports wildcard paths", () => {
  assert.equal(matchesPathPattern("/g/12345/", "/g/*"), true);
  assert.equal(matchesPathPattern("/g/12345/page-2", "/g/*"), true);
  assert.equal(matchesPathPattern("/tag/test", "/g/*"), false);
});

test("matchesUrlRules enforces host and protocol", () => {
  const rules = { hosts: ["example.com"], pathPatterns: ["/g/*"] };
  assert.equal(matchesUrlRules("https://example.com/g/12345/", rules), true);
  assert.equal(matchesUrlRules("http://example.com/g/12345/", rules), true);
  assert.equal(matchesUrlRules("https://sub.example.com/g/12345/", rules), false);
  assert.equal(matchesUrlRules("file:///g/12345/", rules), false);
  assert.equal(matchesUrlRules("not-a-url", rules), false);
});
