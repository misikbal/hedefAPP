import { useEffect, useMemo, useState } from 'react';
import { FlatList, Image, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Input } from '@/components/Field';
import { Segmented } from '@/components/Segmented';
import { Loading } from '@/components/StateViews';
import { SubHeader } from '@/components/SubHeader';
import { Switch } from '@/components/Switch';
import { Txt } from '@/components/Txt';
import {
  ensureGuardDefaults,
  isSocialPackage,
  listLaunchableApps,
  needsRestrictedSettingStep,
  openAccessibilitySettings,
  openAppDetails,
  syncGuard,
  type LaunchableApp,
} from '@/features/focus/guard';
import { useGuardInfo } from '@/features/focus/useGuardInfo';
import { useFocusStore } from '@/store/focusStore';
import { setGuard, useGuardStore, type GuardMode } from '@/store/guardStore';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';

const MODE_OPTIONS = [
  { value: 'apps', label: 'Seçili uygulamalar' },
  { value: 'all', label: 'Tüm telefon' },
] as const satisfies readonly { value: GuardMode; label: string }[];

const MODE_TEXT: Record<GuardMode, string> = {
  apps: 'Seans sürerken aşağıda seçtiğin uygulamalar açılmaz; açmaya çalışınca Takip öne gelir.',
  all: 'Tam odak: telefonu kilitler. Ana ekran, telefon (arama), klavye ve bildirim paneli her zaman açık kalır; aşağıda izin verdiklerin dışında hiçbir uygulama açılmaz.',
};

/** Ayar değişince açık seans varsa engel hemen güncellenir. */
function change(patch: Parameters<typeof setGuard>[0]) {
  setGuard(patch);
  syncGuard(useFocusStore.getState().session);
}

function ServiceCard({ serviceOn }: { serviceOn: boolean }) {
  const { c } = useTheme();
  if (serviceOn) {
    return (
      <Card style={{ borderColor: c.ok }}>
        <Txt style={{ fontFamily: fonts.bodySemi, fontSize: 15 }} color="okTx">
          Erişilebilirlik izni açık
        </Txt>
        <Txt style={{ fontSize: 13, lineHeight: 19 }} color="tx2">
          Takip yalnızca öne gelen uygulamanın adını görür; ekran içeriğini okumaz. Veri cihazdan
          çıkmaz. Seans yokken hiçbir şey engellenmez.
        </Txt>
      </Card>
    );
  }
  return (
    <Card style={{ borderColor: c.pen, backgroundColor: c.penBg }}>
      <Txt style={{ fontFamily: fonts.bodySemi, fontSize: 15 }} color="penTx">
        Erişilebilirlik izni gerekli
      </Txt>
      <Txt style={{ fontSize: 13, lineHeight: 19 }} color="tx2">
        Uygulamaları engellemek için Android'in erişilebilirlik hizmeti kullanılır. Takip yalnızca
        öne gelen uygulamanın adını görür, ekran içeriğini okumaz ve hiçbir veri cihazdan çıkmaz.
      </Txt>
      <View style={styles.step}>
        <Txt style={styles.stepNo} color="mut">
          1
        </Txt>
        <View style={{ flex: 1, gap: 8 }}>
          <Txt style={{ fontSize: 13, lineHeight: 19 }}>
            Erişilebilirlik ayarlarında "Yüklü uygulamalar" (ya da "İndirilen uygulamalar") altından
            "Takip odak engeli"ni aç.
          </Txt>
          <Button
            label="Erişilebilirlik ayarlarını aç"
            variant="outline"
            height={40}
            onPress={openAccessibilitySettings}
          />
        </View>
      </View>
      {needsRestrictedSettingStep() ? (
        <View style={styles.step}>
          <Txt style={styles.stepNo} color="mut">
            2
          </Txt>
          <View style={{ flex: 1, gap: 8 }}>
            <Txt style={{ fontSize: 13, lineHeight: 19 }}>
              "Kısıtlanmış ayar" uyarısı çıkarsa: Uygulama bilgisi → sağ üstteki ⋮ menüsü → "Kısıtlı
              ayarlara izin ver". Sonra 1. adımı tekrarla.
            </Txt>
            <Button
              label="Uygulama bilgisini aç"
              variant="outline"
              height={40}
              onPress={openAppDetails}
            />
          </View>
        </View>
      ) : null}
    </Card>
  );
}

