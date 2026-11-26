import { Schema, model, type InferSchemaType } from 'mongoose';
import { THEME_PREFERENCES } from '@takip/shared';

const permission = { type: String, enum: ['auto', 'approve'] as const };

const settingsSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    theme: { type: String, enum: THEME_PREFERENCES, default: 'dark' },
    notif: {
      blocks: { type: Boolean, default: true },
      motivation: { type: Boolean, default: true },
      penalties: { type: Boolean, default: true },
      journal: { type: Boolean, default: true },
    },
    motivationFreq: { type: String, enum: ['low', 'mid', 'high'], default: 'mid' },
    quietHours: {
      start: { type: String, default: '00:00' },
      end: { type: String, default: '06:30' },
    },
    journalReminder: { type: String, default: '23:00' },
    skipAllowancePerWeek: { type: Number, default: 1, min: 0 },
    mcpPermissions: {
      blockWrite: { ...permission, default: 'auto' },
      blockDelete: { ...permission, default: 'approve' },
      penaltyRuleWrite: { ...permission, default: 'approve' },
      journalRead: { type: Boolean, default: false },
    },
    /** Son başarılı MCP isteği (Claude bağlantısı ekranı) */
    mcpLastAccessAt: { type: Date, default: null },
    mcpLastTool: { type: String, default: null },
  },
  { timestamps: true },
);

export type SettingsDoc = InferSchemaType<typeof settingsSchema>;
export const Settings = model('Settings', settingsSchema);
