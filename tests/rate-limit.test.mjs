import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { Hono } from "hono";
import { checkRateLimit } from "../src/middleware/rate-limit.ts";
import blog from "../src/routes/blog.ts";

function makeDb() {
  const sqlite = new DatabaseSync(":memory:");
  return {
    sqlite,
    prepare(sql) {
      let args = [];
      const prepared = {
        bind(...values) { args = values; return prepared; },
        async run() { return sqlite.prepare(sql).run(...args); },
        async first() { return sqlite.prepare(sql).get(...args) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      };
      return prepared;
    },
  };
}

test("limits are atomic and shared between instances, isolate IPs and actions, and clean up expired buckets", async () => {
  const db = makeDb();
  const app = new Hono();
  app.get("/:action", async (c) => {
    const retry = await checkRateLimit(c, c.req.param("action"), 3, 600);
    return c.text(String(retry), retry ? 429 : 200);
  });
  const env = { DB: db };
  const request = (action, ip) => app.request(`https://example.test/${action}`, { headers: { "CF-Connecting-IP": ip } }, env);
  const responses = await Promise.all(Array.from({ length: 4 }, () => request("login", "192.0.2.1")));
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 200, 200, 429]);
  assert.equal((await request("login", "192.0.2.2")).status, 200);
  assert.equal((await request("comment", "192.0.2.1")).status, 200);
  db.sqlite.prepare("UPDATE request_rate_limits SET expires_at = 0").run();
  assert.equal((await request("login", "192.0.2.1")).status, 200);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM request_rate_limits").get().count, 1);
  db.sqlite.close();
});

test("local requests without a Cloudflare IP remain usable and do not need a database", async () => {
  const app = new Hono();
  app.get("/", async (c) => c.text(String(await checkRateLimit(c, "login", 1, 600))));
  for (let i = 0; i < 3; i++) {
    assert.equal(await (await app.request("http://localhost/")).text(), "0");
  }
});

test("guest comments are accepted normally and blocked after the per-IP limit", async () => {
  const db = makeDb();
  db.sqlite.exec(`
    CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE posts (id INTEGER PRIMARY KEY, slug TEXT, category_id INTEGER, published INTEGER);
    CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE comments (id INTEGER PRIMARY KEY, post_id INTEGER, author TEXT, content TEXT);
    INSERT INTO posts (id, slug, published) VALUES (1, 'example', 1);
  `);
  const app = new Hono();
  app.route("/", blog);
  const send = (ip) => app.request("https://example.test/post/example/comment", {
    method: "POST",
    headers: { "CF-Connecting-IP": ip },
    body: new URLSearchParams({ author: "Guest", content: "Hello", t: "1" }),
  }, { DB: db });
  for (let i = 0; i < 20; i++) assert.equal((await send("192.0.2.1")).status, 302);
  const blocked = await send("192.0.2.1");
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM comments").get().count, 20);
  assert.equal((await send("192.0.2.2")).status, 302);
  db.sqlite.close();
});
