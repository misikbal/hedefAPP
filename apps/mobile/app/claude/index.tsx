import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  MCP_TOOLS,
  type AuditEntry,
  type McpPermissions,
  type McpStatus,
  type PendingChangeDto,
} from '@takip/shared';
import { API_URL } from '@/api/config';
import {
  useAuditUndo,
  useClaudeAudit,
  useMcpStatus,
  usePendingChanges,
  useSettings,
  useUpdateSettings,
} from '@/api/hooks';
import { Card } from '@/components/Card';
import { CopyIcon } from '@/components/icons';
import { ErrorCard, Loading, errorMessage } from '@/components/StateViews';
import { SubHeader } from '@/components/SubHeader';
import { Switch } from '@/components/Switch';
import { Txt } from '@/components/Txt';
import { lastAccessLabel, whenLabel } from '@/features/claude/format';
import { useTheme } from '@/theme/ThemeProvider';
import { HIT } from '@/theme/tokens';
import { fonts } from '@/theme/typography';

const MASK = '••••••••';

/** Tam adres: API tabanı + uç nokta yolu (gizli anahtar dahil). */
const fullAddress = (s: McpStatus) => `${API_URL}${s.endpointPath}`;
/** Gizli anahtar son yol parçasıdır; maskelenmiş görünümde gizlenir. */
const maskedAddress = (s: McpStatus) =>
  `${API_URL}${s.endpointPath.replace(/\/[^/]*$/, `/${MASK}`)}`;

function SectionTitle({ children, right }: { children: string; right?: string }) {
  return (
    <View style={styles.sectionHead}>
      <Txt variant="sectionTitle" style={{ fontSize: 18 }}>
        {children}
      </Txt>
      {right ? (
        <Txt style={{ fontFamily: fonts.mono, fontSize: 11 }} color="mut">
          {right}
        </Txt>
      ) : null}
    </View>
  );
}

function ServerCard({ status }: { status: McpStatus }) {
  const { c } = useTheme();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const connected = !!status.lastAccessAt;
  const dot = !status.enabled ? c.pen : connected ? c.ok : c.line2;
  const label = !status.enabled ? 'Kapalı' : connected ? 'Bağlı' : 'Henüz bağlanmadı';
  const labelColor = !status.enabled ? c.penTx : connected ? c.okTx : c.mut;

  const copy = async () => {
    await Clipboard.setStringAsync(fullAddress(status));
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card style={{ gap: 12 }}>
      <View style={styles.between}>
        <Txt variant="label" color="mut" style={{ letterSpacing: 0.9 }}>
          MCP SUNUCUSU
        </Txt>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: dot }]} />
          <Txt style={{ fontSize: 12, color: labelColor }}>{label}</Txt>
        </View>
      </View>

      {status.enabled ? (
        <>
          <View style={styles.addressRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={revealed ? 'Adresi gizle' : 'Adresi göster'}
              accessibilityHint="Gizli anahtar içerir"
              onPress={() => setRevealed((v) => !v)}
              style={[styles.address, { backgroundColor: c.s2 }]}
            >
              <Txt
                numberOfLines={1}
                ellipsizeMode="middle"
                style={{ fontFamily: fonts.mono, fontSize: 13 }}
              >
                {revealed ? fullAddress(status) : maskedAddress(status)}
              </Txt>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Adresi kopyala"
              onPress={() => void copy()}
              style={({ pressed }) => [
                styles.copy,
                { borderColor: c.line, backgroundColor: pressed ? c.s2 : 'transparent' },
              ]}
            >
              <CopyIcon color={c.tx} />
            </Pressable>
          </View>
          <Txt style={{ fontSize: 12, lineHeight: 17 }} color="mut">
            {copied
              ? 'Adres kopyalandı.'
              : 'Adres gizli anahtar içerir; kimseyle paylaşma. Görmek için adrese dokun.'}
          </Txt>
        </>
      ) : (
        <Txt style={{ fontSize: 13, lineHeight: 19 }} color="tx2">
          MCP sunucusu bu API'de kapalı. Sunucuda MCP_SECRET tanımlanınca adres burada görünür.
        </Txt>
      )}

      <Txt style={{ fontSize: 13, lineHeight: 19 }} color="tx2">
        {connected && status.lastAccessAt
          ? `Son erişim: ${lastAccessLabel(status.lastAccessAt)}${status.lastTool ? ` · ${status.lastTool}` : ''}.`
          : 'Claude henüz bu adrese bağlanmadı.'}
      </Txt>
      {status.enabled ? (
        <Txt style={{ fontSize: 13, lineHeight: 19 }} color="tx2">
          Kurulum: claude.ai → Ayarlar → Bağlayıcılar → Özel bağdaştırıcı ekle → bu adresi yapıştır.
        </Txt>
      ) : null}
    </Card>
  );
}

