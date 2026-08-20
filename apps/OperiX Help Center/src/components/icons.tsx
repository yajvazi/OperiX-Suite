import {
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Code2,
  FileText,
  Grid2X2,
  Headphones,
  HelpCircle,
  LayoutGrid,
  LockKeyhole,
  Map,
  Megaphone,
  Receipt,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Users,
  Webhook,
  Wrench,
  type LucideProps,
} from "lucide-react";
import type { IconName } from "../content/types";

const icons: Record<IconName, React.ComponentType<LucideProps>> = {
  "book-open": BookOpen,
  briefcase: BriefcaseBusiness,
  building: Building2,
  calendar: CalendarDays,
  code: Code2,
  "file-text": FileText,
  grid: Grid2X2,
  headphones: Headphones,
  "help-circle": HelpCircle,
  "layout-grid": LayoutGrid,
  lock: LockKeyhole,
  map: Map,
  megaphone: Megaphone,
  receipt: Receipt,
  search: Search,
  settings: Settings2,
  shield: ShieldCheck,
  sliders: SlidersHorizontal,
  sparkles: Sparkles,
  troubleshoot: Wrench,
  users: Users,
  webhook: Webhook,
};

export function Icon({ name, ...props }: { name: IconName } & LucideProps) {
  const Component = icons[name];
  return <Component aria-hidden="true" {...props} />;
}
