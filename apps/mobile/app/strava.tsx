import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  STRAVA_ACTIVITY_TYPES,
  STRAVA_ACTIVITY_TYPE_LABELS,
  STRAVA_GOAL_UNIT,
  type StravaActivityType,
  type StravaReturnReason,
  type StravaStatus,
} from '@takip/shared';
import {
  useGoals,
  useStravaConnect,
  useStravaDisconnect,
  useStravaStatus,
  useStravaSync,
  useUpdateStrava,
} from '@/api/hooks';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ErrorCard, Loading, errorMessage } from '@/components/StateViews';
import { SubHeader } from '@/components/SubHeader';
import { Switch } from '@/components/Switch';
import { Txt } from '@/components/Txt';
import { lastAccessLabel } from '@/features/claude/format';
import { useTheme } from '@/theme/ThemeProvider';

const RETURN_URL = 'takip://strava';

const REASON_TEXT: Record<StravaReturnReason, string> = {
  denied: 'Strava izni verilmedi.',
  state: 'Bağlantı isteğinin süresi doldu. Yeniden dene.',
  scope: 'Etkinlikleri okuma izni verilmedi. Yeniden bağlanırken izni açık bırak.',
  exchange: "Strava'dan yanıt alınamadı. Biraz sonra yeniden dene.",
  taken: 'Bu Strava hesabı başka bir kullanıcıya bağlı.',
};

/** `takip://strava?status=...&reason=...` adresinden kullanıcıya gösterilecek metin. */
function returnMessage(status?: string, reason?: string): string | null {
  if (status === 'ok') return 'Strava bağlandı.';
  if (status === 'error')
    return REASON_TEXT[reason as StravaReturnReason] ?? 'Strava bağlantısı kurulamadı.';
  return null;
}

function parseReturn(url: string): string | null {
  const query = url.split('?')[1] ?? '';
  const params = new URLSearchParams(query);
  return returnMessage(params.get('status') ?? undefined, params.get('reason') ?? undefined);
}

function NotConfigured() {
  return (
    <Card>
      <Txt variant="label" color="mut">
        KAPALI
      </Txt>
      <Txt style={{ fontSize: 14, lineHeight: 20 }} color="tx2">
        Strava entegrasyonu sunucuda henüz ayarlanmamış. Sunucuya STRAVA_CLIENT_ID,
        STRAVA_CLIENT_SECRET ve PUBLIC_API_URL değerleri eklenince burada bağlanabilirsin.
      </Txt>
    </Card>
  );
}

function ConnectCard({ onMessage }: { onMessage: (m: string | null) => void }) {
  const connect = useStravaConnect();
  const status = useStravaStatus();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    onMessage(null);
    try {
      const { url } = await connect.mutateAsync();
      const result = await WebBrowser.openAuthSessionAsync(url, RETURN_URL);
      if (result.type === 'success') onMessage(parseReturn(result.url));
      await status.refetch();
    } catch (e) {
      onMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Txt style={{ fontSize: 14, lineHeight: 20 }} color="tx2">
        Strava'ya kaydettiğin bisiklet sürüşlerinin mesafesi seçtiğin km hedefine kendiliğinden
        yazılır. Etkinlikleri yalnızca okuma izni istenir.
      </Txt>
      <Button
        label={busy ? 'Bekleniyor…' : "Strava'ya bağlan"}
        loading={busy}
        onPress={() => void run()}
      />
    </Card>
  );
}