function Checklist({ status }: { status: McpStatus }) {
  const { c } = useTheme();
  const rows: { ok: boolean | null; label: string; sub: string }[] = [
    {
      ok: true,
      label: 'Sunucu ayakta',
      sub: 'Uygulama API ile konuşabiliyor.',
    },
    {
      ok: status.enabled,
      label: 'MCP sunucusu açık',
      sub: status.enabled ? 'Gizli anahtar tanımlı.' : 'Sunucuda MCP_SECRET tanımlı değil.',
    },
    {
      ok: null,
      label: 'HTTPS sertifikası',
      sub: 'Adres https:// ile başlamalı ve sertifika geçerli olmalı.',
    },
    {
      ok: null,
      label: 'Adres doğru',
      sub: 'Kopyaladığın adresin tamamını yapıştırdığından emin ol.',
    },
    {
      ok: null,
      label: "Claude'daki bağlayıcı",
      sub: 'Bağlayıcı eklenmiş ve açık olmalı; sohbette araçlarını etkinleştir.',
    },
  ];
  return (
    <View style={{ gap: 8 }}>
      <SectionTitle>Kontrol listesi</SectionTitle>
      <Txt style={{ fontSize: 13, lineHeight: 19 }} color="tx2">
        Program ve bildirimler Claude olmadan da çalışır; yalnızca Claude değişiklik yapamaz.
      </Txt>
      {rows.map((r) => (
        <View key={r.label} style={[styles.row, { backgroundColor: c.s1, borderColor: c.line }]}>
          <View
            style={[
              styles.badge,
              { backgroundColor: r.ok === true ? c.ok : r.ok === false ? c.penBg : c.s2 },
            ]}
          >
            <Txt
              style={{
                fontSize: 14,
                fontFamily: fonts.bodySemi,
                color: r.ok === true ? c.onAcc : r.ok === false ? c.penTx : c.mut,
              }}
            >
              {r.ok === true ? '✓' : r.ok === false ? '!' : '?'}
            </Txt>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt style={{ fontSize: 14 }}>{r.label}</Txt>
            <Txt style={{ fontSize: 12 }} color="mut">
              {r.sub}
            </Txt>
          </View>
        </View>
      ))}
    </View>
  );
}

