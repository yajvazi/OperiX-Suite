import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { getOperixBottomNavigationOptions, getOperixNavigationTheme, OperixBottomNavigation } from '@invoice-monorepo/ui';
import { CalendarDays, House, Map, MoreHorizontal, Plus } from 'lucide-react-native';
import { brand } from '../theme/brand';
import { AuthStackParamList, MainTabParamList, RootStackParamList } from './types';
import { SignInScreen } from '../screens/Auth/SignInScreen';
import { HomeScreen } from '../screens/Home/HomeScreen';
import { ReserveScreen } from '../screens/Reserve/ReserveScreen';
import { FloorScreen } from '../screens/Floor/FloorScreen';
import { BookingsScreen } from '../screens/Bookings/BookingsScreen';
import { MoreScreen } from '../screens/More/MoreScreen';
import { registerDeskPushNotifications } from '../services/notifications';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

function AuthNavigator() {
  return <AuthStack.Navigator screenOptions={{ headerShown: false }}><AuthStack.Screen name="SignIn" component={SignInScreen} /></AuthStack.Navigator>;
}

function MainTabs() {
  const { isDark } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  React.useEffect(() => {
    if (user) void registerDeskPushNotifications().catch(() => undefined);
  }, [user]);
  React.useEffect(() => {
    const openDeepLink = (value: unknown) => {
      const link = typeof value === 'string' ? value : '';
      const reservationId = link.match(/reservation\/(\d+)/i)?.[1];
      const resourceId = link.match(/resource\/(\d+)/i)?.[1];
      const floor = link.match(/floor\/([^/?#]+)/i)?.[1];
      const team = link.match(/team\/([^/?#]+)/i)?.[1];
      if (reservationId || link.includes('/bookings')) {
        navigation.navigate('Bookings', reservationId ? { reservationId: Number(reservationId) } : undefined);
      } else if (floor || resourceId || link.includes('/floor')) {
        navigation.navigate('Floor', {
          floor: floor ? decodeURIComponent(floor) : undefined,
          resourceId: resourceId ? Number(resourceId) : undefined,
        });
      } else if (team || link.includes('/team')) {
        navigation.navigate('Home', { team: team ? decodeURIComponent(team) : undefined });
      }
    };
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      openDeepLink(response.notification.request.content.data?.deepLink);
    });
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      openDeepLink(response?.notification.request.content.data?.deepLink);
    });
    return () => subscription.remove();
  }, [navigation]);
  return <Tabs.Navigator initialRouteName="Home" tabBar={OperixBottomNavigation} screenOptions={{ ...getOperixBottomNavigationOptions(isDark, brand.primary), tabBarLabelStyle: { fontSize: 10, fontWeight: '600' } }}>
    <Tabs.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: 'Home', tabBarIcon: ({ color }) => <House color={color} size={21} /> }} />
    <Tabs.Screen name="Reserve" component={ReserveScreen} options={{ tabBarLabel: 'Reserve', tabBarIcon: ({ color }) => <View style={{ width: 42, height: 42, marginTop: -18, borderRadius: 21, backgroundColor: brand.primary, alignItems: 'center', justifyContent: 'center', shadowColor: brand.primary, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 }}><Plus color="#fff" size={23} /></View> }} />
    <Tabs.Screen name="Floor" component={FloorScreen} options={{ tabBarLabel: 'Floor', tabBarIcon: ({ color }) => <Map color={color} size={21} /> }} />
    <Tabs.Screen name="Bookings" component={BookingsScreen} options={{ tabBarLabel: 'Bookings', tabBarIcon: ({ color }) => <CalendarDays color={color} size={21} /> }} />
    <Tabs.Screen name="More" component={MoreScreen} options={{ tabBarLabel: 'More', tabBarIcon: ({ color }) => <MoreHorizontal color={color} size={22} /> }} />
  </Tabs.Navigator>;
}

export function AppNavigator() {
  const { user, loading } = useAuth();
  const { isDark } = useTheme();
  if (loading) return <View style={styles.loading}><ActivityIndicator color={brand.primary} size="large" /><Text style={styles.loadingText}>Opening OperiX Desk…</Text></View>;
  return <NavigationContainer theme={getOperixNavigationTheme(isDark, brand.primary)}>{user ? <RootStack.Navigator screenOptions={{ headerShown: false }}><RootStack.Screen name="MainTabs" component={MainTabs} /></RootStack.Navigator> : <AuthNavigator />}</NavigationContainer>;
}

const styles = StyleSheet.create({ loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: brand.background }, loadingText: { marginTop: 12, color: brand.muted, fontSize: 14, fontWeight: '600' } });
