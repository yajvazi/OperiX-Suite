import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { deskApi } from './deskApi';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerDeskPushNotifications() {
  if (Platform.OS === 'web') return null;
  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') return null;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID })).data;
  await deskApi.registerDevice({ push_token: token, platform: Platform.OS, device_name: 'OperiX Desk mobile' });
  return token;
}
