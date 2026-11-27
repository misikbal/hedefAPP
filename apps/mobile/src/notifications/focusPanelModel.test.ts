import { describe, expect, it } from 'vitest';
import type { FocusSession, GoalSummary, Penalty } from '@takip/shared';
import { buildFocusPanelModel, panelText, panelToggleUrl } from './focusPanelModel';

const NOW = Date.parse('2026-11-27T10:00:00Z'); // 13:00 İstanbul

const session = (over: Partial<FocusSession> = {}): FocusSession =>
  ({
    id: 's1',
    label: 'KODMIS — tema',
    plannedMinutes: 50,
    startedAt: new Date(NOW - 20 * 60_000).toISOString(),
    endedAt: null,
    pausedMs: 0,
    pausedAt: null,
    status: 'running',
    interruptions: 0,
    backgroundMs: 0,
    ...over,
  }) as unknown as FocusSession;

const goal = (name: string, current: number, target: number, status: GoalSummary['status']) =>
  ({ id: name, name, current, target, unit: 'saat', status }) as unknown as GoalSummary;

const penalty = (text: string) =>
  ({ id: text, text, dueAt: '2026-11-27T15:00:00Z' }) as unknown as Penalty;

describe('buildFocusPanelModel', () => {
  it('çalışan seans: geri sayım bitişi, hedefler açıklar önce, cezalar', () => {
    const m = buildFocusPanelModel(
      session(),
      [goal('Kitap', 5, 5, 'done'), goal('Almanca', 1, 4, 'behind')],
      [penalty('20 şınav')],
      NOW,
      NOW + 5_000, // cihaz saati 5 sn ileride
    );
    expect(m.status).toBe('running');
    expect(m.eyebrow).toBe('ODAKTA · KODMIS — TEMA');
    expect(m.endAt).toBe(NOW + 5_000 + 30 * 60_000);
    expect(m.meta).toBe('Bitiş 13:30 · 50 dk');
    expect(m.summary).toBe('Bitiş 13:30 · 50 dk · 1/2 hedef · 1 ceza');
    expect(m.goals.map((g) => g.name)).toEqual(['Almanca', 'Kitap']);
    expect(m.goals[0]).toMatchObject({ progress: 0.25, done: false });
    expect(m.goals[1]!.value.startsWith('✓ ')).toBe(true);
    expect(m.penalties).toEqual([{ text: '20 şınav', due: "18:00'e kadar" }]);
    expect(m.actionLabel).toBe('Duraklat');
    expect(m.actionUrl).toBe(panelToggleUrl({ id: 's1', status: 'running' }));
  });

  it('duraklatılmış seans: sabit kalan dakika, Devam et düğmesi', () => {
    const m = buildFocusPanelModel(
      session({ status: 'paused', pausedAt: new Date(NOW - 5 * 60_000).toISOString() } as Partial<FocusSession>),
      [],
      [],
      NOW,
      NOW,
    );
    expect(m.status).toBe('paused');
    expect(m.staticText).toBe('35 dk');
    expect(m.actionLabel).toBe('Devam et');
    expect(m.goals).toEqual([]);
    expect(panelText(m).body).toContain('35 dk kaldı');
  });

  it('ikiden fazla ceza "2+" görünür, yalnız ikisi listelenir', () => {
    const m = buildFocusPanelModel(session(), [], [penalty('a'), penalty('b'), penalty('c')], NOW, NOW);
    expect(m.penalties).toHaveLength(2);
    expect(m.penaltiesTitle).toBe('AÇIK CEZALAR · 2+');
  });

  it('düğme bağlantısı seans kimliği ve durumunu taşır', () => {
    expect(panelToggleUrl({ id: 'ab', status: 'paused' })).toBe('takip://focus?panel=toggle&s=ab%3Apaused');
  });
});
