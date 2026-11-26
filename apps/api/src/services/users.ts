import argon2 from 'argon2';
import type { Types } from 'mongoose';
import type { SettingsPatch } from '@takip/shared';
import { Settings, User } from '../db/models/index.js';

export interface UserContext {
  id: Types.ObjectId;
  timezone: string;
}

export async function getSettings(userId: Types.ObjectId | string) {
  const existing = await Settings.findOne({ userId });
  if (existing) return existing;
  return Settings.create({ userId });
}

export async function updateSettings(userId: Types.ObjectId | string, patch: SettingsPatch) {
  const s = await getSettings(userId);
  if (patch.theme) s.theme = patch.theme;
  if (patch.motivationFreq) s.motivationFreq = patch.motivationFreq;
  if (patch.quietHours) s.quietHours = patch.quietHours;
  if (patch.journalReminder) s.journalReminder = patch.journalReminder;
  if (patch.notif) {
    for (const [k, v] of Object.entries(patch.notif)) {
      if (typeof v === 'boolean') s.set(`notif.${k}`, v);
    }
  }
  if (patch.mcpPermissions) {
    for (const [k, v] of Object.entries(patch.mcpPermissions)) {
      if (v !== undefined) s.set(`mcpPermissions.${k}`, v);
    }
  }
  await s.save();
  return s;
}

/** ADMIN_EMAIL/ADMIN_PASSWORD verilmişse ve kullanıcı yoksa ilk kullanıcıyı oluşturur. */
export async function ensureAdminUser(
  email: string | undefined,
  password: string | undefined,
  timezone: string,
): Promise<'created' | 'exists' | 'skipped'> {
  if (!email || !password) return 'skipped';
  const normalized = email.toLowerCase();
  if (await User.exists({ email: normalized })) return 'exists';
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const user = await User.create({ email: normalized, passwordHash, timezone });
  await getSettings(user._id);
  return 'created';
}
