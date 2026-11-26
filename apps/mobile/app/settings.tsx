import { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { MotivationFreq, SettingsDto } from '@takip/shared';
import { api } from '@/api/client';
import { queryClient } from '@/api/queryClient';
import { API_URL } from '@/api/config';
import {
  useMcpStatus,
  usePenaltyRules,
  useSettings,
  useStravaStatus,
  useUpdateSettings,
} from '@/api/hooks';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Segmented } from '@/components/Segmented';
import { ErrorCard, Loading, errorMessage } from '@/components/StateViews';
import { SubHeader } from '@/components/SubHeader';
import { Switch } from '@/components/Switch';
import { TimeField } from '@/components/TimeField';
import { ForwardIcon } from '@/components/icons';
import { Txt } from '@/components/Txt';
import { isGuardSupported } from '@/features/focus/guard';
import { downloadBackup } from '@/features/settings/backup';
import { registerForPush } from '@/notifications/push';
import { useAuthStore } from '@/store/authStore';
import { useGuardStore } from '@/store/guardStore';
import { useTheme } from '@/theme/ThemeProvider';
import { ThemeSwitcher } from '@/theme/ThemeSwitcher';
import { fonts } from '@/theme/typography';

type NotifKey = keyof SettingsDto['notif'];

const NOTIF_ROWS: { key: NotifKey; label: string; sub: (s: SettingsDto) => string }[] = [
  { key: 'blocks', label: 'Blok hatırlatmaları', sub: () => 'Bloktan önce, blok ayarına göre' },
  { key: 'motivation', label: 'Motivasyon mesajları', sub: () => 'Durumuna göre, gün içinde' },
  {
    key: 'penalties',
    label: 'Ceza uyarıları',
    sub: () => 'Ceza gelince ve süre bitmeden 2 saat önce',
  },
  { key: 'journal', label: 'Günlük hatırlatma', sub: (s) => `Her gün ${s.journalReminder}` },
];

const FREQ_OPTIONS = [
  { value: 'low', label: 'Az' },
  { value: 'mid', label: 'Orta' },
  { value: 'high', label: 'Çok' },
] as const satisfies readonly { value: MotivationFreq; label: string }[];

const FREQ_TEXT: Record<MotivationFreq, string> = {
  low: 'Günde 1 mesaj · sabah',
  mid: 'Günde 3 mesaj · sabah, öğle, akşam',
  high: 'Sabah ve her tamamlanan bloktan sonra',
};

function NotificationSettings({ s }: { s: SettingsDto }) {
  const { c } = useTheme();
  const update = useUpdateSettings();
  const [status, setStatus] = useState<string | null>(null);

  const testPush = async () => {
    setStatus('Gönderiliyor…');
    const reg = await registerForPush();
    if (!reg.ok) {
      setStatus(
        reg.reason === 'denied'
          ? 'Bildirim izni kapalı. Telefonun ayarlarından aç.'
          : reg.reason === 'no_project'
            ? 'Push için EAS proje kimliği tanımlı değil (development build gerekli).'
            : reg.reason === 'unsupported'
              ? 'Bu platformda push yok.'
              : `Push kaydı başarısız: ${reg.message ?? ''}`,
      );
      return;
    }
    try {
      await api('/notifications/test', { method: 'POST' });
      setStatus('Gönderildi. Birkaç saniye içinde gelmeli (sessiz saatteysen sonra gelir).');
    } catch (e) {
      setStatus(errorMessage(e));
    }
  };

  return (
    <>
      <View style={{ gap: 8 }}>
        <Txt variant="sectionTitle" style={{ fontSize: 18 }}>
          Bildirimler
        </Txt>
        <View style={[styles.group, { backgroundColor: c.s1, borderColor: c.line }]}>
          {NOTIF_ROWS.map((r, i) => (
            <View
              key={r.key}
              style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: c.line }]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Txt style={{ fontSize: 15 }}>{r.label}</Txt>
                <Txt style={{ fontSize: 12 }} color="mut">
                  {r.sub(s)}
                </Txt>
              </View>
              <Switch
                label={r.label}
                value={s.notif[r.key]}
                onChange={(v) => update.mutate({ notif: { [r.key]: v } })}
              />
            </View>
          ))}
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <Txt style={{ fontSize: 13 }} color="mut">
          Motivasyon mesajı sıklığı
        </Txt>
        <Segmented
          options={FREQ_OPTIONS}
          value={s.motivationFreq}
          onChange={(v) => update.mutate({ motivationFreq: v })}
        />
        <Txt style={{ fontSize: 12 }} color="mut">
          {FREQ_TEXT[s.motivationFreq]}
        </Txt>
      </View>

      <View style={styles.grid}>
        <View style={{ flex: 1 }}>
          <TimeField
            label="Sessiz saat başı"
            value={s.quietHours.start}
            onChange={(v) => update.mutate({ quietHours: { ...s.quietHours, start: v } })}
          />
        </View>
        <View style={{ flex: 1 }}>
          <TimeField
            label="Bitişi"
            value={s.quietHours.end}
            onChange={(v) => update.mutate({ quietHours: { ...s.quietHours, end: v } })}
          />
        </View>
      </View>
      <Txt style={{ fontSize: 12, marginTop: -10 }} color="mut">
        Sessiz saatte gelen bildirimler sıraya alınır, saat bitince gönderilir.
      </Txt>

      <TimeField
        label="Günlük hatırlatma saati"
        value={s.journalReminder}
        onChange={(v) => update.mutate({ journalReminder: v })}
      />

      {update.isError ? (
        <Txt style={{ fontSize: 13 }} color="penTx">
          {errorMessage(update.error)}
        </Txt>
      ) : null}

      <Card>
        <Txt style={{ fontSize: 13, lineHeight: 19 }} color="tx2">
          Hatırlatmalar geç geliyorsa telefonun pil optimizasyonu bu uygulamayı kısıtlıyor olabilir.
          Ayarlar → Uygulamalar → Takip → Pil bölümünden "Kısıtlama yok"u seç.
        </Txt>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {Platform.OS !== 'web' ? (
            <Button
              label="Uygulama ayarları"
              variant="outline"
              height={40}
              style={{ flex: 1 }}
              onPress={() => void Linking.openSettings()}
            />
          ) : null}
          <Button
            label="Test bildirimi"
            variant="outline"
            height={40}
            style={{ flex: 1 }}
            onPress={() => void testPush()}
          />
        </View>
        {status ? (
          <Txt style={{ fontSize: 12 }} color="mut">
            {status}
          </Txt>
        ) : null}
      </Card>
    </>
  );
}

