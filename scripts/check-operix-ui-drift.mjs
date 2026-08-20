import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const requiredExports = [
  "Button", "IconButton", "Card", "Input", "Textarea", "Select", "Checkbox", "Radio", "Switch", "DatePicker",
  "SearchInput", "Badge", "Avatar", "Tooltip", "Dropdown", "Tabs", "Breadcrumbs", "Divider", "Alert", "Toast",
  "Skeleton", "EmptyState", "ErrorState", "Modal", "Drawer", "ConfirmationDialog", "Pagination", "DataTable",
  "FilterBar", "OperixListPage", "OperixDetailPage", "OperixFormPage", "PageHeader", "SectionHeader", "StatCard",
];
const componentSource = fs.readFileSync(path.join(root, "packages/operix-ui/src/components.tsx"), "utf8");
const missingExports = requiredExports.filter((name) => !new RegExp(`(?:export function|export const|export type) ${name}\\b`).test(componentSource));
if (missingExports.length) throw new Error(`Missing shared OperiX UI exports: ${missingExports.join(", ")}`);

const appPackages = [
  "apps/OperiX Booking/OperiX Booking Web/package.json",
  "apps/OperiX Desk/frontend/package.json",
  "apps/OperiX Invoice/OperiX Web/package.json",
  "apps/operix-hr-web/package.json",
  "apps/operix-control/package.json",
];
for (const relative of appPackages) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
  const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
  if (!dependencies["@invoice-monorepo/app-shell"] || !dependencies["@invoice-monorepo/operix-ui"]) {
    throw new Error(`${relative} must depend on @invoice-monorepo/app-shell and @invoice-monorepo/operix-ui`);
  }
}

const shellFiles = [
  "apps/OperiX Booking/OperiX Booking Web/src/components/booking-shell.tsx",
  "apps/OperiX Desk/frontend/src/components/Layout.jsx",
  "apps/OperiX Invoice/OperiX Web/src/components/app-shell.tsx",
  "apps/operix-hr-web/src/components/hr-shell.tsx",
  "apps/operix-control/src/components/control-shell.tsx",
];
for (const relative of shellFiles) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  if (!source.includes("@invoice-monorepo/app-shell")) throw new Error(`${relative} is not consuming the shared application shell`);
}

console.log(`OperiX UI drift check passed: ${requiredExports.length} primitives, ${appPackages.length} product shells, shared shell imports verified.`);
