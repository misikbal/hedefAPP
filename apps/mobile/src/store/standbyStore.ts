import { create } from 'zustand';

/** Odak sekmesi yatay masa saati modunda mı? Sekme çubuğu bu durumda gizlenir. */
export const useStandbyStore = create<{ active: boolean }>(() => ({ active: false }));

export const setStandbyActive = (active: boolean) => useStandbyStore.setState({ active });
