import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { getGuardStatus, isGuardSupported, isServiceEnabled, type GuardStatus } from './guard';

interface GuardInfo {
  supported: boolean;
  serviceOn: boolean;
  status: GuardStatus;
  refresh: () => void;
}

/** Hizmet ve engel durumu; öne gelince ve `intervalMs` aralıkla yenilenir (ayar ekranından dönüş). */
export function useGuardInfo(intervalMs = 5000): GuardInfo {
  const supported = isGuardSupported();
  const read = useCallback(() => ({ serviceOn: isServiceEnabled(), status: getGuardStatus() }), []);
  const [state, setState] = useState(read);
  const refresh = useCallback(() => setState(read()), [read]);

  useEffect(() => {
    if (!supported) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    const t = setInterval(refresh, intervalMs);
    return () => {
      sub.remove();
      clearInterval(t);
    };
  }, [supported, refresh, intervalMs]);

  return { supported, ...state, refresh };
}
