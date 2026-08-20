import { getAppLocale, getLocalizedErrorMessage, normalizeLocale, setAppLocale, t, translations } from '@invoice-monorepo/i18n';

describe('English and Albanian localization', () => {
    it('normalizes supported and unsupported locale values', () => {
        expect(normalizeLocale('sq-XK')).toBe('sq');
        expect(normalizeLocale('en-US')).toBe('en');
        expect(normalizeLocale('de')).toBe('en');
        setAppLocale('sq');
        expect(getAppLocale()).toBe('sq');
    });

    it('has matching key sets and resolves interpolation in both languages', () => {
        expect(Object.keys(translations.en).sort()).toEqual(Object.keys(translations.sq).sort());
        expect(t('verificationCodeSentTo', 'en')).toContain('{email}');
        expect(t('verificationCodeSentTo', 'sq')).toContain('{email}');
        expect(t('nonexistent_key' as any, 'en')).toBe('nonexistent_key');
    });

    it('explains why issued invoice deletion is rejected', () => {
        expect(getLocalizedErrorMessage({ message: 'Posted or issued invoices cannot be deleted; use a correction or reversal workflow' }, 'sq'))
            .toBe('Dokumentet e lëshuara nuk fshihen. Përdorni notë kreditore ose notë debitore.');
    });
});
