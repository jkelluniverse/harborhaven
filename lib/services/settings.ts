import { prisma } from "@/lib/db";

const MARKUP_KEY = "markup_default";
// Placeholder until Chris's real number is known — see KNOWN-LIMITS.md.
const MARKUP_FALLBACK = 1.2;

export async function getMarkupDefault(): Promise<number> {
  const row = await prisma.appSetting.findUnique({ where: { key: MARKUP_KEY } });
  const n = Number(row?.value);
  return Number.isFinite(n) && n > 0 ? n : MARKUP_FALLBACK;
}

export async function setMarkupDefault(value: number): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: MARKUP_KEY },
    update: { value: String(value) },
    create: { key: MARKUP_KEY, value: String(value) },
  });
}
