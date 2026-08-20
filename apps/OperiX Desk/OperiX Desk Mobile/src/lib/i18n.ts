const messages = {
  en: {
    home: 'Home', reserve: 'Reserve', floor: 'Floor', bookings: 'Bookings', more: 'More',
    goodMorning: 'Good morning', goodAfternoon: 'Good afternoon', goodEvening: 'Good evening',
    workplaceToday: "Here's what's happening in your workplace today.", todayReservation: "Today's reservation",
    noReservation: 'No reservation today', reserveDesk: 'Reserve a desk', viewFloor: 'View on floor',
    availableDesks: 'Available desks', peopleInOffice: 'People in office', availableRooms: 'Available rooms',
    officeCapacity: 'Office capacity', quickActions: 'Quick actions', findTeam: 'Find near my team',
    whoIsIn: "Who's in today", upcoming: 'Upcoming reservations', noPeople: 'No colleagues have booked a desk today.',
    retry: 'Retry', loading: 'Loading workplace…', failed: 'We could not load your workplace data.',
    office: 'Office', date: 'Date', floorLabel: 'Floor', preferences: 'Preferences', available: 'Available desks',
    chooseDesk: 'Choose a desk', confirm: 'Confirm reservation', confirmed: 'Reservation confirmed',
    reserveFor: 'Reserve for', today: 'Today', tomorrow: 'Tomorrow', change: 'Change', cancel: 'Cancel',
    noResources: 'No resources are available for this selection.', signedOut: 'Signed out', signOut: 'Sign out', profile: 'Profile',
    signIn: 'Sign in', email: 'Email', password: 'Password', signInAccount: 'Sign in with your OperiX account',
    signInFailed: 'Sign in failed. Check your account and try again.',
  },
  sq: {
    home: 'Kreu', reserve: 'Rezervo', floor: 'Kati', bookings: 'Rezervimet', more: 'Më shumë',
    goodMorning: 'Mirëmëngjes', goodAfternoon: 'Mirëdita', goodEvening: 'Mirëmbrëma',
    workplaceToday: 'Ja çfarë po ndodh në hapësirën tuaj të punës sot.', todayReservation: 'Rezervimi i sotëm',
    noReservation: 'Nuk ka rezervim sot', reserveDesk: 'Rezervo një tavolinë', viewFloor: 'Shiko në plan',
    availableDesks: 'Tavolina të lira', peopleInOffice: 'Njerëz në zyrë', availableRooms: 'Dhoma të lira',
    officeCapacity: 'Kapaciteti i zyrës', quickActions: 'Veprime të shpejta', findTeam: 'Pranë ekipit tim',
    whoIsIn: 'Kush është sot', upcoming: 'Rezervimet e ardhshme', noPeople: 'Asnjë koleg nuk ka rezervuar tavolinë sot.',
    retry: 'Provo përsëri', loading: 'Po ngarkohet hapësira…', failed: 'Të dhënat e hapësirës nuk u ngarkuan.',
    office: 'Zyra', date: 'Data', floorLabel: 'Kati', preferences: 'Preferencat', available: 'Tavolina të lira',
    chooseDesk: 'Zgjidh tavolinën', confirm: 'Konfirmo rezervimin', confirmed: 'Rezervimi u konfirmua',
    reserveFor: 'Rezervo për', today: 'Sot', tomorrow: 'Nesër', change: 'Ndrysho', cancel: 'Anulo',
    noResources: 'Nuk ka burime të lira për këtë zgjedhje.', signedOut: 'Dolët nga llogaria', signOut: 'Dilni nga llogaria', profile: 'Profili',
    signIn: 'Hyr', email: 'Email', password: 'Fjalëkalimi', signInAccount: 'Hyr me llogarinë tuaj OperiX',
    signInFailed: 'Hyrja dështoi. Kontrolloni llogarinë dhe provoni përsëri.',
  },
} as const;

export type Locale = keyof typeof messages;
export function t(key: keyof typeof messages.en, locale: string) {
  return messages[(locale === 'sq' ? 'sq' : 'en') as Locale][key] || messages.en[key] || key;
}
