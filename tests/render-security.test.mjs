import test from "node:test";
import assert from "node:assert/strict";
import { marked } from "marked";
import { sanitizeContent } from "../src/templates/sanitize.ts";
import { layout } from "../src/templates/layout.ts";
import { categoryEditorPage, categoryListPage } from "../src/templates/admin.ts";

test("Markdown preserves ordinary formatting, links, images, and task lists", async () => {
  const html = sanitizeContent(await marked("# Title\n\n**bold** [link](https://example.com) ![alt](https://example.com/a.png)\n\n- [x] done"));
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /href="https:\/\/example\.com"/);
  assert.match(html, /<img src="https:\/\/example\.com\/a\.png" alt="alt"/);
  assert.match(html, /<input type="checkbox" disabled="disabled" checked="checked"/);
});

test("HTML rendering blocks scripts, event handlers and dangerous URLs", async () => {
  const html = sanitizeContent(await marked('<script>alert(1)</script>\n\n<img src=x onerror="alert(2)">\n\n[click](javascript:alert(3))\n\n<a href="&#x6a;avascript:alert(4)" onclick="evil()">x</a>'));
  assert.doesNotMatch(html, /<script|onerror|onclick|javascript:/i);
  assert.match(html, /<img src="x"/);
  assert.match(html, /<a>click<\/a>/);
});

test("footer keeps links while removing executable content", () => {
  const html = layout("Home", "content", { blog_footer: '<a href="https://example.com" target="_blank">Link</a><img src=x onerror="evil()"><script>evil()</script>' });
  assert.match(html, /<footer><a href="https:\/\/example\.com" target="_blank" rel="noopener noreferrer">Link<\/a><img src="x" \/><\/footer>/);
  assert.doesNotMatch(html, /onerror|evil\(\)/);
});

test("legacy malformed category sort values cannot inject HTML into admin", () => {
  const bad = '\"><img src=x onerror=alert(1)>';
  const category = { id: 1, name: "cat", slug: "cat", parent_id: null, sort_order: bad, children: [] };
  for (const html of [categoryListPage([category]), categoryEditorPage(category, [])]) {
    assert.doesNotMatch(html, /<img src=x onerror/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  }
});
