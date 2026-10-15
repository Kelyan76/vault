import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Unbounded_700Bold, Unbounded_900Black } from '@expo-google-fonts/unbounded';
import { SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { StoreProvider } from '@/store/store';
import { AuthProvider } from '@/features/auth/auth';
import { ServerBankProvider } from '@/features/bank/serverBank';
import { CelebrationHost } from '@/ui/Celebration';
import { colors } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Unbounded_700Bold,
    Unbounded_900Black,
    SpaceMono_700Bold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error]);

  // Si les polices échouent, on affiche quand même l'appli avec la police système.
  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StoreProvider>
            <ServerBankProvider>
            <StatusBar style="light" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'slide_from_right' }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
              <Stack.Screen name="transactions/new" options={{ presentation: 'modal' }} />
              <Stack.Screen name="savings/new" options={{ presentation: 'modal' }} />
              <Stack.Screen name="avoided/new" options={{ presentation: 'modal' }} />
              <Stack.Screen name="goals/new" options={{ presentation: 'modal' }} />
              <Stack.Screen name="budget/edit" options={{ presentation: 'modal' }} />
              <Stack.Screen name="review" options={{ presentation: 'modal' }} />
            </Stack>
            <CelebrationHost />
            </ServerBankProvider>
          </StoreProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