function PendingSection({ items }: { items: PendingChangeDto[] }) {
  const { c } = useTheme();
  const open = (id: string) => router.push({ pathname: '/claude/pending/[id]', params: { id } });
  const many = items.length > 1;
  return (
    <View style={{ gap: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityHint="Onay ekranını açar"
        onPress={() => (many ? undefined : open(items[0]!.id))}
        disabled={many}
        style={({ pressed }) => [
          styles.pendingCard,
          { backgroundColor: c.s2, borderColor: c.acc, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <View style={[styles.pendingDot, { backgroundColor: c.acc }]} />
        <Txt style={{ flex: 1, fontSize: 15, fontFamily: fonts.bodyMedium }}>
          {`${items.length} değişiklik onayını bekliyor`}
        </Txt>
        {many ? null : (
          <Txt style={{ fontSize: 13 }} color="accTx">
            İncele
          </Txt>
        )}
      </Pressable>
      {many
        ? items.map((p) => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              onPress={() => open(p.id)}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: c.s1, borderColor: c.line, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
                <Txt style={{ fontFamily: fonts.mono, fontSize: 11 }} color="mut">
                  {`${whenLabel(p.createdAt)} · ${p.tool}`}
                </Txt>
                <Txt style={{ fontSize: 14 }} numberOfLines={2}>
                  {p.preview.title}
                </Txt>
              </View>
              <Txt style={{ fontSize: 13 }} color="accTx">
                İncele
              </Txt>
            </Pressable>
          ))
        : null}
    </View>
  );
}

function AuditSection() {
  const { c } = useTheme();
  const audit = useClaudeAudit();
  const undo = useAuditUndo();
  const busyId = undo.isPending ? undo.variables.id : null;
  const items = audit.data?.items ?? [];

  const row = (e: AuditEntry) => {
    const undone = !!e.undoneAt;
    const action = e.canUndo ? 'undo' : e.canRedo ? 'redo' : null;
    return (
      <View key={e.id} style={[styles.row, { backgroundColor: c.s1, borderColor: c.line }]}>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Txt style={{ fontFamily: fonts.mono, fontSize: 11 }} color="mut">
            {`${whenLabel(e.createdAt)} · ${e.tool ?? e.entity}`}
          </Txt>
          <Txt
            style={{
              fontSize: 14,
              textDecorationLine: undone ? 'line-through' : 'none',
            }}
            color={undone ? 'mut' : 'tx'}
          >
            {e.summary}
          </Txt>
        </View>
        {action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${action === 'undo' ? 'Geri al' : 'Yinele'}: ${e.summary}`}
            disabled={undo.isPending}
            onPress={() => undo.mutate({ id: e.id, action })}
            style={[
              styles.pillBtn,
              { borderColor: c.line, opacity: undo.isPending && busyId !== e.id ? 0.5 : 1 },
            ]}
          >
            <Txt style={{ fontSize: 13 }} color="accTx">
              {busyId === e.id ? '…' : action === 'undo' ? 'Geri al' : 'Yinele'}
            </Txt>
          </Pressable>
        ) : null}
      </View>
    );
  };

  return (
    <View style={{ gap: 8 }}>
      <SectionTitle>Claude'un yaptıkları</SectionTitle>
      {audit.isPending ? <Loading /> : null}
      {audit.isError ? (
        <ErrorCard error={audit.error} onRetry={() => void audit.refetch()} />
      ) : null}
      {audit.data && items.length === 0 ? (
        <Txt style={{ fontSize: 14, lineHeight: 20 }} color="mut">
          Claude henüz bir değişiklik yapmadı. Yaptıkları burada listelenir ve geri alınabilir.
        </Txt>
      ) : null}
      {items.map(row)}
      {undo.isError ? (
        <Txt style={{ fontSize: 13 }} color="penTx">
          {errorMessage(undo.error)}
        </Txt>
      ) : null}
    </View>
  );
}

type ModeKey = 'blockWrite' | 'blockDelete' | 'penaltyRuleWrite';

const MODE_ROWS: { key: ModeKey; label: string }[] = [
  { key: 'blockWrite', label: 'Blok ekleme ve değiştirme' },
  { key: 'blockDelete', label: 'Blok silme' },
  { key: 'penaltyRuleWrite', label: 'Ceza kuralı değiştirme' },
];

function PermissionsSection({ permissions }: { permissions: McpPermissions }) {
  const { c } = useTheme();
  const update = useUpdateSettings();
  const rows = [
    ...MODE_ROWS.map((r) => ({
      key: r.key as keyof McpPermissions,
      label: r.label,
      on: permissions[r.key] === 'auto',
      sub: permissions[r.key] === 'auto' ? 'Doğrudan uygular' : 'Her seferinde onay ister',
      set: (v: boolean) => update.mutate({ mcpPermissions: { [r.key]: v ? 'auto' : 'approve' } }),
    })),
    {
      key: 'journalRead' as const,
      label: 'Günlüğü okuma',
      on: permissions.journalRead,
      sub: permissions.journalRead ? 'Açık' : 'Kapalı',
      set: (v: boolean) => update.mutate({ mcpPermissions: { journalRead: v } }),
    },
  ];
  return (
    <View style={{ gap: 8 }}>
      <SectionTitle>İzinler</SectionTitle>
      {rows.map((r) => (
        <View key={r.key} style={[styles.row, { backgroundColor: c.s1, borderColor: c.line }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt style={{ fontSize: 15 }}>{r.label}</Txt>
            <Txt style={{ fontSize: 12 }} color="mut">
              {r.sub}
            </Txt>
          </View>
          <Switch label={r.label} value={r.on} onChange={r.set} />
        </View>
      ))}
      {update.isError ? (
        <Txt style={{ fontSize: 13 }} color="penTx">
          {errorMessage(update.error)}
        </Txt>
      ) : null}
    </View>
  );
}

function ToolsSection({ tools }: { tools: readonly string[] }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <SectionTitle>Claude'un kullanabildiği araçlar</SectionTitle>
      <View style={styles.tools}>
        {tools.map((t) => (
          <View key={t} style={[styles.tool, { borderColor: c.line }]}>
            <Txt style={{ fontFamily: fonts.mono, fontSize: 12 }} color="tx2">
              {t}
            </Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function ClaudeScreen() {
  const { c } = useTheme();
  const status = useMcpStatus();
  const settings = useSettings();
  const pending = usePendingChanges('pending');
  const permissions = settings.data?.mcpPermissions ?? status.data?.permissions;
  const pendingItems = pending.data?.items ?? [];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <SubHeader title="Claude bağlantısı" />
      <ScrollView contentContainerStyle={styles.content}>
        {status.isPending ? <Loading /> : null}
        {status.isError ? (
          <ErrorCard error={status.error} onRetry={() => void status.refetch()} />
        ) : null}

        {status.data ? <ServerCard status={status.data} /> : null}
        {pendingItems.length > 0 ? <PendingSection items={pendingItems} /> : null}
        {status.data && !status.data.lastAccessAt ? <Checklist status={status.data} /> : null}
        {status.data ? <AuditSection /> : null}
        {permissions ? <PermissionsSection permissions={permissions} /> : null}
        {status.data ? (
          <ToolsSection tools={status.data.tools.length ? status.data.tools : MCP_TOOLS} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 8, paddingHorizontal: 20, paddingBottom: 32, gap: 18 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  addressRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  address: {
    flex: 1,
    minWidth: 0,
    minHeight: HIT,
    padding: 12,
    borderRadius: 10,
    justifyContent: 'center',
  },
  copy: {
    width: HIT,
    height: HIT,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingCard: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  pendingDot: { width: 10, height: 10, borderRadius: 5 },
  pillBtn: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
  },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tool: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1 },
});
