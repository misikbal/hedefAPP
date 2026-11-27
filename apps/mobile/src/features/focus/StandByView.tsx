import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { focusLevel, formatClock, formatNumber, type FocusSession } from '@takip/shared';
import { nowTimeLocal, todayEyebrow, todayLocal } from '@/lib/date';
import { fonts } from '@/theme/typography';
import { StandByScene, type StandByStatus } from './StandByScene';
import { sceneLabel, sceneVariant } from './mountainScene';
import { ZOOM_BIRD, ZOOM_WIDE, hourOfClock, isNightHour } from './standbyMath';

/*
 * Odak sekmesinde telefon yan yatırılınca açılan masa saati (Apple StandBy gibi).
 * Gündüz: solda saat + kalan süre kartı, sağda köşeleri yuvarlak dağ penceresi.
 * Gece (22:00–06:00): ekran tam ortadan ikiye bölünür; sol yarıda saat ve dakika alt alta en büyük boyda,
 * sağ yarıda kısılmış dağ. Dokununca düğme görünür; çift dokunuş kamerayı kuş ↔ bütün arazi çevirir.
 * Renkler bilerek temadan bağımsız: masa saati her zaman koyu.
 */

const C = {
  bg: '#0E1116',
  night: '#050607',
  tx: '#ECE8E1',
  mut: '#9AA3AE',
  amber: '#F0A63A',
  glass: 'rgba(255,255,255,0.055)',
  glassLine: 'rgba(255,255,255,0.09)',
  nightAmber: '#F6B65C',
  nightAmber2: '#E39A38',
  nightMut: '#8A5F2A',
};

const upper = (s: string) => s.toLocaleUpperCase('tr-TR');

export interface StandByViewProps {
  now: number;
  session: FocusSession | null;
  planned: number;
  /** 0–1 */
  progress: number;
  remainingMs: number;
  summit: boolean;
  label: string;
  stateText: string;
  mainLabel: string;
  busy: boolean;
  error: string | null;
  onToggle: () => void;
  /** Dağ sahnesi çeşidi */
  sceneSeed: number;
}

