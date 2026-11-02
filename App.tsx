import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  BricolageGrotesque_400Regular,
  BricolageGrotesque_500Medium,
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
} from '@expo-google-fonts/bricolage-grotesque';
import { useFonts } from 'expo-font';
import React, { useCallback, useEffect, useState } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/auth/AuthContext';
import { AnimatedSplash } from './src/components/AnimatedSplash';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { preloadAssets } from './src/lib/preloadAssets';
import { QueryProvider } from './src/state/QueryProvider';
import type { RootStackParamList } from './src/navigation/types';
import { ChatScreen } from './src/screens/ChatScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { PricingScreen } from './src/screens/PricingScreen';
import { SignInScreen } from './src/screens/SignInScreen';
import { colors } from './src/theme/tokens';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
});

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.background,
    border: colors.border,
    primary: colors.primary,
  },
};

export default function App() {
  const [loaded, error] = useFonts({
    BricolageGrotesque_400Regular,
    BricolageGrotesque_500Medium,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
  });
  const [assetsReady, setAssetsReady] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  // Warm the first-screen images behind the splash; capped so a slow fetch cannot hold the app.
  useEffect(() => {
    const cap = setTimeout(() => setAssetsReady(true), 1200);
    preloadAssets().finally(() => setAssetsReady(true));
    return () => clearTimeout(cap);
  }, []);
  const onSplashDone = useCallback(() => setSplashDone(true), []);
  // If a font fails to load we carry on with the system font rather than blocking the app.
  const ready = (loaded || !!error) && assetsReady;
  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <StatusBar barStyle="light-content" />
        {ready ? (
          <ErrorBoundary>
            <AuthProvider>
              <QueryProvider>
                <NavigationContainer theme={navTheme}>
                  <Stack.Navigator
                    screenOptions={{
                      contentStyle: { backgroundColor: colors.background },
                    }}
                  >
                    <Stack.Screen
                      name="Chat"
                      component={ChatScreen}
                      options={{ headerShown: false }}
                    />
                    <Stack.Screen
                      name="History"
                      component={HistoryScreen}
                      options={{
                        title: 'Chat history',
                        headerStyle: { backgroundColor: colors.background },
                        headerTintColor: colors.textPrimary,
                        headerBackTitle: 'Back',
                      }}
                    />
                    <Stack.Screen
                      name="Pricing"
                      component={PricingScreen}
                      options={{
                        title: 'Pricing',
                        headerStyle: { backgroundColor: colors.background },
                        headerTintColor: colors.textPrimary,
                        headerBackTitle: 'Back',
                      }}
                    />
                    <Stack.Screen
                      name="SignIn"
                      component={SignInScreen}
                      options={{ headerShown: false, presentation: 'modal' }}
                    />
                  </Stack.Navigator>
                </NavigationContainer>
              </QueryProvider>
            </AuthProvider>
          </ErrorBoundary>
        ) : null}
        {splashDone ? null : (
          <AnimatedSplash ready={ready} onDone={onSplashDone} />
        )}
      </View>
    </SafeAreaProvider>
  );
}
