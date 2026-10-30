import React, { useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowRight, Check, Cloud, ExternalLink, HardDrive, Server } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import { PLAN_DEFINITIONS, type BillingInterval } from '@invoice-monorepo/billing';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { brand, getPalette } from '../../theme/brand';
import { createSubscriptionCheckout } from '../../services/billingService';
import { getWorkspaceScope } from '../../services/workspace';
import { setStorageMode } from '../../services/storageMode';

type Choice = 'cloud' | 'selfhost' | 'free';
type Step = 'about' | 'choose' | 'cloud' | 'selfhost' | 'free' | 'plan';

const REPO_URL = 'https://github.com/yajvazi/operix-invoice-web';

const copy = {
    en: {
        steps: ['About you', 'How to use', 'Set up', 'Plan'],
        welcome: 'Welcome to OperiX', welcomeText: "Let's set things up. It takes about a minute. First, tell us who you are.",
        first: 'First name', last: 'Last name', phone: 'Phone (optional)', next: 'Continue', back: 'Back',
        chooseTitle: 'How would you like to use OperiX?', chooseText: 'Pick what suits you today. You can change it later.',
        alwaysFree: 'OperiX is always free to use.', alwaysFreeText: " If you don't want the cloud service or your own server, start free and keep your data on this device. You never have to pay to use the app.",
        cloud: 'OperiX Cloud', cloudBadge: 'Recommended',
        cloudPoints: ['Web and mobile app always in sync', 'Cloud backup: your data is safe even if you lose your phone', 'Team members with roles and permissions', 'Customer portal links and online payments', 'Public API and integrations', 'Updates and support included'],
        selfhost: 'Self-host', selfhostBadge: 'Free · open source',
        selfhostPoints: ['Free and open source (AGPL-3.0)', 'Runs on your own server, so your data stays with you', 'This app connects to it by QR code', 'Needs a server and some technical know-how'],
        free: 'Start free', freeBadge: 'Free forever',
        freePoints: ['All invoicing and accounting tools', 'Your data stays on this device, with no card and no cloud account needed', 'Download a backup file whenever you like', 'Change your mind later in Settings → Data storage'],
        cloudTitle: 'Set up your company', cloudText: "This creates your cloud workspace. You'll be the administrator and can invite your team later.",
        company: 'Company name', tax: 'Business registration number (optional)', create: 'Create workspace', required: 'Enter your company name.', failed: 'The workspace could not be created. Please try again.',
        hostTitle: 'Run OperiX on your own server', hostText: 'OperiX Invoice is open source. You host the web app and your own database, and this app connects to your server.',
        hostSteps: ['Get the code and the guide. The README walks you through the database, settings and Docker.', 'Start the server. You need a server with Docker, a domain with HTTPS, and a Supabase project.', 'Connect this app. Sign out, then on the sign-in screen tap "Connect to your own server" and scan the QR code from your web app (Settings → Mobile app).'],
        hostGuide: 'Open the self-hosting guide', hostSignOut: 'Sign out and connect to my server', hostNote: 'While you set it up, you can use OperiX free on this device.', hostFree: 'Use free on this device for now',
        freeTitle: 'Free, and it stays free', freeText: 'Your invoices, customers and products are kept on this device. No card and no cloud account are needed.',
        freeChecks: ['Create invoices, quotes and delivery notes, and track expenses and payments', 'Share PDFs and reports', 'Back up and restore your data with a file'],
        freeWarn: "Good to know: data lives only on this device. If you delete the app or lose the phone, it's gone unless you made a backup. There is no sync to the web and no team access. You can move to OperiX Cloud or your own server whenever you like.",
        freeStart: 'Start using OperiX',
        planTitle: 'Your workspace is ready', planText: 'OperiX Cloud is a paid service. Subscribe to start using your cloud workspace, or use OperiX free on this device.',
        yearly: 'Yearly', monthly: 'Monthly', save: 'Save', perYear: '/year', perMonth: '/month', extraUser: 'per extra user',
        subscribe: 'Subscribe', skip: 'Use free on this device instead', planFree: 'Not ready? OperiX is always free: you can keep using it free on this device at any time (Settings → Data storage).', checkoutFailed: 'Checkout is unavailable right now.',
        signOut: 'Sign out',
    },
    sq: {
        steps: ['Rreth jush', 'Si ta përdorni', 'Konfigurimi', 'Plani'],
        welcome: 'Mirë se vini në OperiX', welcomeText: 'Le ta konfigurojmë. Zgjat rreth një minutë. Së pari, na tregoni kush jeni.',
        first: 'Emri', last: 'Mbiemri', phone: 'Telefoni (opsional)', next: 'Vazhdo', back: 'Kthehu',
        chooseTitle: 'Si dëshironi ta përdorni OperiX?', chooseText: 'Zgjidhni çka ju përshtatet sot. Mund ta ndryshoni më vonë.',
        alwaysFree: 'OperiX është gjithmonë falas për përdorim.', alwaysFreeText: ' Nëse nuk dëshironi shërbimin cloud ose serverin tuaj, filloni falas dhe mbani të dhënat në këtë pajisje. Nuk keni nevojë të paguani kurrë për ta përdorur aplikacionin.',
        cloud: 'OperiX Cloud', cloudBadge: 'E rekomanduar',
        cloudPoints: ['Aplikacioni ueb dhe mobil gjithmonë i sinkronizuar', 'Kopje rezervë në cloud: të dhënat janë të sigurta edhe nëse humbisni telefonin', 'Anëtarë ekipi me role dhe leje', 'Lidhje për portalin e klientit dhe pagesa online', 'API publike dhe integrime', 'Përditësimet dhe mbështetja përfshihen'],
        selfhost: 'Vetë-strehim', selfhostBadge: 'Falas · kod i hapur',
        selfhostPoints: ['Falas dhe me kod të hapur (AGPL-3.0)', 'Ekzekutohet në serverin tuaj, prandaj të dhënat mbeten tek ju', 'Ky aplikacion lidhet me të përmes kodit QR', 'Kërkon një server dhe njohuri teknike'],
        free: 'Filloni falas', freeBadge: 'Falas përgjithmonë',
        freePoints: ['Të gjitha mjetet e faturimit dhe kontabilitetit', 'Të dhënat mbeten në këtë pajisje, pa kartë dhe pa llogari cloud', 'Shkarkoni një skedar kopjeje rezervë sa herë që dëshironi', 'Ndryshoni mendje më vonë te Cilësimet → Ruajtja e të dhënave'],
        cloudTitle: 'Konfiguro kompaninë', cloudText: 'Kjo krijon hapësirën tuaj të punës në cloud. Do të jeni administratori dhe mund ta ftoni ekipin më vonë.',
        company: 'Emri i kompanisë', tax: 'Numri i regjistrimit të biznesit (opsional)', create: 'Krijo hapësirën e punës', required: 'Shkruani emrin e kompanisë.', failed: 'Hapësira e punës nuk u krijua. Provoni përsëri.',
        hostTitle: 'Ekzekutoni OperiX në serverin tuaj', hostText: 'OperiX Invoice është me kod të hapur. Ju strehoni aplikacionin ueb dhe bazën tuaj të të dhënave, ndërsa ky aplikacion lidhet me serverin tuaj.',
        hostSteps: ['Merrni kodin dhe udhëzuesin. README ju udhëzon për bazën e të dhënave, cilësimet dhe Docker.', 'Nisni serverin. Ju nevojitet një server me Docker, një domen me HTTPS dhe një projekt Supabase.', 'Lidhni këtë aplikacion. Dilni, pastaj te ekrani i hyrjes shtypni "Lidhu me serverin tënd" dhe skanoni kodin QR nga aplikacioni ueb (Cilësimet → Aplikacioni mobil).'],
        hostGuide: 'Hap udhëzuesin e vetë-strehimit', hostSignOut: 'Dil dhe lidhu me serverin tim', hostNote: 'Ndërsa e konfiguroni, mund ta përdorni OperiX falas në këtë pajisje.', hostFree: 'Përdor falas në këtë pajisje tani',
        freeTitle: 'Falas, dhe mbetet falas', freeText: 'Faturat, klientët dhe produktet tuaja ruhen në këtë pajisje. Nuk nevojitet kartë dhe as llogari cloud.',
        freeChecks: ['Krijoni fatura, oferta dhe fletëdërgesa, dhe ndiqni shpenzimet dhe pagesat', 'Ndani PDF dhe raporte', 'Bëni kopje rezervë dhe rikthejini të dhënat me një skedar'],
        freeWarn: 'Mirë të dihet: të dhënat ndodhen vetëm në këtë pajisje. Nëse fshini aplikacionin ose humbisni telefonin, humbasin nëse nuk keni bërë kopje rezervë. Nuk ka sinkronizim me uebin dhe as qasje për ekipin. Mund të kaloni te OperiX Cloud ose te serveri juaj kur të dëshironi.',
        freeStart: 'Filloni të përdorni OperiX',
        planTitle: 'Hapësira juaj e punës është gati', planText: 'OperiX Cloud është shërbim me pagesë. Abonohuni për të filluar të përdorni hapësirën tuaj në cloud, ose përdorni OperiX falas në këtë pajisje.',
        yearly: 'Vjetor', monthly: 'Mujor', save: 'Kurseni', perYear: '/vit', perMonth: '/muaj', extraUser: 'për përdorues shtesë',
        subscribe: 'Abonohu', skip: 'Përdor falas në këtë pajisje në vend të kësaj', planFree: 'Nuk jeni gati? OperiX është gjithmonë falas: mund ta përdorni falas në këtë pajisje në çdo kohë (Cilësimet → Ruajtja e të dhënave).', checkoutFailed: 'Pagesa nuk është e disponueshme tani.',
        signOut: 'Dil',
    },
} as const;

