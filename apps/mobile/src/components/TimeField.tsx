import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { fonts } from '@/theme/typography';
import { Txt } from './Txt';

const pad = (n: number) => String(n).padStart(2, '0');

interface Props {
  value: string; // "HH:mm"
  onChange: (v: string) => void;
  label: string;
  invalid?: boolean;
}

/** "HH:mm" alanı; dokununca sistemin 24 saatlik saat seçicisi açılır. */
export function TimeField({ value, onChange, label, invalid }: Props) {
  const { c, name } = useTheme();
  const [open, setOpen] = useState(false);
  const [h, m] = value.split(':').map(Number) as [number, number];
  const date = new Date(2000, 0, 1, h, m);

  const handle = (e: DateTimePickerEvent, picked?: Date) => {
    setOpen(false);
    if (e.type === 'set' && picked)
      onChange(`${pad(picked.getHours())}:${pad(picked.getMinutes())}`);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        onPress={() => setOpen(true)}
        style={[styles.box, { backgroundColor: c.s1, borderColor: invalid ? c.pen : c.line }]}
      >
        <Txt style={{ fontFamily: fonts.mono, fontSize: 15 }}>{value}</Txt>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={date}
          mode="time"
          is24Hour
          minuteInterval={5}
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