export function StandByView(p: StandByViewProps) {
  useKeepAwake();
  const { width: w, height: h } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [zoom, setZoom] = useState<number>(ZOOM_BIRD);
  const [controls, setControls] = useState(false);
  const lastTap = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  const date = new Date(p.now);
  const hhmm = nowTimeLocal(date);
  const [hh, mm] = hhmm.split(':') as [string, string];
  const night = isNightHour(hourOfClock(hhmm));
  const colon = Math.floor(p.now / 1000) % 2 === 0 ? 1 : 0.28;
  const endAt = nowTimeLocal(new Date(p.now + p.remainingMs));
  const dateLabel = todayEyebrow(todayLocal(date));

  const status: StandByStatus = p.session
    ? p.session.status === 'paused'
      ? 'paused'
      : 'running'
    : p.summit
      ? 'done'
      : 'idle';

  const level = focusLevel(p.planned);
  const elev = Math.round(level.altitude * p.progress);
  const peak = `${upper(level.name)} · ${p.planned} DK`;
  const sceneName = sceneLabel(sceneVariant(p.sceneSeed));
  const elevText = `${formatNumber(elev)} / ${formatNumber(level.altitude)} m`;
  const remaining = formatClock(p.remainingMs);
  const showButton = controls || !p.session || p.busy;

  const onTap = () => {
    const t = Date.now();
    if (t - lastTap.current < 300) {
      lastTap.current = 0;
      setZoom((z) => (z > ZOOM_WIDE ? ZOOM_WIDE : ZOOM_BIRD));
      return;
    }
    lastTap.current = t;
    setControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControls(false), 4000);
  };

  const scene = (
    <StandByScene
      plannedMinutes={p.planned}
      progress={p.progress}
      status={status}
      zoom={zoom}
      night={night}
      sceneSeed={p.sceneSeed}
    />
  );

  const chipOverlay = (
    <View style={[styles.chip, night && styles.chipNight]} pointerEvents="none">
      <Text style={[styles.lab, night && { color: C.nightMut }]}>{peak}</Text>
      <Text style={[styles.elev, night && { color: C.nightAmber }]}>{elevText}</Text>
      <Text style={[styles.scene, night && { color: C.nightMut }]}>{sceneName}</Text>
    </View>
  );

  const left = Math.max(insets.left, 0);
  const right = Math.max(insets.right, 0);

  return (
    <Pressable
      accessibilityLabel="Odak saati. Dokununca düğmeler görünür, çift dokunuşla kamera yakınlaşır."
      onPress={onTap}
      style={[styles.root, { backgroundColor: night ? C.night : C.bg }]}
    >
      <StatusBar hidden />
      {night ? (
        <View style={styles.row}>
          <View style={[styles.half, { paddingLeft: left }]}>
            <View accessibilityRole="timer" accessibilityLabel={`Saat ${hh} ${mm}`}>
              <Text
                style={[
                  styles.stack,
                  { fontSize: nf(w, h), lineHeight: nf(w, h) * 0.86, color: C.nightAmber },
                ]}
              >
                {hh}
              </Text>
              <Text
                style={[
                  styles.stack,
                  { fontSize: nf(w, h), lineHeight: nf(w, h) * 0.86, color: C.nightAmber2 },
                ]}
              >
                {mm}
              </Text>
            </View>
            <Text style={[styles.tag, { left: left + 24 }]} numberOfLines={1}>
              {p.label || 'Odak'}
            </Text>
            <Text style={[styles.foot, { left: left + 24 }]}>
              {dateLabel} · bitiş {endAt}
            </Text>
          </View>
          <View style={[styles.half, styles.nightPane, { paddingRight: right }]}>
            {scene}
            {chipOverlay}
            <View style={styles.nightCard}>
              <Text style={[styles.lab, { color: C.nightMut }]}>KALAN</Text>
              <Text style={[styles.nightRem, { fontSize: Math.min(h * 0.12, 56) }]}>{remaining}</Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={[styles.row, { paddingLeft: left, paddingRight: right }]}>
          <View style={styles.dayLeft}>
            <View style={styles.dayChip}>
              <View style={styles.dot} />
              <Text style={styles.dayChipText} numberOfLines={1}>
                {p.label || 'Odak'}
              </Text>
            </View>
            <View>
              <Text
                accessibilityRole="timer"
                style={[styles.big, { fontSize: dayClock(w, h), lineHeight: dayClock(w, h) * 0.92 }]}
              >
                {hh}
                <Text style={{ opacity: colon }}>:</Text>
                {mm}
              </Text>
              <Text style={styles.date}>{dateLabel}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.lab}>KALAN</Text>
              <Text style={[styles.rem, { fontSize: dayClock(w, h) * 0.62 }]}>{remaining}</Text>
              <View style={styles.bar}>
                <View style={[styles.barFill, { width: `${Math.round(p.progress * 100)}%` }]} />
              </View>
              <View style={styles.meta}>
                <Text style={styles.metaText} numberOfLines={1}>
                  {p.stateText}
                </Text>
                <Text style={styles.metaText}>
                  bitiş <Text style={{ color: C.tx }}>{endAt}</Text>
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.dayPane}>
            {scene}
            {chipOverlay}
          </View>
        </View>
      )}

      {showButton ? (
        <View
          style={[styles.controls, { bottom: Math.max(insets.bottom, 0) + 14 }]}
          pointerEvents="box-none"
        >
          {p.error ? <Text style={styles.error}>{p.error}</Text> : null}
          <Pressable
            accessibilityRole="button"
            disabled={p.busy}
            onPress={p.onToggle}
            style={({ pressed }) => [
              styles.button,
              { opacity: p.busy ? 0.6 : pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={styles.buttonText}>{p.mainLabel}</Text>
          </Pressable>
          <Text style={styles.hint}>Çift dokun: yakın / uzak · Dikey çevir: çık</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Gündüz saatinin punto büyüklüğü: sütuna sığar (ölçü ~2,75 em), ekran yüksekliğinin üst sınırıyla */
function dayClock(w: number, h: number): number {
  return Math.max(28, Math.min(h * 0.27, (w * 0.42 - 56) / 2.85));
}

/** Gece yığın saatinin punto büyüklüğü: iki satır ekran yüksekliğine, iki hane yarım genişliğe sığar */
function nf(w: number, h: number): number {
  return Math.max(40, Math.min(h * 0.47, (w * 0.5 - 40) / 1.3));
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  row: { flex: 1, flexDirection: 'row' },
  half: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  nightPane: { alignItems: 'stretch', justifyContent: 'flex-start', overflow: 'hidden' },

  scene: { color: C.mut, fontSize: 11 },
  lab: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.6,
    color: C.mut,
  },
  elev: { fontFamily: fonts.monoMedium, fontSize: 15, color: C.tx },
  chip: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 2,
    borderRadius: 12,
    backgroundColor: 'rgba(14,17,22,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  chipNight: { backgroundColor: 'rgba(6,6,7,0.62)', borderColor: 'rgba(240,166,58,0.18)' },

  // gündüz
  dayLeft: { flex: 42, paddingVertical: 22, paddingLeft: 28, paddingRight: 8, justifyContent: 'space-between' },
  dayChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.glassLine,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFD93D' },
  dayChipText: { fontFamily: fonts.body, fontSize: 13, color: C.tx, flexShrink: 1 },
  big: {
    fontFamily: fonts.displayBold,
    color: C.tx,
    letterSpacing: -2,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  date: { fontFamily: fonts.mono, fontSize: 12, letterSpacing: 1.4, color: C.mut, marginTop: 6 },
  card: {
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.glassLine,
  },
  rem: {
    fontFamily: fonts.displayBold,
    color: C.amber,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  bar: { height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden', marginTop: 2 },
  barFill: { height: '100%', borderRadius: 3, backgroundColor: C.amber },
  meta: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  metaText: { fontFamily: fonts.body, fontSize: 12, color: C.mut, flexShrink: 1 },
  dayPane: {
    flex: 58,
    margin: 12,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  // gece
  stack: {
    fontFamily: fonts.displayBold,
    letterSpacing: -4,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  tag: { position: 'absolute', top: 16, right: 8, fontFamily: fonts.body, fontSize: 12, color: C.nightMut },
  foot: { position: 'absolute', bottom: 16, right: 8, fontFamily: fonts.body, fontSize: 12, color: C.nightMut },
  nightCard: {
    position: 'absolute',
    left: 14,
    bottom: 14,
    minWidth: 120,
    gap: 2,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(6,6,7,0.66)',
    borderWidth: 1,
    borderColor: 'rgba(240,166,58,0.2)',
  },
  nightRem: {
    fontFamily: fonts.displayBold,
    color: C.amber,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },

  // düğme
  controls: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 6 },
  button: {
    minHeight: 48,
    paddingHorizontal: 32,
    borderRadius: 24,
    backgroundColor: C.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontFamily: fonts.bodySemi, fontSize: 16, color: '#0E1116' },
  hint: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: C.mut,
    backgroundColor: 'rgba(14,17,22,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  error: { fontFamily: fonts.body, fontSize: 13, color: '#EE8A73' },
});
