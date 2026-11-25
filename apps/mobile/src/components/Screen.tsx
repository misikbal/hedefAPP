import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from './Txt';

interface Props {
  title: string;
  /** Başlığın üstündeki tek genişlikli etiket (ör. "SALI · 24 KASIM") */
  eyebrow?: string;
  right?: ReactNode;
  children?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}

export function Screen({ title, eyebrow, right, children, refreshing = false, onRefresh }: Props) {
  const { c } = useTheme();
  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: c.bg }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={c.acc}
              colors={[c.acc]}
              progressBackgroundColor={c.s1}
            />
          ) : undefined
        }
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            {eyebrow ? (
              <Txt variant="label" color="mut" style={{ fontSize: 12 }}>
                {eyebrow}
              </Txt>
            ) : null}
            <Txt variant="screenTitle">{title}</Txt>
          </View>
          {right}
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 16, gap: 18 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerText: { flex: 1, gap: 6 },
});