function LinkRow({
  label,
  value,
  onPress,
  first,
}: {
  label: string;
  value: string;
  onPress?: () => void;
  first?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? 'link' : 'text'}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { paddingVertical: 14 },
        !first && { borderTopWidth: 1, borderTopColor: c.line },
        pressed && { backgroundColor: c.s2 },
      ]}
    >
      <Txt style={{ flex: 1, fontSize: 15 }}>{label}</Txt>
      <Txt style={{ fontSize: 13 }} color="mut">
        {value}
      </Txt>
      {onPress ? <ForwardIcon color={c.mut} size={16} /> : null}
    </Pressable>
  );
}

/** Claude bağlantısı (MCP), Strava, odak engeli, ceza kuralları, hafta başlangıcı */
function LinksGroup() {
  const { c } = useTheme();
  const rules = usePenaltyRules();
  const mcp = useMcpStatus();
  const strava = useStravaStatus();
  const guardEnabled = useGuardStore((g) => g.enabled);
  const guardSupported = isGuardSupported();
  const stravaValue = !strava.data
    ? ''
    : !strava.data.configured
      ? 'Kapalı'
      : strava.data.connected
        ? 'Bağlı'
        : 'Bağlı değil';
  const enabled = rules.data?.filter((r) => r.enabled).length;
  const mcpValue = !mcp.data
    ? ''
    : mcp.data.enabled && mcp.data.lastAccessAt
      ? 'Bağlı'
      : 'Kurulmadı';
  return (
    <View style={[styles.group, { backgroundColor: c.s1, borderColor: c.line }]}>
      <LinkRow
        first
        label="Claude bağlantısı (MCP)"
        value={mcpValue}
        onPress={() => router.push('/claude')}
      />
      <LinkRow label="Strava" value={stravaValue} onPress={() => router.push('/strava')} />
      <LinkRow
        label="Odak engeli"
        value={!guardSupported ? 'Yalnızca Android' : guardEnabled ? 'Açık' : 'Kapalı'}
        onPress={guardSupported ? () => router.push('/focus/blocking') : undefined}
      />
      <LinkRow
        label="Ceza kuralları"
        value={enabled === undefined ? '' : enabled ? `${enabled} kural açık` : 'Kural yok'}
        onPress={() => router.push('/penalties')}
      />
      <LinkRow label="Hafta başlangıcı" value="Pazartesi" />
    </View>
  );
}

function BackupSection() {
  const [state, setState] = useState<{ busy: boolean; text: string | null }>({
    busy: false,
    text: null,
  });
  const run = async () => {
    setState({ busy: true, text: null });
    try {
      const name = await downloadBackup();
      setState({ busy: false, text: `${name} hazırlandı.` });
    } catch (e) {
      setState({ busy: false, text: errorMessage(e) });
    }
  };
  return (
    <View style={{ gap: 8 }}>
      <Txt variant="sectionTitle" style={{ fontSize: 18 }}>
        Veri
      </Txt>
      <Button
        label={state.busy ? 'Hazırlanıyor…' : 'Yedeği indir (JSON)'}
        variant="outline"
        height={48}
        disabled={state.busy}
        onPress={() => void run()}
      />
      <Txt style={{ fontSize: 12 }} color="mut">
        {state.text ?? 'Sunucuda her gün otomatik yedek alınır; bu dosya kişisel kopyandır.'}
      </Txt>
    </View>
  );
}

export default function SettingsScreen() {
  const { c } = useTheme();
  const logout = useAuthStore((s) => s.logout);
  const settings = useSettings();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <SubHeader title="Ayarlar" />
      <ScrollView contentContainerStyle={styles.content}>
        {settings.isPending ? <Loading /> : null}
        {settings.isError ? (
          <ErrorCard error={settings.error} onRetry={() => void settings.refetch()} />
        ) : null}
        {settings.data ? <NotificationSettings s={settings.data} /> : null}

        <View style={{ gap: 6 }}>
          <Txt style={{ fontSize: 13 }} color="mut">
            Tema
          </Txt>
          <ThemeSwitcher />
        </View>

        <LinksGroup />
        <BackupSection />
        <Card>
          <Txt variant="label" color="mut">
            SUNUCU
          </Txt>
          <Txt style={{ fontFamily: fonts.mono, fontSize: 12, color: c.tx2 }}>{API_URL}</Txt>
        </Card>
        <Button
          label="Çıkış yap"
          variant="danger"
          onPress={() => {
            queryClient.clear();
            void logout();
          }}
        />
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
  grid: { flexDirection: 'row', gap: 10 },
});
