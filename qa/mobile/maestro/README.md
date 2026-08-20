# Maestro convention

Maestro is the standard E2E framework for OperiX Expo apps unless an app has a working Detox setup. App-specific flows live with the app in `.maestro/`; shared visual naming and report handling live in the central runner.

Every flow should:

1. launch the real app on a simulator/emulator;
2. use stable accessibility labels or `testID` values (`<screen>-<element>-<action>`);
3. use only QA accounts and QA data;
4. clean up only its own deterministic fixtures;
5. capture screenshots for important states without updating baselines automatically.

Maestro-dependent checks are skipped as `ENVIRONMENT_FAILURE` when Maestro or a simulator is unavailable. That is not reported as a passing E2E or visual result.
