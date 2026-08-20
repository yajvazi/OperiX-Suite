import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { SignInScreen } from '../../src/screens/Auth/SignInScreen';
import { SignUpScreen } from '../../src/screens/Auth/SignUpScreen';
import { renderWithProviders, flushPromises } from '../test-utils';

describe('authentication screens', () => {
    it('does not call authentication for an incomplete sign-in form', async () => {
        const signIn = jest.fn(async () => ({ error: null }));
        const screen = await renderWithProviders(<SignInScreen onNavigateToSignUp={jest.fn()} />, { auth: { signIn } });
        await fireEvent.press(screen.getByTestId('auth-sign-in-button'));
        expect(signIn).not.toHaveBeenCalled();
        expect(screen.getByText('Please fill in all fields')).toBeTruthy();
    });

    it('trims the email, calls sign-in once, and disables repeated presses while pending', async () => {
        let resolveSignIn!: (value: { error: null }) => void;
        const signIn = jest.fn(() => new Promise<{ error: null }>((resolve) => { resolveSignIn = resolve; }));
        const screen = await renderWithProviders(<SignInScreen onNavigateToSignUp={jest.fn()} />, { auth: { signIn } });
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
        const onNavigateToSignUp = jest.fn();
        const screen = await renderWithProviders(<SignInScreen onNavigateToSignUp={onNavigateToSignUp} />, { auth: { signIn, signInWithGoogle } });
        await fireEvent.changeText(screen.getByTestId('auth-email-input'), 'a@example.com');
        await fireEvent.changeText(screen.getByTestId('auth-password-input'), 'wrong');
        await fireEvent.press(screen.getByTestId('auth-sign-in-button'));
        await waitFor(() => expect(screen.getByText(/Sign in failed/)).toBeTruthy());
        await fireEvent.press(screen.getByTestId('auth-google-button'));
        await waitFor(() => expect(signInWithGoogle).toHaveBeenCalledTimes(1));
        await fireEvent.press(screen.getByTestId('auth-sign-up-link'));
        expect(onNavigateToSignUp).toHaveBeenCalledTimes(1);
    });

    it('validates sign-up required fields, password rules, and sends all account metadata', async () => {
        const signUp = jest.fn(async () => ({ error: null }));
        const screen = await renderWithProviders(<SignUpScreen onNavigateToSignIn={jest.fn()} navigation={{ navigate: jest.fn() }} />, { auth: { signUp } });
        const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
        await fireEvent.press(screen.getByTestId('auth-sign-up-button'));
        expect(signUp).not.toHaveBeenCalled();
        expect(screen.getByText('Please fill in all required fields marked with *')).toBeTruthy();

        await fireEvent.changeText(screen.getByTestId('auth-sign-up-first-name'), 'Blerinë');
        await fireEvent.changeText(screen.getByTestId('auth-sign-up-last-name'), 'Hoxha');
        await fireEvent.changeText(screen.getByTestId('auth-sign-up-email'), 'blerine@example.com');
        await fireEvent.changeText(screen.getByTestId('auth-sign-up-password'), '123');
        await fireEvent.changeText(screen.getByTestId('auth-sign-up-confirm-password'), '124');
        await fireEvent.changeText(screen.getByTestId('auth-sign-up-phone'), '+383 44 123 456');
        await fireEvent.press(screen.getByTestId('auth-sign-up-button'));
        expect(screen.getByText('Passwords do not match')).toBeTruthy();

        await fireEvent.changeText(screen.getByTestId('auth-sign-up-confirm-password'), '123');
        await fireEvent.press(screen.getByTestId('auth-sign-up-button'));
        expect(screen.getByText('Password must be at least 6 characters')).toBeTruthy();

        await fireEvent.changeText(screen.getByTestId('auth-sign-up-password'), 'sigurtë123');
        await fireEvent.changeText(screen.getByTestId('auth-sign-up-confirm-password'), 'sigurtë123');
        await fireEvent.press(screen.getByTestId('auth-sign-up-button'));
        await waitFor(() => expect(signUp).toHaveBeenCalledWith('blerine@example.com', 'sigurtë123', expect.objectContaining({
            data: expect.objectContaining({ first_name: 'Blerinë', last_name: 'Hoxha', phone: '+383 44 123 456' }),
        })));
        expect(screen.getByText('Verify email')).toBeTruthy();
        alert.mockRestore();
    });

    it('does not verify an empty OTP and navigates to sign-in after a valid OTP', async () => {
        const verifyEmailOtp = jest.fn(async () => ({ error: null }));
        const onNavigateToSignIn = jest.fn();
        const signUp = jest.fn(async () => ({ error: null }));
        const screen = await renderWithProviders(<SignUpScreen onNavigateToSignIn={onNavigateToSignIn} />, { auth: { verifyEmailOtp, signUp } });
        await fireEvent.changeText(screen.getByTestId('auth-sign-up-first-name'), 'Ada');
        await fireEvent.changeText(screen.getByTestId('auth-sign-up-last-name'), 'Krasniqi');
        await fireEvent.changeText(screen.getByTestId('auth-sign-up-email'), 'ada@example.com');
        await fireEvent.changeText(screen.getByTestId('auth-sign-up-password'), 'secret123');
        await fireEvent.changeText(screen.getByTestId('auth-sign-up-confirm-password'), 'secret123');
        await fireEvent.changeText(screen.getByTestId('auth-sign-up-phone'), '044123456');
        await fireEvent.press(screen.getByTestId('auth-sign-up-button'));
        await waitFor(() => expect(screen.getByTestId('auth-otp-input')).toBeTruthy());
        await fireEvent.press(screen.getByTestId('auth-verify-button'));
        expect(verifyEmailOtp).not.toHaveBeenCalled();
        await fireEvent.changeText(screen.getByTestId('auth-otp-input'), '123456');
        await fireEvent.press(screen.getByTestId('auth-verify-button'));
        await waitFor(() => expect(verifyEmailOtp).toHaveBeenCalledWith('ada@example.com', '123456'));
        expect(onNavigateToSignIn).toHaveBeenCalledTimes(1);
    });
});
