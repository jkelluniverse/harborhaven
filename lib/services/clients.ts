/**
 * Client helpers, ported from the source job module: a near-duplicate guard
 * ("Did you mean…?") so hand-typed client names don't fork into two rows, and
 * an idempotent ensureClient used on job creation.
 */
import { prisma } from "@/lib/db";
import type { Client } from "@prisma/client";

/** Normalize a client name for comparison: lowercase alphanumerics only. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : Math.min(prev, dp[j], dp[j - 1]) + 1;
      prev = tmp;
    }
  }
  return dp[n];
}

/** A close-but-not-exact existing name, for the "Did you mean…?" prompt. */
export function findNearMatch(name: string, existing: { name: string }[]): string | null {
  const target = norm(name);
  if (!target) return null;
  let best: { name: string; d: number } | null = null;
  for (const e of existing) {
    const en = norm(e.name);
    if (!en || en === target) continue;
    const contains = en.includes(target) || target.includes(en);
    const d = levenshtein(target, en);
    const threshold = Math.max(1, Math.floor(Math.min(target.length, en.length) * 0.25));
    if (contains || d <= threshold) {
      if (!best || d < best.d) best = { name: e.name, d };
    }
  }
  return best?.name ?? null;
}

/** Ensure a client row exists for a name (idempotent). Returns the row. */
export async function ensureClient(name: string): Promise<Client | null> {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return null;
  const existing = await prisma.client.findUnique({ where: { name: trimmed } });
  if (existing) return existing;
  return prisma.client.create({ data: { name: trimmed } });
}

export async function createClient(data: {
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}): Promise<Client> {
  return prisma.client.create({
    data: {
      name: data.name.trim(),
      phone: data.phone?.trim() || null,
      email: data.email?.trim() || null,
      notes: data.notes?.trim() || null,
    },
  });
}

export async function updateClient(
  id: number,
  data: { phone?: string | null; email?: string | null; notes?: string | null },
): Promise<Client> {
  return prisma.client.update({
    where: { id },
    data: {
      phone: data.phone?.trim() || null,
      email: data.email?.trim() || null,
      notes: data.notes?.trim() || null,
    },
  });
}
