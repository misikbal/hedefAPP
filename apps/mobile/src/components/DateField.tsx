import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { fonts } from '@/theme/typography';
import { Txt } from './Txt';

const pad = (n: number) => String(n).padStart(2, '0');

interface Props {
  value: string; // YYYY-MM-DD
  onChange: (v: string) => void;
  label: string;
}

/** Yerel gün alanı; dokununca sistemin tarih seçicisi açılır. */
export function DateField({ value, onChange, label }: Props) {
  const { c, name } = useTheme();
  const [open, setOpen] = useState(false);
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];

  const handle = (e: DateTimePickerEvent, picked?: Date) => {
    setOpen(false);
    if (e.type === 'set' && picked) {
      onChange(`${picked.getFullYear()}-${pad(picked.getMonth() + 1)}-${pad(picked.getDate())}`);
    }
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        onPress={() => setOpen(true)}
        style={[styles.box, { backgroundColor: c.s1, borderColor: c.line }]}
      >
        <Txt style={{ fontFamily: fonts.mono, fontSize: 15 }}>{`${pad(d)}.${pad(m)}.${y}`}</Txt>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={new Date(y, m - 1, d)}
          mode="date"
          themeVariant={name}
          onChange={handle}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  box: {
    height: 48,
    borderRadius: radius.input,
    borderWidth: 1,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
});
