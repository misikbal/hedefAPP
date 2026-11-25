import { create } from 'zustand';
import { tokenPairSchema, type LoginBody } from '@takip/shared';
import { api, onSessionExpired } from '@/api/client';
import { clearTokens, loadTokens, saveTokens } from '@/api/tokens';
import { endFocusOnLogout } from '@/features/focus/actions';
import { unregisterPush } from '@/notifications/push';
import { cancelBlockReminders } from '@/notifications/reminders';

type Status = 'loading' | 'signedIn' | 'signedOut';

interface AuthState {
  status: Status;
  init: () => Promise<void>;
  login: (body: LoginBody) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()((set) => ({
  status: 'loading',
  init: async () => {
    const tokens = await loadTokens();
    set({ status: tokens ? 'signedIn' : 'signedOut' });
  },
  login: async (body) => {
    const res = await api<unknown>('/auth/login', { method: 'POST', body, auth: false });
    await saveTokens(tokenPairSchema.parse(res));
    set({ status: 'signedIn' });
  },
  logout: async () => {
    // Açık odak seansı "interrupted" olarak biter (token hâlâ geçerliyken).
    await endFocusOnLogout();
    // Bu cihaz artık bu hesaba push almaz; planlı blok hatırlatmaları silinir.
    await unregisterPush();
    await cancelBlockReminders();
    const tokens = await loadTokens();
    if (tokens) {
      await api('/auth/logout', {
        method: 'POST',
        body: { refreshToken: tokens.refreshToken },
        auth: false,
      }).catch(() => undefined);
    }
    await clearTokens();
    set({ status: 'signedOut' });
  },
}));

onSessionExpired(() => useAuthStore.setState({ status: 'signedOut' }));
