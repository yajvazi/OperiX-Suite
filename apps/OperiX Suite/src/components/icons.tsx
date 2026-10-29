import { Bell, Box, Calendar, ChartNoAxesCombined, Cloud, Code2, Coins, CreditCard, FileText, Globe, Layers, Link2, Lock, ScanBarcode, Scissors, ShieldCheck, ShoppingCart, Smartphone, Timer, Upload, UsersRound, Wallet, Wifi, HardDrive } from "lucide-react";
import type { IconName } from "@/content/copy";

const icons = {
  file: FileText, cart: ShoppingCart, users: UsersRound, wallet: Wallet, chart: ChartNoAxesCombined, coins: Coins, upload: Upload,
  globe: Globe, shield: ShieldCheck, phone: Smartphone, wifi: Wifi, cloud: Cloud, device: HardDrive, calendar: Calendar, bell: Bell,
  scissors: Scissors, credit: CreditCard, layers: Layers, clock: Timer, link: Link2, code: Code2, lock: Lock, scan: ScanBarcode, box: Box,
} as const;

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const Component = icons[name];
  return <Component size={size} strokeWidth={1.9} aria-hidden="true" />;
}
