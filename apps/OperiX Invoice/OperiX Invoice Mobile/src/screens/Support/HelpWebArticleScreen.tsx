import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ExternalLink } from 'lucide-react-native';
import { TouchableOpacity } from 'react-native';
import type { RootStackParamList } from '../../navigation/types';
import { openExternalLink } from '../../services/externalLinks';
import { brand } from '../../theme/brand';
import { MobileHeader, MobileScreen } from '../../components/mobile/MobileUI';

type Props = NativeStackScreenProps<RootStackParamList, 'HelpWebArticle'>;

/** An article of the OperiX Help Center website, shown inside the app. */
export function HelpWebArticleScreen({ navigation, route }: Props) {
    const { url, title } = route.params;
    return (
        <MobileScreen testID="help-web-article-screen">
            <MobileHeader
                title={title}
                onBack={() => navigation.goBack()}
                right={<TouchableOpacity accessibilityRole="button" accessibilityLabel="Open in browser" onPress={() => void openExternalLink(url, title)}><ExternalLink color={brand.colors.primary} size={20} /></TouchableOpacity>}
            />
            <WebView
                source={{ uri: url }}
                startInLoadingState
                renderLoading={() => <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={brand.colors.primary} /></View>}
                setSupportMultipleWindows={false}
                onShouldStartLoadWithRequest={(request) => request.url.startsWith('https://helpdesk.operixsuite.com') || request.url === 'about:blank'}
            />
        </MobileScreen>
    );
}
