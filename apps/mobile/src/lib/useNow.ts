import { useEffect, useState } from 'react';

/** Duvar saati; `intervalMs` aralıkla yeniden çizer (geri sayımlar için). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
