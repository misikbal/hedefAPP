import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { api } from '@/api/client';
import { todayLocal } from '@/lib/date';

/**
 * `GET /export` yanıtını JSON dosyası olarak kaydeder ve paylaşma menüsünü açar
 * (Drive'a, dosyalara ya da e-postaya). Web'de tarayıcı indirmesi.
 */
export async function downloadBackup(): Promise<string> {
  const data = await api<unknown>('/export');
  const name = `takip-yedek-${todayLocal()}.json`;
  const text = JSON.stringify(data, null, 2);

  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    return name;
  }

  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(text);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Yedeği kaydet',
    });
  }
  return name;
}
