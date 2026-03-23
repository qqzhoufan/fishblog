import { Hono } from "hono";
import type { Env } from "./types.ts";
import blog from "./routes/blog.ts";
import admin from "./routes/admin.ts";

const app = new Hono<{ Bindings: Env }>();

app.route("/admin", admin);
app.route("/", blog);

export default app;
