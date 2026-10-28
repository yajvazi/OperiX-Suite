import 'react-native-get-random-values';
import { registerRootComponent } from 'expo';
import { App } from './src/App';

// Development only: React Native reports an unhandled promise rejection without its stack ("undefined is not a
// function"). Print the stack so the failing call can be found in the Metro log.
if (__DEV__) {
    const report = (id: number, error: unknown) => {
        console.warn(`[unhandled promise ${id}]`, error instanceof Error ? error.stack || error.message : String(error));
    };
    const hermes = (globalThis as { HermesInternal?: { enablePromiseRejectionTracker?: (options: object) => void } }).HermesInternal;
    if (hermes?.enablePromiseRejectionTracker) {
        hermes.enablePromiseRejectionTracker({ allRejections: true, onUnhandled: report });
    } else {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('promise/setimmediate/rejection-tracking').enable({ allRejections: true, onUnhandled: report });
    }
}

registerRootComponent(App);
