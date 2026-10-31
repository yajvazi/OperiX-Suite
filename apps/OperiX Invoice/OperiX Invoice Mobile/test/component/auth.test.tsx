import React from 'react';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { SignInScreen } from '../../src/screens/Auth/SignInScreen';
import { SignUpScreen } from '../../src/screens/Auth/SignUpScreen';
import { renderWithProviders, flushPromises } from '../test-utils';

describe('authentication screens', () => {
    it('exposes language and theme controls on the auth screens', async () => {
        const setLanguage = jest.fn();
        const setThemeMode = jest.fn();
        const screen = await renderWithProviders(<SignUpScreen onNavigateToSignIn={jest.fn()} />, { theme: { setLanguage, setThemeMode } });

        await fireEvent.press(screen.getByTestId('auth-language-toggle'));
        await fireEvent.press(screen.getByTestId('auth-theme-toggle'));

        expect(setLanguage).toHaveBeenCalledWith('sq');
        expect(setThemeMode).toHaveBeenCalledWith('dark');
    });

    it('does not call authentication for an incomplete sign-in form', async () => {
        const signIn = jest.fn(async () => ({ error: null }));
        const screen = await renderWithProviders(<SignInScreen onNavigateToSignUp={jest.fn()} />, { auth: { signIn } });
        await fireEvent.press(screen.getByTestId('auth-use-password'));
        await fireEvent.press(screen.getByTestId('auth-sign-in-button'));
        expect(signIn).not.toHaveBeenCalled();
        expect(screen.getByText('Please fill in all fields')).toBeTruthy();
    });

    it('signs in with an emailed one-time code', async () => {
        const sendSignInCode = jest.fn(async () => ({ error: null }));
        const verifyEmailOtp = jest.fn(async () => ({ error: null }));
        const screen = await renderWithProviders(<SignInScreen onNavigateToSignUp={jest.fn()} />, { auth: { sendSignInCode, verifyEmailOtp } });
        await fireEvent.press(screen.getByTestId('auth-send-code-button'));
        expect(sendSignInCode).not.toHaveBeenCalled();
        await fireEvent.changeText(screen.getByTestId('auth-email-input'), '  blerina@example.com ');
        await fireEvent.press(screen.getByTestId('auth-send-code-button'));
        await waitFor(() => expect(sendSignInCode).toHaveBeenCalledWith('blerina@example.com'));
        await waitFor(() => expect(screen.getByTestId('auth-otp-input')).toBeTruthy());
        await fireEvent.changeText(screen.getByTestId('auth-otp-input'), '123456');
        await fireEvent.press(screen.getByTestId('auth-verify-code-button'));
        await waitFor(() => expect(verifyEmailOtp).toHaveBeenCalledWith('blerina@example.com', '123456'));
    });

    it('trims the email, calls sign-in once, and disables repeated presses while pending', async () => {
        let resolveSignIn!: (value: { error: null }) => void;
        const signIn = jest.fn(() => new Promise<{ error: null }>((resolve) => { resolveSignIn = resolve; }));
        const screen = await renderWithProviders(<SignInScreen onNavigateToSignUp={jest.fn()} />, { auth: { signIn } });
        await fireEvent.press(screen.getByTestId('auth-use-password'));
        await fireEvent.changeText(screen.getByTestId('auth-email-input'), '  blerina@example.com  ');
        await fireEvent.changeText(screen.getByTestId('auth-password-input'), 'correct horse battery staple');
        let firstPress!: Promise<unknown>;
        await act(async () => {
            firstPress = screen.getByTestId('auth-sign-in-button').props.onClick();
            await Promise.resolve();
        });
        await act(async () => {
            await screen.getByTestId('auth-sign-in-button').props.onClick();
        });
        expect(signIn).toHaveBeenCalledTimes(1);
        expect(signIn).toHaveBeenCalledWith('blerina@example.com', 'correct horse battery staple');
        resolveSignIn({ error: null });
        await act(async () => {
            await firstPress;
        });
        await flushPromises();
    });

    it('renders a localized sign-in error for an auth failure and supports Google and sign-up actions', async () => {
        const signIn = jest.fn(async () => ({ error: new Error('Invalid login') }));
        const signInWithGoogle = jest.fn(async () => ({ error: null }));
        const signInWithApple = jest.fn(async () => ({ error: null }));
        const onNavigateToSignUp = jest.fn();
        // The server reports which social providers are switched on; the buttons only appear for those.
        const originalFetch = global.fetch;
        global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ external: { google: true, apple: true } }) })) as unknown as typeof fetch;
        const screen = await renderWithProviders(<SignInScreen onNavigateToSignUp={onNavigateToSignUp} />, { auth: { signIn, signInWithGoogle, signInWithApple } });
        await waitFor(() => expect(screen.getByTestId('auth-google-button')).toBeTruthy());
        await fireEvent.press(screen.getByTestId('auth-google-button'));
        await waitFor(() => expect(signInWithGoogle).toHaveBeenCalledTimes(1));
        await fireEvent.press(screen.getByTestId('auth-apple-button'));
        await waitFor(() => expect(signInWithApple).toHaveBeenCalledTimes(1));
        await fireEvent.press(screen.getByTestId('auth-use-password'));
        await fireEvent.changeText(screen.getByTestId('auth-email-input'), 'a@example.com');
        await fireEvent.changeText(screen.getByTestId('auth-password-input'), 'wrong');
        await fireEvent.press(screen.getByTestId('auth-sign-in-button'));
        await waitFor(() => expect(screen.getByText(/Sign in failed/)).toBeTruthy());
        global.fetch = originalFetch;
        await fireEvent.press(screen.getByTestId('auth-sign-up-link'));
        expect(onNavigateToSignUp).toHaveBeenCalledTimes(1);
    });

    it('validates the stronger password policy and sends the verification code after account details', async () => {
        const signUp = jest.fn(async () => ({ error: null }));
        const screen = await renderWithProviders(<SignUpScreen onNavigateToSignIn={jest.fn()} navigation={{ navigate: jest.fn() }} />, { auth: { signUp } });
        await fireEvent.press(screen.getByTestId('auth-sign-up-button'));
        expect(signUp).not.toHaveBeenCalled();
        expect(screen.getByText('Please fill in all required fields marked with *')).toBeTruthy();

        await fireEvent.changeText(screen.getByTestId('auth-sign-up-email'), 'blerine@example.com');
        await fireEvent.changeText(screen.getByTestId('auth-sign-up-password'), '123');
        await fireEvent.changeText(screen.getByTestId('auth-sign-up-confirm-password'), '124');
        await fireEvent.press(screen.getByTestId('auth-sign-up-button'));
        expect(screen.getByText('Passwords do not match')).toBeTruthy();

        await fireEvent.changeText(screen.getByTestId('auth-sign-up-confirm-password'), '123');
        await fireEvent.press(screen.getByTestId('auth-sign-up-button'));
        expect(screen.getByText(/Password must be at least 8 characters/)).toBeTruthy();

        await fireEvent.changeText(screen.getByTestId('auth-sign-up-password'), 'Sigurtë123!');
        await fireEvent.changeText(screen.getByTestId('auth-sign-up-confirm-password'), 'Sigurtë123!');
        await fireEvent.press(screen.getByTestId('auth-sign-up-button'));
        await waitFor(() => expect(signUp).toHaveBeenCalledWith('blerine@example.com', 'Sigurtë123!'));
    });

    it('asks for the emailed code after the account step; the onboarding collects the rest', async () => {
        const verifyEmailOtp = jest.fn(async () => ({ error: null }));
        const completeSignup = jest.fn(async () => ({ companyId: 'company-1', error: null }));
        const onNavigateToSignIn = jest.fn();
        const signUp = jest.fn(async () => ({ error: null }));
        const screen = await renderWithProviders(<SignUpScreen onNavigateToSignIn={onNavigateToSignIn} />, { auth: { verifyEmailOtp, signUp, completeSignup } });
        await fireEvent.changeText(screen.getByTestId('auth-sign-up-email'), 'ada@example.com');
        await fireEvent.changeText(screen.getByTestId('auth-sign-up-password'), 'Secret123!');
        await fireEvent.changeText(screen.getByTestId('auth-sign-up-confirm-password'), 'Secret123!');
        await fireEvent.press(screen.getByTestId('auth-sign-up-button'));
        await waitFor(() => expect(screen.getByTestId('auth-otp-input')).toBeTruthy());
        await fireEvent.press(screen.getByTestId('auth-verify-button'));
        expect(verifyEmailOtp).not.toHaveBeenCalled();
        await fireEvent.changeText(screen.getByTestId('auth-otp-input'), '123456');
        await fireEvent.press(screen.getByTestId('auth-verify-button'));
        await waitFor(() => expect(verifyEmailOtp).toHaveBeenCalledWith('ada@example.com', '123456'));
        // Name, company and plan are collected by the onboarding after sign-in, not here.
        expect(completeSignup).not.toHaveBeenCalled();
        expect(onNavigateToSignIn).not.toHaveBeenCalled();
    });
});
