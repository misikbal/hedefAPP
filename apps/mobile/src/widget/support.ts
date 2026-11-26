import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * Widget yerel modülü yalnız Android development/EAS build'de vardır. Expo Go'da paket
 * içe aktarılınca TurboModule bulunamadığı için hata verir; bu yüzden widget kodu yalnız
 * bu bayrak doğruyken `require` ile yüklenir.
 */
export const WIDGET_SUPPORTED =
  Platform.OS === 'android' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
