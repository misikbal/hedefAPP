'use no memo';

import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { categoryColor } from '../theme/category';
import { themes, type ThemeColors, type ThemeName } from '../theme/tokens';
import { WIDGET_REFRESH_ACTION, WIDGET_URI } from './constants';
import type { WidgetBlock, WidgetGoal, WidgetModel, WidgetPenalty } from './model';

/**
 * Widget yalnızca Android'de ve development/EAS build'de yüklenir (bkz. `register.android.ts`).
 * Bileşenler RemoteViews'e çevrilir: yalnız paketin Flex/Text bileşenleri kullanılabilir.
 */

type Hex = `#${string}`;
const hex = (s: string) => s as Hex;
const MONO = 'monospace';

const openToday = { clickAction: 'OPEN_URI', clickActionData: { uri: WIDGET_URI.today } } as const;
const openPenalties = {
  clickAction: 'OPEN_URI',
  clickActionData: { uri: WIDGET_URI.penalties },
} as const;

function Shell({ c, children }: { c: ThemeColors; children: React.ReactNode }) {
  return (
    <FlexWidget
      {...openToday}
      accessibilityLabel="Takip, bugün"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        padding: 12,
        borderRadius: 16,
        backgroundColor: hex(c.bg),
        borderWidth: 1,
        borderColor: hex(c.line),
      }}
    >
      {children}
    </FlexWidget>
  );
}

function Message({ c, title, body }: { c: ThemeColors; title: string; body: string }) {
  return (
    <Shell c={c}>
      <TextWidget
        text="TAKİP"
        style={{ fontSize: 11, fontFamily: MONO, letterSpacing: 0.1, color: hex(c.mut) }}
      />
      <FlexWidget style={{ flex: 1, flexDirection: 'column', justifyContent: 'center' }}>
        <TextWidget text={title} style={{ fontSize: 16, fontWeight: '600', color: hex(c.tx) }} />
        <TextWidget
          text={body}
          maxLines={2}
          style={{ fontSize: 12, color: hex(c.tx2), marginTop: 4 }}
        />
      </FlexWidget>
    </Shell>
  );
}

function BlockRow({ c, b }: { c: ThemeColors; b: WidgetBlock }) {
  const emphasized = b.emphasis !== null;
  const titleColor =
    b.status === 'done' || b.status === 'skipped' ? c.mut : b.status === 'missed' ? c.penTx : c.tx;
  const statusColor =
    b.emphasis !== null
      ? c.accTx
      : b.status === 'done'
        ? c.okTx
        : b.status === 'missed'
          ? c.penTx
          : c.mut;
  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        height: 20,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 4,
        borderRadius: 6,
        backgroundColor: hex(emphasized ? c.s2 : c.bg),
      }}
    >
      <FlexWidget
        style={{
          width: 3,
          height: 12,
          borderRadius: 2,
          backgroundColor: hex(categoryColor(c, b.category)),
        }}
      />
      <TextWidget
        text={b.time}
        style={{ fontSize: 11, fontFamily: MONO, color: hex(c.mut), marginLeft: 6 }}
      />
      <FlexWidget style={{ flex: 1, marginLeft: 6 }}>
        <TextWidget
          text={b.title}
          maxLines={1}
          truncate="END"
          style={{
            fontSize: 12,
            fontWeight: emphasized ? '600' : '400',
            color: hex(titleColor),
          }}
        />
      </FlexWidget>
      <TextWidget
        text={b.statusLabel}
        style={{ fontSize: 10, fontFamily: MONO, color: hex(statusColor), marginLeft: 4 }}
      />
    </FlexWidget>
  );
}

function ProgressBar({ c, ratio, color }: { c: ThemeColors; ratio: number; color: string }) {
  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        height: 4,
        flexDirection: 'row',
        borderRadius: 2,
        backgroundColor: hex(c.s2),
      }}
    >
      {ratio > 0 ? (
        <FlexWidget
          style={{ flex: ratio, height: 4, borderRadius: 2, backgroundColor: hex(color) }}
        />
      ) : null}
      {ratio < 1 ? <FlexWidget style={{ flex: 1 - ratio, height: 4 }} /> : null}
    </FlexWidget>
  );
}

function GoalRow({ c, g }: { c: ThemeColors; g: WidgetGoal }) {
  const color = g.done ? c.ok : categoryColor(c, g.category);
  return (
    <FlexWidget style={{ width: 'match_parent', flexDirection: 'column', marginBottom: 8 }}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center' }}>
        <FlexWidget style={{ flex: 1 }}>
          <TextWidget
            text={g.name}
            maxLines={1}
            truncate="END"
            style={{ fontSize: 12, color: hex(c.tx) }}
          />
        </FlexWidget>
        <TextWidget
          text={g.valueText}
          style={{ fontSize: 10, fontFamily: MONO, color: hex(c.mut), marginLeft: 4 }}
        />
      </FlexWidget>
      <FlexWidget style={{ width: 'match_parent', marginTop: 4 }}>
        <ProgressBar c={c} ratio={g.ratio} color={color} />
      </FlexWidget>
    </FlexWidget>
  );
}