function ToggleRow({
  label,
  sub,
  value,
  onChange,
  disabled,
  first,
}: {
  label: string;
  sub?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  first?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View style={[styles.row, !first && { borderTopWidth: 1, borderTopColor: c.line }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt style={{ fontSize: 15 }}>{label}</Txt>
        {sub ? (
          <Txt style={{ fontSize: 12, lineHeight: 17 }} color="mut">
            {sub}
          </Txt>
        ) : null}
      </View>
      <Switch label={label} value={value} onChange={onChange} disabled={disabled} />
    </View>
  );
}

function AppRow({
  app,
  value,
  onChange,
}: {
  app: LaunchableApp;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const { c } = useTheme();
  return (
    <View style={[styles.appRow, { borderTopColor: c.line }]}>
      {app.icon ? (
        <Image source={{ uri: app.icon }} style={styles.icon} accessibilityIgnoresInvertColors />
      ) : (
        <View style={[styles.icon, { backgroundColor: c.s2, borderRadius: 8 }]} />
      )}
      <View style={{ flex: 1 }}>
        <Txt style={{ fontSize: 15 }} numberOfLines={1}>
          {app.label}
        </Txt>
        <Txt style={{ fontFamily: fonts.mono, fontSize: 11 }} color="mut" numberOfLines={1}>
          {app.packageName}
        </Txt>
      </View>
      <Switch label={app.label} value={value} onChange={onChange} />
    </View>
  );
}

export default function FocusBlockingScreen() {
  const { c } = useTheme();
  const { supported, serviceOn } = useGuardInfo(3000);
  const enabled = useGuardStore((s) => s.enabled);
  const mode = useGuardStore((s) => s.mode);
  const blocked = useGuardStore((s) => s.blocked);
  const allowed = useGuardStore((s) => s.allowed);
  const blockSettings = useGuardStore((s) => s.blockSettings);
  const blockDuringPause = useGuardStore((s) => s.blockDuringPause);
  const session = useFocusStore((s) => s.session);
  const [query, setQuery] = useState('');

  const apps = useQuery({
    queryKey: ['focusGuard', 'apps'],
    queryFn: () => listLaunchableApps(true),
    enabled: supported,
    staleTime: 60_000,
  });

  useEffect(() => {
    void ensureGuardDefaults().catch(() => undefined);
  }, []);

  // Hizmet açılıp kapanınca açık seansın engeli de eşitlenir.
  useEffect(() => {
    syncGuard(useFocusStore.getState().session);
  }, [serviceOn]);

  const selected = mode === 'apps' ? blocked : allowed;
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const list = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    const rows = (apps.data ?? []).filter(
      (a) =>
        !q ||
        a.label.toLocaleLowerCase('tr-TR').includes(q) ||
        a.packageName.toLowerCase().includes(q),
    );
    const rank = (a: LaunchableApp) => (mode === 'apps' && isSocialPackage(a.packageName) ? 0 : 1);
    return rows.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label, 'tr-TR'));
  }, [apps.data, query, mode]);

  const toggleApp = (pkg: string, on: boolean) => {
    const next = on ? [...new Set([...selected, pkg])] : selected.filter((p) => p !== pkg);
    change(mode === 'apps' ? { blocked: next } : { allowed: next });
  };

  if (!supported) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
        <SubHeader title="Odak engeli" />
        <View style={styles.content}>
          <Card>
            <Txt style={{ fontSize: 14, lineHeight: 20 }} color="tx2">
              Uygulama engeli yalnızca Android'de çalışır ve uygulamanın yeni bir sürümünü
              (development ya da APK build) gerektirir. Bu cihazda kullanılamıyor.
            </Txt>
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  const header = (
    <View style={{ gap: 18, paddingBottom: 8 }}>
      <ServiceCard serviceOn={serviceOn} />

      <View style={[styles.group, { backgroundColor: c.s1, borderColor: c.line }]}>
        <ToggleRow
          first
          label="Odak sırasında engelle"
          sub={
            serviceOn
              ? session
                ? 'Seans sürüyor: değişiklikler hemen uygulanır.'
                : 'Seans başlayınca açılır, bitince kalkar.'
              : 'Önce erişilebilirlik iznini aç.'
          }
          value={enabled && serviceOn}
          disabled={!serviceOn}
          onChange={(v) => change({ enabled: v })}
        />
        <ToggleRow
          label="Molada da engelle"
          sub="Seans duraklatıldığında engel sürer (en çok 6 saat)."
          value={blockDuringPause}
          onChange={(v) => change({ blockDuringPause: v })}
        />
        <ToggleRow
          label="Ayarlar uygulamasını da engelle (katı mod)"
          sub="Seans sırasında Ayarlar ve uygulama kaldırma ekranı da açılmaz; böylece izni kapatıp kaçamazsın. Seans bitince ya da sıfırlanınca kalkar."
          value={blockSettings}
          onChange={(v) => change({ blockSettings: v })}
        />
      </View>

      <View style={{ gap: 6 }}>
        <Txt style={{ fontSize: 13 }} color="mut">
          Ne engellensin?
        </Txt>
        <Segmented options={MODE_OPTIONS} value={mode} onChange={(v) => change({ mode: v })} />
        <Txt style={{ fontSize: 12, lineHeight: 17 }} color="mut">
          {MODE_TEXT[mode]}
        </Txt>
      </View>

      <View style={{ gap: 8 }}>
        <View style={styles.listHead}>
          <Txt variant="sectionTitle" style={{ fontSize: 18 }}>
            {mode === 'apps' ? 'Engellenecek uygulamalar' : 'İzinli uygulamalar'}
          </Txt>
          <Txt style={{ fontFamily: fonts.mono, fontSize: 12 }} color="mut">
            {selected.length} seçili
          </Txt>
        </View>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Uygulama ara"
          accessibilityLabel="Uygulama ara"
          autoCorrect={false}
        />
      </View>
      {apps.isPending ? <Loading /> : null}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <SubHeader title="Odak engeli" />
      <FlatList
        data={list}
        keyExtractor={(a) => a.packageName}
        ListHeaderComponent={header}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={20}
        renderItem={({ item }) => (
          <AppRow
            app={item}
            value={selectedSet.has(item.packageName)}
            onChange={(v) => toggleApp(item.packageName, v)}
          />
        )}
        ListEmptyComponent={
          apps.isPending ? undefined : (
            <Txt style={{ fontSize: 13 }} color="mut">
              {query ? 'Eşleşen uygulama yok.' : 'Uygulama listesi alınamadı.'}
            </Txt>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 8, paddingHorizontal: 20, paddingBottom: 32 },
  group: { borderWidth: 1, borderRadius: 14 },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  step: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepNo: { fontFamily: fonts.monoMedium, fontSize: 15, width: 16, paddingTop: 1 },
  listHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  icon: { width: 36, height: 36 },
});
