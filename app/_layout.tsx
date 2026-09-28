import SplashScreen from '@/components/SplashScreen';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import 'react-native-reanimated';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthProvider } from '../context/AuthContext';
import { useWebTheme, WebThemeProvider } from '../context/WebThemeContext';
import { usePushNotifications } from '../hooks/usePushNotifications';

// Everything visible in this app is the WebView's page, so the status bar
// follows the web app's own theme (reported over WebThemeContext by
// zirkly-web's ThemeContext.jsx).
//
// The device's appearance setting is deliberately NOT the fallback here.
// zirkly-web drives its theme purely from its in-app toggle persisted in
// localStorage — Tailwind is `darkMode: 'class'` and nothing there reads
// prefers-color-scheme — so a dark-mode phone still renders a light page.
// Falling back to the OS scheme therefore styled the bar for dark while the
// page was light, i.e. white icons on a near-white background, until the
// first THEME_CHANGED landed. 'light' matches the web app's own default.
function AppStatusBar({ splashVisible }: { splashVisible: boolean }) {
  const { webTheme } = useWebTheme();
  const scheme = webTheme ?? 'light';
  // The splash is a dark purple gradient, so dark icons would be nearly
  // invisible over it regardless of the theme underneath.
  const barStyle = splashVisible ? 'light' : scheme === 'dark' ? 'light' : 'dark';

  return (
    // backgroundColor is Android-only — iOS status bars are always a
    // transparent overlay, so `style` (icon color) is all that applies
    // there; the app.config.js statusBarBackgroundColor values are just
    // the static pre-JS default those platforms fall back to.
    <StatusBar
      style={barStyle}
      backgroundColor={scheme === 'dark' ? '#111827' : '#F9FAFB'}
    />
  );
}

// React Navigation's own theme. This has to follow the web app's theme rather
// than the device's, because its `dark` flag is what decides the status bar
// style each newly presented screen asks for on iOS. Driven by the device
// scheme, a dark-mode phone showing a light page made every pushed screen
// (Notifications / Messages / Profile) request white status bar icons over a
// near-white page, overriding the root <StatusBar> above until a theme toggle
// forced it to re-assert. The initial screen never showed it — nothing is
// pushed to reach it.
function AppNavigationTheme({ children }: { children: React.ReactNode }) {
  const { webTheme } = useWebTheme();
  return (
    <ThemeProvider value={webTheme === 'dark' ? DarkTheme : DefaultTheme}>
      {children}
    </ThemeProvider>
  );
}

type RootLayoutContentProps = {
  onWebViewReady?: () => void;
};

function RootLayoutContent({ onWebViewReady }: RootLayoutContentProps) {
  const insets = useSafeAreaInsets();
  usePushNotifications();

  // Trigger onWebViewReady when the component mounts
  // The actual WebView loading callback will be handled via context
  useEffect(() => {
    // For now, we signal ready after a brief delay to allow WebView to start loading
    // This can be improved with a proper WebView ready context
    const timer = setTimeout(() => {
      onWebViewReady?.();
    }, 500);
    return () => clearTimeout(timer);
  }, [onWebViewReady]);

  return (
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="+not-found" />
        </Stack>
      </View>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  const [showSplash, setShowSplash] = useState(true);
  const [webViewReady, setWebViewReady] = useState(false);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Minimum splash duration
  useEffect(() => {
    const timer = setTimeout(() => {
      setMinTimeElapsed(true);
    }, 2500); // Minimum time to show splash
    return () => clearTimeout(timer);
  }, []);

  // Dismiss splash when both conditions are met
  useEffect(() => {
    if (minTimeElapsed && webViewReady && showSplash) {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }).start(() => setShowSplash(false));
    }
  }, [minTimeElapsed, webViewReady, showSplash]);

  if (!loaded) {
    return null;
  }

  return (
    <WebThemeProvider>
      <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
        <AppStatusBar splashVisible={showSplash} />
        {/* Main app content */}
        <SafeAreaProvider>
          <AuthProvider>
            <AppNavigationTheme>
              <View style={{ flex: 1 }}>
                <RootLayoutContent onWebViewReady={() => setWebViewReady(true)} />
              </View>
            </AppNavigationTheme>
          </AuthProvider>
        </SafeAreaProvider>

      {/* Splash screen as overlay - outside SafeAreaProvider to cover full screen */}
      {showSplash && (
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            opacity: fadeAnim,
            zIndex: 999,
          }}
          pointerEvents="none"
        >
          <SplashScreen />
        </Animated.View>
      )}
      </View>
    </WebThemeProvider>
  );
}