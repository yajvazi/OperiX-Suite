export type MainTabParamList = {
  Home: { team?: string } | undefined;
  Reserve: undefined;
  Floor: { floor?: string; resourceId?: number } | undefined;
  Bookings: { reservationId?: number } | undefined;
  More: undefined;
};

export type RootStackParamList = {
  MainTabs: { screen?: keyof MainTabParamList } | undefined;
};

export type AuthStackParamList = {
  SignIn: undefined;
};
