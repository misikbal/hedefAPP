import type { ComponentType } from 'react';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  FocusIcon,
  GoalsIcon,
  JournalIcon,
  MoneyIcon,
  PenaltyIcon,
  TodayIcon,
  WeekIcon,
} from '@/components/icons';
import { useTheme } from '@/theme/ThemeProvider';
import { useStandbyStore } from '@/store/standbyStore';
import { fonts } from '@/theme/typography';

const TABS: { name: string; title: string; Icon: ComponentType<{ color: string }> }[] = [
  { name: 'index', title: 'Bugün', Icon: TodayIcon },
  { name: 'week', title: 'Hafta', Icon: WeekIcon },
  { name: 'focus', title: 'Odak', Icon: FocusIcon },
  { name: 'goals', title: 'Hedef', Icon: GoalsIcon },
  { name: 'penalties', title: 'Ceza', Icon: PenaltyIcon },
  { name: 'journal', title: 'Günlük', Icon: JournalIcon },
  { name: 'money', title: 'Para', Icon: MoneyIcon },
];

export default function TabsLayout() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const standby = useStandbyStore((s) => s.active);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: c.bg },
        tabBarStyle: {
          backgroundColor: c.nav,
          borderTopColor: c.line,
          borderTopWidth: 1,
          height: 68 + insets.bottom,
          paddingTop: 8,
          ...(standby ? { display: 'none' as const } : null),
        },
        tabBarActiveTintColor: c.accTx,
        tabBarInactiveTintColor: c.mut,
        tabBarLabelStyle: { fontFamily: fonts.body, fontSize: 10, marginTop: 2 },
        tabBarItemStyle: { paddingHorizontal: 0 },
      }}
    >
      {TABS.map(({ name, title, Icon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{ title, tabBarIcon: ({ color }) => <Icon color={color as string} /> }}
        />
      ))}
    </Tabs>
  );
}
