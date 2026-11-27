/*
 * Yatay odak ekranının (StandBy) saf hesapları. Bazıları UI thread'de (worklet) çalışır;
 * bu yüzden hiçbir dış bağımlılıkları yok.
 */

/** Diorama dünyası (MountainClimb ile aynı) */
export const WORLD_W = 320;
export const WORLD_H = 240;

/** Kamera yakınlığı: 1 = bütün arazi, ZOOM_BIRD = kuşa yakın takip */
export const ZOOM_WIDE = 1;
export const ZOOM_BIRD = 30;
/** Zirvede kamera en çok bu kadar yakın kalır (bayrak ve konfeti görünsün) */
export const ZOOM_SUMMIT_MAX = 3.5;

/** Kuşun diorama birimiyle boyu: dağ (~100 birim) 1/70'i. Gerçek oran ekranda görünmez. */
export const BIRD_HEIGHT = 1.4;
/** Kuş çiziminin kendi birimiyle boyu (ayaktan tepe tüyüne) */
export const BIRD_DRAW_HEIGHT = 20.5;

/** Gece görünümü: 22:00 – 06:00 */
export const NIGHT_FROM_HOUR = 22;
export const NIGHT_TO_HOUR = 6;

export function isNightHour(hour: number): boolean {
  return hour >= NIGHT_FROM_HOUR || hour < NIGHT_TO_HOUR;
}

/** "21:47" → 21 */
export function hourOfClock(hhmm: string): number {
  return Number(hhmm.slice(0, 2));
}

export interface CameraTarget {
  cx: number;
  cy: number;
  /** görünen dünya genişliği */
  vw: number;
  /** yakınlık 1 iken görünen genişlik (kutuya göre) */
  fitW: number;
}

/**
 * Kameranın hedefi. `z` yakınlık, `aspect` kutunun en/boy oranı, (fx, fy) odak noktası.
 * Yakınlık arttıkça merkez, arazi ortasından odak noktasına doğru kayar (z = 3'te tamamen odakta).
 */
export function cameraTarget(z: number, aspect: number, fx: number, fy: number): CameraTarget {
  'worklet';
  const fitW = Math.max(WORLD_W + 8, (WORLD_H + 6) * aspect);
  const vw = fitW / z;
  const vh = vw / aspect;
  const t = Math.min(1, Math.max(0, (z - 1) / 2));
  let cx = 160 + (fx - 160) * t;
  let cy = 122 + (fy - 122) * t;
  cx = vw >= WORLD_W ? 160 : Math.min(WORLD_W - vw / 2, Math.max(vw / 2, cx));
  cy = vh >= WORLD_H ? 122 : Math.min(WORLD_H - vh / 2, Math.max(vh / 2, cy));
  return { cx, cy, vw, fitW };
}

/** Çizgi kalınlığı çarpanı: 3×'e kadar 1, sonra yakınlıkla ters orantılı küçülür. */
export function lineScale(fitW: number, vw: number): number {
  'worklet';
  const zoom = fitW / vw;
  return Math.max(0.03, Math.min(1, 3 / zoom));
}

/** Kare hızından bağımsız yumuşatma katsayısı (0–1): 1 - e^(-dt/τ) */
export function smoothing(dtMs: number, tauMs: number): number {
  'worklet';
  return 1 - Math.exp(-dtMs / tauMs);
}

/** Zirve ve başlangıç iğneleri yakınlaştıkça silinir: 2×'te 1, 6×'te 0 */
export function pinOpacity(zoom: number): number {
  'worklet';
  return Math.min(1, Math.max(0, 1 - (zoom - 2) / 4));
}
