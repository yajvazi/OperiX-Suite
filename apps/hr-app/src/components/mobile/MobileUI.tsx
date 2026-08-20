import React, { ReactNode } from 'react';
import {
    OperixAvatar,
    OperixBadge,
    OperixEmptyState,
    OperixErrorState,
    OperixIcon,
    OperixIconButton,
    OperixHeader,
    OperixListItem,
    OperixLoadingState,
    OperixSearchInput,
    OperixSection,
    OperixScreen,
    OperixStatCard,
} from '@invoice-monorepo/ui';

export const MobileScreen = OperixScreen;
export const MobileHeader = OperixHeader;
export const IconButton = OperixIconButton;
export const SearchField = OperixSearchInput;
export const LoadingState = OperixLoadingState;
export const ErrorState = OperixErrorState;
export const EmptyState = OperixEmptyState;
export const MetricCard = OperixStatCard;
export const Avatar = OperixAvatar;

export function SectionTitle({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
    return <OperixSection title={title} action={action} onAction={onPress} />;
}

export function ShortcutRow({ icon, title, description, onPress, trailing }: { icon: OperixIcon; title: string; description?: string; onPress: () => void; trailing?: ReactNode }) {
    return <OperixListItem title={title} subtitle={description} icon={icon} onPress={onPress} trailing={trailing} showChevron style={{ marginBottom: 10 }} />;
}

export const MobileStatusBadge = OperixBadge;
