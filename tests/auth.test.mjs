import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { Hono } from "hono";
import admin from "../src/routes/admin.ts";
import { adminAuth, sha256 } from "../src/middleware/auth.ts";

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
      };
      return prepared;
    },
  };
}

function makeApp() {
  const app = new Hono();
  app.route("/admin", admin);
  app.get("/protected", adminAuth, (c) => c.text("protected"));
  return app;
}

async function login(app, env, protocol = "https") {
  return app.request(`${protocol}://example.test/admin/login`, {
    method: "POST",
    body: new URLSearchParams({ username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD }),
  }, env);
}

function sessionCookie(response) {
  return response.headers.get("set-cookie").split(";")[0];
}

test("sessions are random, expire server-side, and can be revoked", async () => {
  const db = makeDb();
  const env = { DB: db, ADMIN_USERNAME: "admin", ADMIN_PASSWORD: "strong password" };
  const app = makeApp();
  const first = await login(app, env);
  const second = await login(app, env);
  assert.equal(first.status, 302);
  assert.match(first.headers.get("set-cookie"), /; Secure/);
  const firstCookie = sessionCookie(first);
  const secondCookie = sessionCookie(second);
  assert.notEqual(firstCookie, secondCookie);
  assert.equal((await app.request("https://example.test/protected", { headers: { cookie: firstCookie } }, env)).status, 200);
  await app.request("https://example.test/admin/logout", { headers: { cookie: firstCookie } }, env);
  assert.equal((await app.request("https://example.test/protected", { headers: { cookie: firstCookie } }, env)).status, 302);
  assert.equal((await app.request("https://example.test/protected", { headers: { cookie: secondCookie } }, env)).status, 200);
  db.sqlite.prepare("UPDATE admin_sessions SET expires_at = 0").run();
  assert.equal((await app.request("https://example.test/protected", { headers: { cookie: secondCookie } }, env)).status, 302);
  db.sqlite.close();
});

test("password changes and legacy fixed cookies cannot authenticate; local HTTP still works", async () => {
  const db = makeDb();
  const env = { DB: db, ADMIN_USERNAME: "admin", ADMIN_PASSWORD: "strong password" };
  const app = makeApp();
  const response = await login(app, env, "http");
  assert.doesNotMatch(response.headers.get("set-cookie"), /; Secure/);
  const cookie = sessionCookie(response);
  assert.equal((await app.request("http://example.test/protected", { headers: { cookie } }, env)).status, 200);
  const rotatedEnv = { ...env, ADMIN_PASSWORD: "different password" };
  assert.equal((await app.request("http://example.test/protected", { headers: { cookie } }, rotatedEnv)).status, 302);
  const legacyToken = await sha256(`fishblog:${env.ADMIN_USERNAME}:${await sha256(env.ADMIN_PASSWORD)}`);
  assert.equal((await app.request("http://example.test/protected", { headers: { cookie: `fishblog_token=${legacyToken}` } }, env)).status, 302);
  db.sqlite.close();
});

test("repeated failed logins are limited per client and recover when the window expires", async () => {
  const db = makeDb();
  const env = { DB: db, ADMIN_USERNAME: "admin", ADMIN_PASSWORD: "strong password" };
  const app = makeApp();
  const tryLogin = (password, ip) => app.request("https://example.test/admin/login", {
    method: "POST",
    headers: { "CF-Connecting-IP": ip },
    body: new URLSearchParams({ username: "admin", password }),
  }, env);
  for (let i = 0; i < 30; i++) assert.equal((await tryLogin("wrong", "192.0.2.1")).status, 401);
  const blocked = await tryLogin("wrong", "192.0.2.1");
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  assert.equal((await tryLogin("strong password", "192.0.2.2")).status, 302);
  db.sqlite.prepare("UPDATE request_rate_limits SET expires_at = 0").run();
  assert.equal((await tryLogin("strong password", "192.0.2.1")).status, 302);
  db.sqlite.close();
});

test("empty or missing administrator secrets cannot authenticate", async () => {
  const db = makeDb();
  const app = makeApp();
  for (const env of [
    { DB: db, ADMIN_USERNAME: "", ADMIN_PASSWORD: "" },
    { DB: db },
  ]) {
    const response = await app.request("https://example.test/admin/login", {
      method: "POST",
      body: new URLSearchParams({ username: "", password: "" }),
    }, env);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("set-cookie"), null);
  }
  db.sqlite.close();
});
