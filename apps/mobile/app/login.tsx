import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyboardAvoidingView, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { loginBodySchema } from '@takip/shared';
import { Button } from '@/components/Button';
import { Field, Input } from '@/components/Field';
import { errorMessage } from '@/components/StateViews';
import { Txt } from '@/components/Txt';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/theme/ThemeProvider';

interface FormValues {
  email: string;
  password: string;
}

export default function LoginScreen() {
  const { c } = useTheme();
  const login = useAuthStore((s) => s.login);
  const [serverError, setServerError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(loginBodySchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await login(values);
    } catch (e) {
      setServerError(errorMessage(e));
    }
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Txt variant="label" color="mut" style={{ fontSize: 12 }}>
            KİŞİSEL TAKİP
          </Txt>
          <Txt variant="screenTitle">Giriş yap</Txt>
          <Controller
            control={control}
            name="email"
            render={({ field, fieldState }) => (
              <Field label="E-posta" error={fieldState.error?.message}>
                <Input
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  invalid={!!fieldState.error}
                />
              </Field>
            )}
          />
          <Controller
            control={control}
            name="password"
            render={({ field, fieldState }) => (
              <Field label="Şifre" error={fieldState.error?.message}>
                <Input
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  secureTextEntry
                  autoComplete="password"
                  onSubmitEditing={() => void onSubmit()}
                  invalid={!!fieldState.error}
                />
              </Field>
            )}
          />
          {serverError ? (
            <Txt variant="caption" color="penTx">
              {serverError}
            </Txt>
          ) : null}
          <Button
            label="Giriş yap"
            onPress={() => void onSubmit()}
            loading={formState.isSubmitting}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 48, gap: 18 },
});
