import type { Context } from "hono";
import type { Env } from "../types.ts";
import { enqueueNotification, processNotificationBatch, type NotificationInput } from "./notifications.ts";

/** Queueing and delivery must never prevent an already-saved comment or reply. */
export async function dispatchNotification(c: Context<{ Bindings: Env }>, input: NotificationInput): Promise<void> {
  try {
    if (!await enqueueNotification(c.env, input)) return;
    dispatchPendingNotifications(c);
  } catch {
    // Never log the exception: it could contain an email address or API key.
    console.error("Unable to queue an email notification.");
  }
}

export function dispatchPendingNotifications(c: Context<{ Bindings: Env }>): void {
  try {
    c.executionCtx.waitUntil(processNotificationBatch(c.env).catch(() => {
      console.error("Unable to process email notifications.");
    }));
  } catch {
    // Tests or local callers may not provide an execution context. The queued
    // work remains available through the administrator's retry action.
  }
}
