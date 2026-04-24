import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { invariant } from "@epic-web/invariant";
import { type Advisor } from "../matcher/types.js";
import { AdvisorsArraySchema } from "./schema.js";

export function parseAdvisors(raw: unknown): readonly Advisor[] {
  const result = AdvisorsArraySchema.safeParse(raw);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const path = firstIssue?.path.join(".") ?? "(root)";
    const message = firstIssue?.message ?? "unknown validation error";
    throw new Error(`Invalid advisors dataset at "${path}": ${message}`);
  }
  return Object.freeze(result.data as Advisor[]);
}

let cached: readonly Advisor[] | null = null;

export function getAdvisors(): readonly Advisor[] {
  if (cached !== null) return cached;
  const here = dirname(fileURLToPath(import.meta.url));
  const jsonPath = resolve(here, "advisors.json");
  let raw: unknown;
  try {
    const text = readFileSync(jsonPath, "utf8");
    raw = JSON.parse(text);
  } catch (err) {
    throw new Error(`Unable to read advisors dataset at ${jsonPath}: ${(err as Error).message}`);
  }
  const advisors = parseAdvisors(raw);
  invariant(advisors.length > 0, "advisors dataset must contain at least one advisor");
  cached = advisors;
  return cached;
}