function PenaltyRow({ c, p }: { c: ThemeColors; p: WidgetPenalty }) {
  return (
    <FlexWidget
      {...openPenalties}
      accessibilityLabel={`Bekleyen ceza: ${p.text}, ${p.remaining}`}
      style={{
        width: 'match_parent',
        height: 24,
        marginTop: 4,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        borderRadius: 8,
        backgroundColor: hex(c.penBg),
        borderWidth: 1,
        borderColor: hex(c.pen),
      }}
    >
      <FlexWidget style={{ flex: 1 }}>
        <TextWidget
          text={p.text}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 12, fontWeight: '600', color: hex(c.penTx) }}
        />
      </FlexWidget>
      <TextWidget
        text={p.remaining}
        style={{ fontSize: 10, fontFamily: MONO, color: hex(c.penTx), marginLeft: 6 }}
      />
    </FlexWidget>
  );
}

function TodayView({ c, m }: { c: ThemeColors; m: Extract<WidgetModel, { kind: 'today' }> }) {
  const blocks = (
    <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
      {m.emptyText ? (
        <TextWidget text={m.emptyText} style={{ fontSize: 12, color: hex(c.mut), marginTop: 2 }} />
      ) : (
        m.blocks.map((b) => <BlockRow key={b.id} c={c} b={b} />)
      )}
      {m.hiddenBlocks > 0 && !m.emptyText ? (
        <TextWidget
          text={`+${m.hiddenBlocks} blok`}
          style={{ fontSize: 10, fontFamily: MONO, color: hex(c.mut), marginLeft: 4 }}
        />
      ) : null}
    </FlexWidget>
  );
  const goals =
    m.goals.length > 0 ? (
      <FlexWidget
        style={
          m.layout.twoColumns
            ? { flex: 1, flexDirection: 'column', marginLeft: 12 }
            : { width: 'match_parent', flexDirection: 'column', marginTop: 6 }
        }
      >
        {m.goals.map((g) => (
          <GoalRow key={g.id} c={c} g={g} />
        ))}
      </FlexWidget>
    ) : null;

  return (
    <Shell c={c}>
      <FlexWidget
        style={{ width: 'match_parent', height: 22, flexDirection: 'row', alignItems: 'center' }}
      >
        <FlexWidget style={{ flex: 1 }}>
          <TextWidget
            text={m.eyebrow}
            maxLines={1}
            truncate="END"
            style={{ fontSize: 11, fontFamily: MONO, letterSpacing: 0.08, color: hex(c.mut) }}
          />
        </FlexWidget>
        {m.stale ? (
          <TextWidget
            text="güncellenemedi"
            clickAction={WIDGET_REFRESH_ACTION}
            accessibilityLabel="Güncellenemedi, yeniden dene"
            style={{ fontSize: 10, fontFamily: MONO, color: hex(c.penTx), marginLeft: 6 }}
          />
        ) : null}
        {m.counter ? (
          <TextWidget
            text={m.counter}
            style={{ fontSize: 11, fontFamily: MONO, color: hex(c.accTx), marginLeft: 6 }}
          />
        ) : null}
      </FlexWidget>
      {m.layout.twoColumns ? (
        <FlexWidget style={{ width: 'match_parent', flex: 1, flexDirection: 'row' }}>
          <FlexWidget style={{ flex: 3, flexDirection: 'column' }}>{blocks}</FlexWidget>
          {goals ? (
            <FlexWidget style={{ flex: 2, flexDirection: 'row' }}>{goals}</FlexWidget>
          ) : null}
        </FlexWidget>
      ) : (
        <FlexWidget style={{ width: 'match_parent', flex: 1, flexDirection: 'column' }}>
          {blocks}
          {goals}
        </FlexWidget>
      )}
      {m.penalty ? <PenaltyRow c={c} p={m.penalty} /> : null}
    </Shell>
  );
}

export function TodayWidget({ model, theme }: { model: WidgetModel; theme: ThemeName }) {
  const c = themes[theme];
  switch (model.kind) {
    case 'signedOut':
      return (
        <Message c={c} title="Giriş yap" body="Bugünün programını görmek için uygulamayı aç." />
      );
    case 'unavailable':
      return (
        <Message
          c={c}
          title="Güncellenemedi"
          body="Sunucuya ulaşılamadı. Uygulamayı açınca yeniden denenir."
        />
      );
    case 'today':
      return <TodayView c={c} m={model} />;
  }
}
