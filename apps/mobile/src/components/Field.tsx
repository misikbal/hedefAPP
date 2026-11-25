import type { ReactNode } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { fonts } from '@/theme/typography';
import { Txt } from './Txt';

/** Etiket + içerik + hata satırı */
export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Txt variant="caption" color="mut">
        {label}
      </Txt>
      {children}
      {error ? (
        <Txt variant="caption" color="penTx">
          {error}
        </Txt>
      ) : null}
    </View>
  );
}

export function Input({
  mono,
  invalid,
  style,
  ...rest
}: TextInputProps & { mono?: boolean; invalid?: boolean }) {
  const { c } = useTheme();
  return (
    <TextInput
      placeholderTextColor={c.mut}
      {...rest}
      style={[
        styles.input,
        {
          backgroundColor: c.s1,
          borderColor: invalid ? c.pen : c.line,
          color: c.tx,
          fontFamily: mono ? fonts.mono : fonts.body,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  input: {
    height: 48,
    borderRadius: radius.input,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 15,
  },
});
