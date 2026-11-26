import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { queryClient } from '@/api/queryClient';
import { FocusLifecycle } from '@/features/focus/FocusLifecycle';
import { NotificationsLifecycle } from '@/notifications/NotificationsLifecycle';
import { useAuthStore } from '@/store/authStore';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { fontAssets } from '@/theme/typography';

void SplashScreen.preventAutoHideAsync();

function RootStack() {
  const { name, c } = useTheme();
  const status = useAuthStore((s) => s.status);
  const signedIn = status === 'signedIn';
  return (
    <>
      <StatusBar style={name === 'dark' ? 'light' : 'dark'} />
      {signedIn ? <FocusLifecycle /> : null}
      {signedIn ? <NotificationsLifecycle /> : null}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="blocks/new" />
          <Stack.Screen name="blocks/[id]/index" />
          <Stack.Screen name="blocks/[id]/edit" />
          <Stack.Screen name="goals/new" />
          <Stack.Screen name="goals/[id]/edit" />
          <Stack.Screen name="progress/index" />
          <Stack.Screen name="progress/new" />
          <Stack.Screen name="penalties/rules/new" />
          <Stack.Screen name="focus/done" options={{ gestureEnabled: false }} />
          <Stack.Screen name="journal/calendar" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="reports/[week]" />
          <Stack.Screen name="claude/index" />
          <Stack.Screen name="claude/pending/[id]" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const status = useAuthStore((s) => s.status);
  const init = useAuthStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  const ready = (fontsLoaded || !!fontError) && status !== 'loading';
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <RootStack />
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
