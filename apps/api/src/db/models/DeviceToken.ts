import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { clock } from '../../services/clock.js';

const deviceTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** Bir token aynı anda tek kullanıcıya aittir (cihazda başka hesapla giriş yapılırsa taşınır). */
    expoPushToken: { type: String, required: true, unique: true },
    platform: { type: String, enum: ['android', 'ios'], default: 'android' },
    lastSeenAt: { type: Date, default: () => clock.now() },
    createdAt: { type: Date, default: () => clock.now() },
    updatedAt: { type: Date, default: () => clock.now() },
  },
  { timestamps: { currentTime: () => clock.now() } },
);
deviceTokenSchema.index({ userId: 1 });

export type DeviceTokenDoc = HydratedDocument<InferSchemaType<typeof deviceTokenSchema>>;
export const DeviceToken = model('DeviceToken', deviceTokenSchema);
