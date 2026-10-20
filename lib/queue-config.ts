import { createHash } from "node:crypto";

export const queueName = "verification";
export const queueSchema = "reqtest_jobs" + (process.env.REQTEST_DATA_NAMESPACE ? "_" + createHash("sha256").update(process.env.REQTEST_DATA_NAMESPACE).digest("hex").slice(0, 20) : "");
