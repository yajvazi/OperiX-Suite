import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CalendarDays, Home, ListChecks, MoreHorizontal, PlusCircle } from 'lucide-react-native';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { getOperixBottomNavigationOptions, OperixBottomNavigation } from '@invoice-monorepo/ui';
import { brand } from '../theme/brand';
import type { MainTabParamList, RootStackParamList } from './types';
import { SignInScreen } from '../screens/Auth/SignInScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { BookingsScreen } from '../screens/BookingsScreen';
import { NewBookingScreen } from '../screens/NewBookingScreen';
import { CalendarScreen } from '../screens/CalendarScreen';
import { MoreScreen } from '../screens/MoreScreen';
import { BookingDetailScreen } from '../screens/BookingDetailScreen';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabs() {
  const { isDark } = useTheme();
  return (
    <Tab.Navigator tabBar={OperixBottomNavigation}
      screenOptions={({ route }) => ({
        ...getOperixBottomNavigationOptions(isDark, brand.primary),
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ color, size }) => {
          const Icon = route.name === 'Home' ? Home : route.name === 'Bookings' ? ListChecks : route.name === 'NewBooking' ? PlusCircle : route.name === 'Calendar' ? CalendarDays : MoreHorizontal;
          return <Icon color={color} size={route.name === 'NewBooking' ? 28 : size} strokeWidth={route.name === 'NewBooking' ? 2.6 : 2.2} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Home' }} />
      <Tab.Screen name="Bookings" component={BookingsScreen} options={{ title: 'Bookings' }} />
      <Tab.Screen name="NewBooking" component={NewBookingScreen} options={{ title: 'New booking', tabBarLabel: 'New' }} />
      <Tab.Screen name="Calendar" component={CalendarScreen} options={{ title: 'Calendar' }} />
      <Tab.Screen name="More" component={MoreScreen} options={{ title: 'More' }} />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  const { user, loading } = useAuth();
  if (loading) return <View style={styles.loading}><ActivityIndicator color={brand.primary} size="large" /></View>;

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      {user ? (
        <>
          <RootStack.Screen name="Main" component={MainTabs} />
          <RootStack.Screen name="BookingDetail" component={BookingDetailScreen} />
        </>
      ) : <RootStack.Screen name="Auth" component={SignInScreen} />}
    </RootStack.Navigator>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: brand.background, alignItems: 'center', justifyContent: 'center' },
  tabLabel: { fontSize: 10, fontWeight: '800' },
});
