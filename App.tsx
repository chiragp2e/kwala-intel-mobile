import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold } from '@expo-google-fonts/geist';
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { Newsreader_400Regular_Italic, Newsreader_500Medium } from '@expo-google-fonts/newsreader';
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
import { AboutScreen } from './src/screens/AboutScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { NotificationsScreen } from './src/screens/NotificationsScreen';
import { PricingScreen } from './src/screens/PricingScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { SignInScreen } from './src/screens/SignInScreen';
import { colors, fonts } from './src/theme/tokens';

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
  // Header titles and back labels in the brand typeface, not the system font.
  fonts: {
    regular: { fontFamily: fonts.regular, fontWeight: '400' as const },
    medium: { fontFamily: fonts.medium, fontWeight: '500' as const },
    bold: { fontFamily: fonts.semibold, fontWeight: '600' as const },
    heavy: { fontFamily: fonts.bold, fontWeight: '700' as const },
  },
};

/** Every pushed screen's header. */
const header = (title: string) => ({
  title,
  headerStyle: { backgroundColor: colors.background },
  headerTintColor: colors.textPrimary,
  headerTitleStyle: { fontFamily: fonts.semibold },
  headerBackTitle: 'Back',
  headerBackTitleStyle: { fontFamily: fonts.regular },
});

export default function App() {
  const [loaded, error] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    Newsreader_500Medium,
    Newsreader_400Regular_Italic,
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
                      name="Pricing"
                      component={PricingScreen}
                      options={header('Pricing')}
                    />
                    <Stack.Screen
                      name="Profile"
                      component={ProfileScreen}
                      options={header('Profile')}
                    />
                    <Stack.Screen
                      name="About"
                      component={AboutScreen}
                      options={header('About Kwala Intel')}
                    />
                    <Stack.Screen
                      name="Notifications"
                      component={NotificationsScreen}
                      options={header('Notifications')}
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