function GoalPicker({ s }: { s: StravaStatus }) {
  const { c } = useTheme();
  const goals = useGoals();
  const update = useUpdateStrava();
  const kmGoals = (goals.data ?? []).filter((g) => g.unit === STRAVA_GOAL_UNIT && !g.archived);
  return (
    <View style={{ gap: 8 }}>
      <Txt variant="sectionTitle" style={{ fontSize: 18 }}>
        Hedef
      </Txt>
      {goals.isPending ? <Loading /> : null}
      {goals.data && !kmGoals.length ? (
        <Card>
          <Txt style={{ fontSize: 14 }} color="tx2">
            km birimli hedefin yok. Önce bir hedef oluştur.
          </Txt>
          <Button
            label="Hedef oluştur"
            variant="outline"
            height={44}
            onPress={() => router.push('/goals/new')}
          />
        </Card>
      ) : null}
      {kmGoals.length ? (
        <View style={[styles.group, { backgroundColor: c.s1, borderColor: c.line }]}>
          {kmGoals.map((g, i) => {
            const selected = s.goalId === g.id;
            return (
              <Pressable
                key={g.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => update.mutate({ goalId: selected ? null : g.id })}
                style={({ pressed }) => [
                  styles.row,
                  i > 0 && { borderTopWidth: 1, borderTopColor: c.line },
                  pressed && { backgroundColor: c.s2 },
                ]}
              >
                <View
                  style={[
                    styles.radio,
                    { borderColor: selected ? c.acc : c.line2 },
                    selected && { backgroundColor: c.acc },
                  ]}
                />
                <Txt style={{ flex: 1, fontSize: 15 }}>{g.name}</Txt>
                <Txt style={{ fontSize: 13 }} color="mut">
                  {g.target} km
                </Txt>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <Txt style={{ fontSize: 12 }} color={s.goalId ? 'mut' : 'penTx'}>
        {s.goalId
          ? 'Yeni etkinlikler bu hedefe yazılır. Önceden yazılanlar kendi hedefinde kalır.'
          : 'Hedef seçilmeden etkinlikler yazılmaz.'}
      </Txt>
      {update.isError ? (
        <Txt style={{ fontSize: 13 }} color="penTx">
          {errorMessage(update.error)}
        </Txt>
      ) : null}
    </View>
  );
}

function ActivityTypes({ s }: { s: StravaStatus }) {
  const { c } = useTheme();
  const update = useUpdateStrava();
  const selected = new Set(s.activityTypes);
  const toggle = (t: StravaActivityType, on: boolean) => {
    const next = STRAVA_ACTIVITY_TYPES.filter((x) => (x === t ? on : selected.has(x)));
    if (next.length) update.mutate({ activityTypes: next });
  };
  return (
    <View style={{ gap: 8 }}>
      <Txt variant="sectionTitle" style={{ fontSize: 18 }}>
        Etkinlik türleri
      </Txt>
      <View style={[styles.group, { backgroundColor: c.s1, borderColor: c.line }]}>
        {STRAVA_ACTIVITY_TYPES.map((t, i) => (
          <View
            key={t}
            style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: c.line }]}
          >
            <Txt style={{ flex: 1, fontSize: 15 }}>{STRAVA_ACTIVITY_TYPE_LABELS[t]}</Txt>
            <Switch
              label={STRAVA_ACTIVITY_TYPE_LABELS[t]}
              value={selected.has(t)}
              disabled={update.isPending || (selected.has(t) && selected.size === 1)}
              onChange={(v) => toggle(t, v)}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

function Connected({ s, onMessage }: { s: StravaStatus; onMessage: (m: string | null) => void }) {
  const sync = useStravaSync();
  const disconnect = useStravaDisconnect();
  const [confirm, setConfirm] = useState(false);

  const runSync = async () => {
    onMessage(null);
    try {
      const r = await sync.mutateAsync();
      onMessage(
        r.imported || r.updated
          ? `${r.imported} yeni, ${r.updated} güncellenen etkinlik.`
          : 'Yeni etkinlik yok.',
      );
    } catch (e) {
      onMessage(errorMessage(e));
    }
  };

  return (
    <>
      <Card>
        <Txt variant="label" color="okTx">
          BAĞLI
        </Txt>
        <Txt style={{ fontSize: 16 }}>{s.athleteName ?? 'Strava sporcusu'}</Txt>
        <Txt style={{ fontSize: 12 }} color="mut">
          {s.lastSyncAt ? `Son eşitleme: ${lastAccessLabel(s.lastSyncAt)}` : 'Henüz eşitlenmedi'}
        </Txt>
        {s.lastError ? (
          <Txt style={{ fontSize: 13 }} color="penTx">
            {s.lastError}
          </Txt>
        ) : null}
        <Button
          label={sync.isPending ? 'Eşitleniyor…' : 'Şimdi eşitle'}
          variant="outline"
          height={44}
          loading={sync.isPending}
          disabled={!s.goalId}
          onPress={() => void runSync()}
        />
      </Card>

      <GoalPicker s={s} />
      <ActivityTypes s={s} />

      {confirm ? (
        <Card>
          <Txt style={{ fontSize: 14, lineHeight: 20 }} color="tx2">
            Bağlantı kesilince yeni etkinlikler yazılmaz. Önceden yazılan ilerlemeler kalır.
          </Txt>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              label="Vazgeç"
              variant="outline"
              height={44}
              style={{ flex: 1 }}
              onPress={() => setConfirm(false)}
            />
            <Button
              label="Bağlantıyı kes"
              variant="dangerSolid"
              height={44}
              style={{ flex: 1 }}
              loading={disconnect.isPending}
              onPress={() =>
                disconnect.mutate(undefined, {
                  onSuccess: () => {
                    setConfirm(false);
                    onMessage('Strava bağlantısı kesildi.');
                  },
                  onError: (e) => onMessage(errorMessage(e)),
                })
              }
            />
          </View>
        </Card>
      ) : (
        <Button label="Bağlantıyı kes" variant="danger" onPress={() => setConfirm(true)} />
      )}
    </>
  );
}

export default function StravaScreen() {
  const { c } = useTheme();
  const params = useLocalSearchParams<{ status?: string; reason?: string }>();
  const status = useStravaStatus();
  const [message, setMessage] = useState<string | null>(() =>
    returnMessage(params.status, params.reason),
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <SubHeader title="Strava" />
      <ScrollView contentContainerStyle={styles.content}>
        {status.isPending ? <Loading /> : null}
        {status.isError ? (
          <ErrorCard error={status.error} onRetry={() => void status.refetch()} />
        ) : null}
        {message ? (
          <Txt style={{ fontSize: 13 }} color="tx2">
            {message}
          </Txt>
        ) : null}
        {status.data && !status.data.configured ? <NotConfigured /> : null}
        {status.data?.configured && !status.data.connected ? (
          <ConnectCard onMessage={setMessage} />
        ) : null}
        {status.data?.configured && status.data.connected ? (
          <Connected s={status.data} onMessage={setMessage} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 8, paddingHorizontal: 20, paddingBottom: 32, gap: 18 },
  group: { borderWidth: 1, borderRadius: 14 },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
});
