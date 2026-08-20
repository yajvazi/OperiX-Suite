import React from 'react';
import { OperixHeader } from './mobile/shell';

interface ScreenHeaderProps {
    title: string;
    subtitle?: string;
    showBack?: boolean;
    onBack?: () => void;
    rightAction?: React.ReactNode;
}

/** Legacy adapter for the canonical OperixHeader. */
export function ScreenHeader({ title, subtitle, showBack = true, onBack, rightAction }: ScreenHeaderProps) {
    return <OperixHeader title={title} subtitle={subtitle} showBack={showBack} onBack={onBack} right={rightAction} />;
}
