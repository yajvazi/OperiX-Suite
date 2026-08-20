jest.mock('@react-native-async-storage/async-storage', () => {
    const store = new Map<string, string>();
    return {
        __esModule: true,
        default: {
            getItem: jest.fn(async (key: string) => store.get(key) ?? null),
            setItem: jest.fn(async (key: string, value: string) => { store.set(key, value); }),
            removeItem: jest.fn(async (key: string) => { store.delete(key); }),
            clear: jest.fn(async () => { store.clear(); }),
            getAllKeys: jest.fn(async () => [...store.keys()]),
        },
    };
});

jest.mock('expo-splash-screen', () => ({
    preventAutoHideAsync: jest.fn(async () => undefined),
    hideAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-clipboard', () => ({
    setStringAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-font', () => ({
    useFonts: jest.fn(() => [true]),
    isLoaded: jest.fn(() => true),
    loadAsync: jest.fn(async () => undefined),
}));

jest.mock('@expo-google-fonts/poppins', () => ({
    Poppins_400Regular: 'Poppins_400Regular',
    Poppins_500Medium: 'Poppins_500Medium',
    Poppins_600SemiBold: 'Poppins_600SemiBold',
    useFonts: jest.fn(() => [true]),
}));

jest.mock('expo-print', () => ({
    printToFileAsync: jest.fn(async () => ({ uri: 'file:///tmp/operix-test.pdf' })),
    printAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-sharing', () => ({
    isAvailableAsync: jest.fn(async () => true),
    shareAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-web-browser', () => ({
    maybeCompleteAuthSession: jest.fn(),
    openAuthSessionAsync: jest.fn(async () => ({ type: 'cancel' })),
    openBrowserAsync: jest.fn(async () => ({ type: 'opened' })),
}));

jest.mock('expo-auth-session', () => ({
    makeRedirectUri: jest.fn(() => 'operix-invoice://redirect'),
}));

jest.mock('expo-crypto', () => ({
    randomUUID: jest.fn(() => '00000000-0000-4000-8000-000000000001'),
}));

jest.mock('expo-local-authentication', () => ({
    authenticateAsync: jest.fn(async () => ({ success: true })),
    hasHardwareAsync: jest.fn(async () => true),
    isEnrolledAsync: jest.fn(async () => true),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('react-native-webview', () => ({
    WebView: ({ source }: { source?: { html?: string } }) => {
        const ReactRuntime = require('react');
        const { Text: NativeText, View: NativeView } = require('react-native');
        return ReactRuntime.createElement(
        NativeView,
        { testID: 'webview' },
        ReactRuntime.createElement(NativeText, null, source?.html || ''),
        );
    },
}));

jest.mock('@react-native-community/datetimepicker', () => ({
    __esModule: true,
    DateTimePickerAndroid: { open: jest.fn() },
    default: ({ onChange, testID = 'date-picker' }: { onChange?: (event: unknown, date: Date) => void; testID?: string }) => {
        const ReactRuntime = require('react');
        const { View: NativeView } = require('react-native');
        return ReactRuntime.createElement(NativeView, {
            testID,
            onTouchEnd: () => onChange?.({}, new Date('2026-08-19')),
        });
    },
}));

jest.mock('expo-camera', () => ({
    CameraView: () => {
        const ReactRuntime = require('react');
        const { View: NativeView } = require('react-native');
        return ReactRuntime.createElement(NativeView, { testID: 'camera-view' });
    },
    useCameraPermissions: jest.fn(() => [{ granted: true }, jest.fn(async () => undefined)]),
}));

jest.mock('react-native-svg', () => ({
    __esModule: true,
    default: ({ children }: { children?: unknown }) => {
        const ReactRuntime = require('react');
        const { View: NativeView } = require('react-native');
        return ReactRuntime.createElement(NativeView, null, children);
    },
    Svg: ({ children }: { children?: unknown }) => {
        const ReactRuntime = require('react');
        const { View: NativeView } = require('react-native');
        return ReactRuntime.createElement(NativeView, null, children);
    },
    SvgXml: () => {
        const ReactRuntime = require('react');
        const { View: NativeView } = require('react-native');
        return ReactRuntime.createElement(NativeView, { testID: 'svg-xml' });
    },
    Path: () => {
        const ReactRuntime = require('react');
        const { View: NativeView } = require('react-native');
        return ReactRuntime.createElement(NativeView, { testID: 'svg-path' });
    },
}));

jest.mock('lucide-react-native', () => new Proxy({ __esModule: true }, {
    get: (target, property: string | symbol) => {
        if (property === '__esModule') return true;
        if (property === 'default') return undefined;
        const Icon = ({ testID, ...props }: { testID?: string; [key: string]: unknown }) => {
            const ReactRuntime = require('react');
            const { View: NativeView } = require('react-native');
            return ReactRuntime.createElement(NativeView, { testID: testID || `icon-${String(property)}`, ...props });
        };
        Icon.displayName = `MockIcon(${String(property)})`;
        return Icon;
    },
}));

// Screens use focus effects for refresh-on-return. A component test does not
// need a full NavigationContainer just to exercise that refresh behavior.
jest.mock('@react-navigation/native', () => {
    const actual = jest.requireActual('@react-navigation/native');
    return {
        ...actual,
        useFocusEffect: (effect: () => void | (() => void)) => {
            const ReactRuntime = require('react');
            ReactRuntime.useEffect(effect, [effect]);
        },
    };
});

afterEach(() => {
    jest.clearAllMocks();
});
