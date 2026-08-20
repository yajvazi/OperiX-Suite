import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Plus } from 'lucide-react-native';
import { OperixBottomSheet, OperixFloatingActionButton, OperixListItem, OperixIcon } from './mobile';

interface Action {
    icon: OperixIcon;
    label: string;
    onPress: () => void;
    color?: string;
}

interface FABProps {
    onPress: () => void;
    actions?: Action[];
    icon?: OperixIcon;
    color?: string;
    testID?: string;
}

/** Backwards-compatible name; the visual foundation is OperixFloatingActionButton. */
export function FAB({ onPress, actions, icon: CustomIcon, color, testID }: FABProps) {
    const [open, setOpen] = useState(false);
    const handlePress = () => actions?.length ? setOpen(true) : onPress();
    return <>
        <View style={styles.dock}>
            <OperixFloatingActionButton testID={testID} onPress={handlePress} icon={CustomIcon || Plus} label="Create" style={color ? { backgroundColor: color } : undefined} />
        </View>
        {actions?.length ? <OperixBottomSheet visible={open} onClose={() => setOpen(false)} title="Create new">
            <ScrollView contentContainerStyle={styles.actionList}>
                {actions.map((action) => <OperixListItem key={action.label} title={action.label} icon={action.icon} onPress={() => { setOpen(false); action.onPress(); }} showChevron />)}
            </ScrollView>
        </OperixBottomSheet> : null}
    </>;
}

const styles = StyleSheet.create({
    dock: { position: 'absolute', right: 20, bottom: 20, zIndex: 20 },
    actionList: { paddingBottom: 12 },
});
