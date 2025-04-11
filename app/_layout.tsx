import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme, Alert, View } from 'react-native';
import { initDatabase, insertDefaultExercises, resetDatabase } from '../utils/database';
import { WorkoutProvider } from '@/context/WorkoutContext';
import ActiveWorkoutIndicator from '@/components/ActiveWorkoutIndicator';

// Prevent the splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  // Initialize database
  useEffect(() => {
    const setupDatabase = async () => {
      try {
        console.log('Initializing database...');
        await initDatabase();
        console.log('Database initialized successfully');
        
        console.log('Inserting default exercises...');
        await insertDefaultExercises();
        console.log('Default exercises inserted successfully');
      } catch (error) {
        console.error('Error setting up database:', error);
        Alert.alert('Database Error', 'Failed to initialize the database. The app may not function correctly.');
      }
    };
    
    setupDatabase();
  }, []);

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <WorkoutProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <View style={{ flex: 1 }}>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          </Stack>
          <ActiveWorkoutIndicator />
        </View>
      </ThemeProvider>
    </WorkoutProvider>
  );
}
