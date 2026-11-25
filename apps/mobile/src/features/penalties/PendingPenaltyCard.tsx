import { StyleSheet, View } from 'react-native';
import { countdownText, type Penalty } from '@takip/shared';
import { Button } from '@/components/Button';
import { Txt } from '@/components/Txt';
import { useNow } from '@/lib/useNow';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';

interface Props {
  penalty: Penalty;
  busy: boolean;
  onDone: () => void;
  onPostpone: () => void;
}

const STATUS_LABEL: Record<Penalty['status'], string> = {
  pending: 'BEKLEYEN CEZA',
  postponed: 'ERTELENEN CEZA',
  escalated: 'BÜYÜYEN CEZA',
  done: 'YAPILDI',
};

/** Cezalar ekranındaki büyük kart: canlı geri sayım (duvar saatine göre), Yaptım / Ertele (×2). */
export function PendingPenaltyCard({ penalty, busy, onDone, onPostpone }: Props) {
  const { c } = useTheme();
  const now = useNow();
  const left = new Date(penalty.dueAt).getTime() - now;
  return (
    <View style={[styles.card, { backgroundColor: c.penBg, borderColor: c.pen }]}>
      <View style={styles.head}>
        <Txt style={[styles.mono, { fontSize: 11, letterSpacing: 0.9, color: c.penTx }]}>
          {STATUS_LABEL[penalty.status]}
        </Txt>
        <Txt
          accessibilityLabel={left > 0 ? `Kalan süre ${countdownText(left)}` : 'Süre doldu'}
          style={[styles.mono, { fontSize: 13, color: c.penTx }]}
        >
          {left > 0 ? countdownText(left) : 'süre doldu'}
        </Txt>
      </View>
      <Txt style={{ fontFamily: fonts.display, fontSize: 24 }}>{penalty.text}</Txt>
      <Txt style={{ fontSize: 13, lineHeight: 19, color: c.tx2 }}>
        {`Sebep: ${penalty.reason}. ${penalty.consequence}`}
      </Txt>
      <View style={styles.actions}>
        <Button
          label="Yaptım"
          variant="dangerSolid"
          style={{ flex: 1 }}
          disabled={busy}
          onPress={onDone}
        />
        <Button label="Ertele (×2)" variant="danger" disabled={busy} onPress={onPostpone} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, padding: 16, borderRadius: 16, borderWidth: 1 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mono: { fontFamily: fonts.mono },
  actions: { flexDirection: 'row', gap: 8 },
});
