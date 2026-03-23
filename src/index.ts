import { Hono } from "hono";
import type { Env } from "./types.ts";
import { autoMigrate } from "./db/migrate.ts";
import blog from "./routes/blog.ts";
import admin from "./routes/admin.ts";
import api from "./routes/api.ts";

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  await autoMigrate(c.env.DB);
  await next();
});

app.route("/api", api);
app.route("/admin", admin);
app.route("/", blog);

export default app;
