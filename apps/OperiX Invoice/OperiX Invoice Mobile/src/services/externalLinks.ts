import { Alert, Linking } from 'react-native';
import { getAppLocale, t } from '@invoice-monorepo/i18n';

export async function openExternalLink(url: string, label: string) {
    try {
        const canOpen = await Linking.canOpenURL(url);
        if (!canOpen) throw new Error(`Cannot open ${url}`);
        await Linking.openURL(url);
    } catch {
        const locale = getAppLocale();
        Alert.alert(t('unableToOpenLink', locale), t('externalLinkUnavailable', locale).replace('{label}', label));
    }
}
