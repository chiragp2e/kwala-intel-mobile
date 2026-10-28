import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/auth/AuthContext';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import type { RootStackParamList } from './src/navigation/types';
import { ChatScreen } from './src/screens/ChatScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { SignInScreen } from './src/screens/SignInScreen';
import { colors } from './src/theme/tokens';

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.background, card: colors.background, border: colors.border, primary: colors.primary },
};

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <ErrorBoundary>
        <AuthProvider>
          <NavigationContainer theme={navTheme}>
            <Stack.Navigator screenOptions={{ contentStyle: { backgroundColor: colors.background } }}>
              <Stack.Screen name="Chat" component={ChatScreen} options={{ headerShown: false }} />
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
              <Stack.Screen name="SignIn" component={SignInScreen} options={{ headerShown: false, presentation: 'modal' }} />
            </Stack.Navigator>
          </NavigationContainer>
        </AuthProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