const STEP_GROUPS: Step[][] = [['about'], ['choose'], ['cloud', 'selfhost', 'free'], ['plan']];

/** Step-by-step setup for accounts without a company (for example the first Google or Apple sign-in). */
export function CompanySetupScreen({ onDone }: { onDone: () => void }) {
    const { user, completeSignup, signOut } = useAuth();
    const { isDark, primaryColor, language } = useTheme();
    const palette = getPalette(isDark);
    const text = language === 'sq' ? copy.sq : copy.en;
    const meta = (user?.user_metadata || {}) as Record<string, unknown>;
    const fullName = String(meta.full_name || meta.name || '').trim();
    const [step, setStep] = useState<Step>('about');
    const [choice, setChoice] = useState<Choice>('cloud');
    const [firstName, setFirstName] = useState(String(meta.given_name || fullName.split(' ')[0] || ''));
    const [lastName, setLastName] = useState(String(meta.family_name || fullName.split(' ').slice(1).join(' ') || ''));
    const [phone, setPhone] = useState('');
    const [company, setCompany] = useState('');
    const [taxId, setTaxId] = useState('');
    const [interval, setInterval] = useState<BillingInterval>('annual');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [companyId, setCompanyId] = useState('');

    // Apple requires In-App Purchase for subscriptions sold inside iOS apps, so the plan step is skipped on iOS.
    const canSubscribe = Platform.OS !== 'ios' || process.env.EXPO_PUBLIC_ALLOW_IOS_STRIPE_CHECKOUT === 'true';
    const pricing = PLAN_DEFINITIONS.invoice.pricing;
    const savings = useMemo(() => Math.round((1 - Number(pricing.annual.base) / (Number(pricing.monthly.base) * 12)) * 100), [pricing]);
    const activeIndex = STEP_GROUPS.findIndex((group) => group.includes(step));
    const go = (next: Step) => { setError(''); setStep(next); };

    const createWorkspace = async () => {
        if (!company.trim()) { setError(text.required); return; }
        setBusy(true);
        setError('');
        const { companyId: created, error: failure } = await completeSignup({ tenantName: company.trim(), firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim(), taxId: taxId.trim() });
        setBusy(false);
        if (failure) { setError(text.failed); return; }
        setCompanyId(created || '');
        if (canSubscribe) go('plan'); else onDone();
    };

    const startFree = async () => {
        await setStorageMode('local');
        onDone();
    };

    const subscribe = async () => {
        setBusy(true);
        setError('');
        try {
            let id = companyId;
            if (!id && user?.id) id = (await getWorkspaceScope(user.id, { forceCloud: true })).companyId;
            const url = await createSubscriptionCheckout(id, 'invoice', interval);
            await WebBrowser.openBrowserAsync(url);
            onDone();
        } catch (caught) {
            setError(caught instanceof Error && caught.message ? caught.message : text.checkoutFailed);
        } finally {
            setBusy(false);
        }
    };

    const Primary = ({ label, onPress, disabled, testID }: { label: string; onPress: () => void; disabled?: boolean; testID?: string }) => (
        <TouchableOpacity testID={testID} accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.primary, { backgroundColor: primaryColor }, disabled && { opacity: 0.6 }]}>
            {busy && disabled ? <ActivityIndicator color="#fff" /> : <><Text style={styles.primaryText}>{label}</Text><ArrowRight color="#fff" size={16} /></>}
        </TouchableOpacity>
    );
    const Secondary = ({ label, onPress, icon }: { label: string; onPress: () => void; icon?: React.ReactNode }) => (
        <TouchableOpacity accessibilityRole="button" onPress={onPress} style={[styles.secondary, { borderColor: palette.border }]}>{icon}<Text style={[styles.secondaryText, { color: palette.text }]}>{label}</Text></TouchableOpacity>
    );
    const BackLink = ({ to }: { to: Step }) => (
        <TouchableOpacity accessibilityRole="button" onPress={() => go(to)} style={styles.backLink}><ArrowLeft color={palette.muted} size={15} /><Text style={{ color: palette.muted, fontWeight: '700', fontSize: 13 }}>{text.back}</Text></TouchableOpacity>
    );
    const field = (label: string, value: string, set: (v: string) => void, extra: object = {}) => (
        <View style={styles.group}>
            <Text style={[styles.label, { color: palette.textSecondary }]}>{label}</Text>
            <TextInput style={[styles.input, { borderColor: palette.border, color: palette.text }]} value={value} onChangeText={set} placeholderTextColor={palette.muted} {...extra} />
        </View>
    );
    const checks = (items: readonly string[]) => items.map((item) => (
        <View key={item} style={styles.checkRow}><Check color="#12B76A" size={14} style={{ marginTop: 2 }} /><Text style={[styles.checkText, { color: palette.textSecondary }]}>{item}</Text></View>
    ));
    const card = (id: Choice, icon: React.ReactNode, title: string, badge: string, tone: string, points: readonly string[]) => {
        const active = choice === id;
        return (
            <TouchableOpacity key={id} testID={`onboarding-${id}`} accessibilityRole="radio" accessibilityState={{ selected: active }} activeOpacity={0.85} onPress={() => setChoice(id)}
                style={[styles.card, { borderColor: active ? primaryColor : palette.border, backgroundColor: palette.surface }, active && { borderWidth: 2 }]}>
                <View style={styles.cardTop}>
                    <View style={[styles.cardIcon, { backgroundColor: `${primaryColor}18` }]}>{icon}</View>
                    <View style={[styles.radio, { borderColor: active ? primaryColor : palette.borderStrong }, active && { backgroundColor: primaryColor }]}>{active ? <Check color="#fff" size={12} /> : null}</View>
                </View>
                <Text style={[styles.cardTitle, { color: palette.text }]}>{title}</Text>
                <Text style={[styles.badge, { backgroundColor: `${tone}22`, color: tone }]}>{badge}</Text>
                <View style={{ marginTop: 8 }}>{checks(points)}</View>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.safe}>
                <View style={styles.top}>
                    <View style={styles.progress}>
                        {text.steps.map((label, index) => <View key={label} style={[styles.bar, { backgroundColor: index < activeIndex ? '#12B76A' : index === activeIndex ? primaryColor : palette.border }]} />)}
                    </View>
                    <View style={styles.topRow}>
                        <Text style={[styles.stepLabel, { color: palette.muted }]}>{activeIndex + 1} / {text.steps.length} · {text.steps[activeIndex]}</Text>
                        <TouchableOpacity accessibilityRole="button" onPress={() => { void signOut(); }}><Text style={{ color: primaryColor, fontWeight: '800', fontSize: 12 }}>{text.signOut}</Text></TouchableOpacity>
                    </View>
                </View>
                <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                    {step === 'about' ? <>
                        <Text style={[styles.title, { color: palette.text }]}>{text.welcome}</Text>
                        <Text style={[styles.lead, { color: palette.muted }]}>{text.welcomeText}</Text>
                        {field(text.first, firstName, setFirstName, { autoCapitalize: 'words', autoComplete: 'given-name' })}
                        {field(text.last, lastName, setLastName, { autoCapitalize: 'words', autoComplete: 'family-name' })}
                        {field(text.phone, phone, setPhone, { keyboardType: 'phone-pad' })}
                        <Primary testID="onboarding-about-next" label={text.next} onPress={() => go('choose')} />
                    </> : null}

                    {step === 'choose' ? <>
                        <Text style={[styles.title, { color: palette.text }]}>{text.chooseTitle}</Text>
                        <Text style={[styles.lead, { color: palette.muted }]}>{text.chooseText}</Text>
                        {card('cloud', <Cloud color={primaryColor} size={19} />, text.cloud, text.cloudBadge, primaryColor, text.cloudPoints)}
                        {card('selfhost', <Server color={primaryColor} size={19} />, text.selfhost, text.selfhostBadge, '#475467', text.selfhostPoints)}
                        {card('free', <HardDrive color={primaryColor} size={19} />, text.free, text.freeBadge, '#067647', text.freePoints)}
                        <View style={[styles.note, { backgroundColor: `${primaryColor}10`, borderColor: `${primaryColor}35` }]}><Text style={[styles.noteText, { color: palette.text }]}><Text style={{ fontWeight: '800' }}>{text.alwaysFree}</Text>{text.alwaysFreeText}</Text></View>
                        <Primary testID="onboarding-choose-next" label={text.next} onPress={() => go(choice)} />
                        <BackLink to="about" />
                    </> : null}

                    {step === 'cloud' ? <>
                        <Text style={[styles.title, { color: palette.text }]}>{text.cloudTitle}</Text>
                        <Text style={[styles.lead, { color: palette.muted }]}>{text.cloudText}</Text>
                        {error ? <Text style={styles.error}>{error}</Text> : null}
                        {field(`${text.company} *`, company, setCompany, { testID: 'company-setup-name', autoCapitalize: 'words' })}
                        {field(text.tax, taxId, setTaxId)}
                        <Primary testID="company-setup-submit" label={text.create} onPress={() => void createWorkspace()} disabled={busy} />
                        <BackLink to="choose" />
                    </> : null}

                    {step === 'selfhost' ? <>
                        <Text style={[styles.title, { color: palette.text }]}>{text.hostTitle}</Text>
                        <Text style={[styles.lead, { color: palette.muted }]}>{text.hostText}</Text>
                        {text.hostSteps.map((item, index) => <View key={item} style={styles.checkRow}><Text style={[styles.num, { color: primaryColor }]}>{index + 1}</Text><Text style={[styles.checkText, { color: palette.textSecondary }]}>{item}</Text></View>)}
                        <Secondary label={text.hostGuide} icon={<ExternalLink color={primaryColor} size={15} />} onPress={() => { void Linking.openURL(REPO_URL); }} />
                        <Secondary label={text.hostSignOut} onPress={() => { void signOut(); }} />
                        <View style={[styles.note, { backgroundColor: `${primaryColor}10`, borderColor: `${primaryColor}35` }]}><Text style={[styles.noteText, { color: palette.text }]}>{text.hostNote}</Text></View>
                        <Primary label={text.hostFree} onPress={() => go('free')} />
                        <BackLink to="choose" />
                    </> : null}

                    {step === 'free' ? <>
                        <Text style={[styles.title, { color: palette.text }]}>{text.freeTitle}</Text>
                        <Text style={[styles.lead, { color: palette.muted }]}>{text.freeText}</Text>
                        {checks(text.freeChecks)}
                        <View style={[styles.note, { backgroundColor: '#FFFAEB', borderColor: '#FEDF89' }]}><Text style={[styles.noteText, { color: '#7A2E0B' }]}>{text.freeWarn}</Text></View>
                        <Primary testID="onboarding-free-start" label={text.freeStart} onPress={() => void startFree()} />
                        <BackLink to="choose" />
                    </> : null}

                    {step === 'plan' ? <>
                        <Text style={[styles.title, { color: palette.text }]}>{text.planTitle}</Text>
                        <Text style={[styles.lead, { color: palette.muted }]}>{text.planText}</Text>
                        <View style={[styles.toggle, { backgroundColor: palette.surfaceMuted }]}>
                            {(['annual', 'monthly'] as const).map((value) => (
                                <TouchableOpacity key={value} accessibilityRole="button" onPress={() => setInterval(value)} style={[styles.toggleItem, interval === value && { backgroundColor: palette.surface }]}>
                                    <Text style={{ color: palette.text, fontWeight: '700', fontSize: 12 }}>{value === 'annual' ? `${text.yearly} · ${text.save} ${savings}%` : text.monthly}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <Text style={[styles.price, { color: palette.text }]}>€{pricing[interval].base}<Text style={{ color: palette.muted, fontSize: 14, fontWeight: '500' }}>{interval === 'annual' ? text.perYear : text.perMonth}</Text></Text>
                        <Text style={[styles.lead, { color: palette.muted, marginBottom: 12 }]}>OperiX Invoice · €{pricing[interval].additionalUser} {text.extraUser}</Text>
                        {checks(text.cloudPoints)}
                        {error ? <Text style={styles.error}>{error}</Text> : null}
                        <Primary testID="onboarding-subscribe" label={text.subscribe} onPress={() => void subscribe()} disabled={busy} />
                        <Secondary label={text.skip} onPress={() => void startFree()} />
                        <Text style={[styles.lead, { color: palette.muted, marginTop: 10, fontSize: 12 }]}>{text.planFree}</Text>
                    </> : null}
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1 },
    top: { paddingHorizontal: 20, paddingTop: 8 },
    progress: { flexDirection: 'row', gap: 6 },
    bar: { flex: 1, height: 4, borderRadius: 2 },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
    stepLabel: { fontSize: 11, fontWeight: '700' },
    scroll: { padding: 20, paddingBottom: 48 },
    title: { fontSize: 24, fontWeight: '900', letterSpacing: -0.4 },
    lead: { marginTop: 8, marginBottom: 18, fontSize: 13, lineHeight: 20 },
    group: { marginBottom: 12 },
    label: { marginBottom: 6, fontSize: 12, fontWeight: '700' },
    input: { height: 48, paddingHorizontal: 13, borderWidth: 1, borderRadius: 12, fontSize: 14 },
    primary: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, borderRadius: 13 },
    primaryText: { color: '#fff', fontSize: 14, fontWeight: '900' },
    secondary: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, borderWidth: 1, borderRadius: 13 },
    secondaryText: { fontSize: 13, fontWeight: '800' },
    backLink: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 },
    error: { marginBottom: 12, color: brand.colors.error, fontSize: 12, lineHeight: 17 },
    card: { padding: 16, marginBottom: 12, borderWidth: 1, borderRadius: 16 },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    cardTitle: { marginTop: 10, fontSize: 16, fontWeight: '900' },
    badge: { alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, overflow: 'hidden', fontSize: 10, fontWeight: '800' },
    checkRow: { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'flex-start' },
    checkText: { flex: 1, fontSize: 12.5, lineHeight: 18 },
    num: { width: 14, fontSize: 13, fontWeight: '900' },
    note: { marginTop: 8, padding: 13, borderWidth: 1, borderRadius: 12 },
    noteText: { fontSize: 12, lineHeight: 18 },
    toggle: { flexDirection: 'row', padding: 4, borderRadius: 12, marginBottom: 16 },
    toggleItem: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 9, paddingHorizontal: 6 },
    price: { fontSize: 36, fontWeight: '900', letterSpacing: -1 },
});
