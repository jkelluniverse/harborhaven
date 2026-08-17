import { prisma } from "@/lib/db";

/** App-setting keys and their fallbacks. Values are confirmable placeholders
 *  until Chris's real numbers are known — see KNOWN-LIMITS.md. */
export const SETTING_DEFAULTS = {
  default_markup: "1.2",
  permit_price: "1500",
  permit_payable: "500",
  permit_payee_name: "Doug Prestier",
  square_location_id: "",
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSetting(key: SettingKey): Promise<string> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row?.value ?? SETTING_DEFAULTS[key];
}

export async function getNumberSetting(key: SettingKey): Promise<number> {
  const n = Number(await getSetting(key));
  const fallback = Number(SETTING_DEFAULTS[key]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function setSetting(key: SettingKey, value: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function getMarkupDefault(): Promise<number> {
  return getNumberSetting("default_markup");
}
