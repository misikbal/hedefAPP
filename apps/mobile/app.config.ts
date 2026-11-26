import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * API adresi: geliştirmede EXPO_PUBLIC_API_URL ile yerel IP verilir
 * (örn. http://192.168.1.10:3000/api/v1), üretimde https://takip.<alan-adı>/api/v1.
 */
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

/**
 * Push (Faz 5): EAS proje kimliği `eas init` çıktısından. Firebase dosyasının yolu
 * `GOOGLE_SERVICES_JSON` ile verilir: EAS Build'de dosya türünde ortam değişkeni, yerel
 * build'de `./google-services.json` (git'e girmez). Kurulum: docs/BILDIRIM_KURULUMU.md
 */
// Gizli değil: EAS proje kimliği (@kodmis/takip). Ortamdan verilirse o kullanılır.
const easProjectId = process.env.EAS_PROJECT_ID ?? '3d98e565-faf3-4e2a-91fc-1179adc7aa0b';
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Takip',
  slug: 'takip',
  owner: 'kodmis',
  scheme: 'takip',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#0E1116',
  android: {
    package: 'com.takip.app',
    adaptiveIcon: {
      backgroundColor: '#0E1116',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    ...(googleServicesFile ? { googleServicesFile } : {}),
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-status-bar',
    ['expo-notifications', { color: '#F0A63A', defaultChannel: 'reminders' }],
    [
      'expo-splash-screen',
      { image: './assets/splash-icon.png', imageWidth: 160, backgroundColor: '#0E1116' },
    ],
    [
      'react-native-android-widget',
      {
        widgets: [
          {
            name: 'TodayWidget',
            label: 'Takip — Bugün',
            description: 'Bugünün blokları, hedefler ve bekleyen ceza',
            minWidth: '250dp',
            minHeight: '110dp',
            targetCellWidth: 4,
            targetCellHeight: 2,
            resizeMode: 'horizontal|vertical',
            updatePeriodMillis: 30 * 60 * 1000,
          },
        ],
      },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: { apiUrl, eas: { projectId: easProjectId } },
});
