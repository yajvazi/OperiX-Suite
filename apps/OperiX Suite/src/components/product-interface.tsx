import {
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  Circle,
  FileText,
  Grid2X2,
  LayoutDashboard,
  LockKeyhole,
  MapPinned,
  Menu,
  MoreHorizontal,
  ReceiptText,
  Search,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";
import { appLauncherItems, getProduct, type ProductKey } from "@/content/products";
import type { ReactNode } from "react";

type InterfaceVariant = ProductKey | "platform";

export function ProductIcon({ product, size = 20 }: { product: ProductKey; size?: number }) {
  const definition = getProduct(product);
  const Icon = definition.icon;
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" />;
}

export function BrowserFrame({ children, className = "", address = "app.operixsuite.com" }: { children: ReactNode; className?: string; address?: string }) {
  return (
    <div className={`browser-frame ${className}`}>
      <div className="browser-toolbar" aria-hidden="true">
        <span className="browser-dots"><i /><i /><i /></span>
        <span className="browser-address">{address}</span>
        <MoreHorizontal size={14} />
      </div>
      <div className="browser-content">{children}</div>
    </div>
  );
}

export function MobileDeviceFrame({ product = "invoice" }: { product?: ProductKey }) {
  const definition = getProduct(product);
  return (
    <div className="mobile-device" aria-label={`${definition.name} mobile interface preview`}>
      <div className="mobile-speaker" aria-hidden="true" />
      <div className="mobile-status"><span>9:41</span><span>▮▮▮</span></div>
      <div className="mobile-appbar"><ProductIcon product={product} size={15} /><strong>{definition.shortName}</strong><Circle size={8} fill="currentColor" /></div>
      <div className="mobile-body">
        <span className="interface-kicker">Today</span>
        <h3>{product === "desk" ? "Find your space" : product === "hr" ? "Your people" : product === "booking" ? "Today’s schedule" : "Your overview"}</h3>
        <div className="mobile-highlight"><small>{product === "desk" ? "Available desks" : product === "hr" ? "Team members" : product === "booking" ? "Bookings" : "Open invoices"}</small><strong>{product === "desk" ? "16" : product === "hr" ? "48" : product === "booking" ? "12" : "18"}</strong><span>{product === "desk" ? "Across 3 floors" : "Updated just now"}</span></div>
        <div className="mobile-mini-grid"><span /><span /><span /></div>
        <div className="mobile-list"><span /><span /><span /><span /></div>
      </div>
      <div className="mobile-tabbar"><Grid2X2 size={14} /><CalendarDays size={14} /><Users size={14} /><Settings2 size={14} /></div>
    </div>
  );
}

export function ProductInterface({ variant, compact = false }: { variant: InterfaceVariant; compact?: boolean }) {
  if (variant === "platform") return <PlatformInterface />;
  if (variant === "suite") return <SuiteInterface />;
  if (variant === "control") return <ControlInterface />;

  const definition = getProduct(variant);
  const Icon = definition.icon;

  return (
    <div className={`product-interface interface-${variant} ${compact ? "is-compact" : ""}`} aria-label={`${definition.name} sample interface`}>
      <aside className="interface-sidebar">
        <div className="interface-brand"><span className="interface-mark">O</span><span>{definition.shortName}</span></div>
        <div className="interface-nav"><span className="is-active"><LayoutDashboard size={14} />Overview</span><span><Icon size={14} />{variant === "invoice" ? "Invoices" : variant === "hr" ? "Employees" : variant === "booking" ? "Bookings" : "Floor plan"}</span><span><FileText size={14} />{variant === "invoice" ? "Customers" : variant === "hr" ? "Attendance" : variant === "booking" ? "Calendar" : "Reservations"}</span><span><Settings2 size={14} />Settings</span></div>
        <span className="interface-sidebar-foot"><ShieldCheck size={13} />Secure workspace</span>
      </aside>
      <div className="interface-main">
        <header className="interface-topbar"><button className="interface-mobile-menu" type="button" aria-label="Menu"><Menu size={14} /></button><div className="interface-heading"><span>{variant === "invoice" ? "Financial overview" : variant === "hr" ? "People overview" : variant === "booking" ? "Booking overview" : "Workspace overview"}</span><strong>{variant === "invoice" ? "Keep every document moving" : variant === "hr" ? "Your team, at a glance" : variant === "booking" ? "Today’s appointments" : "Floor plan at a glance"}</strong></div><div className="interface-actions"><Search size={14} /><span className="interface-avatar">A</span></div></header>
        <div className="interface-toolbar"><span className="interface-select">This month <ChevronDown size={12} /></span><span className="interface-toolbar-note">Sample workspace</span></div>
        <div className="interface-stats">
          {(variant === "invoice" ? [["Open invoices", "18", "4 overdue"], ["Payments", "€24.8k", "This period"], ["Customers", "42", "Active records"]] : variant === "hr" ? [["Employees", "48", "Active people"], ["Attendance", "92%", "This week"], ["Leave requests", "6", "To review"]] : variant === "booking" ? [["Bookings", "12", "Today"], ["Open slots", "24", "This week"], ["Customers", "86", "Active records"]] : [["Available desks", "16", "Today"], ["Reservations", "28", "This week"], ["Who’s in", "32", "Office today"]]).map(([label, value, note]) => <div className="interface-stat" key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}
        </div>
        <div className="interface-content-grid">
          {variant === "desk" ? <DeskSurface /> : variant === "booking" ? <BookingSurface /> : <ActivitySurface variant={variant} />}
          <div className="interface-list-panel"><div className="interface-panel-head"><strong>{variant === "hr" ? "Team status" : "Recent activity"}</strong><ArrowUpRight size={13} /></div>{["Ariana Hayes", "Mila Petrovic", "Meridian Works", "Sample update"].map((item, index) => <div className="interface-list-row" key={item}><span className={`list-avatar list-avatar-${index + 1}`}>{item.slice(0, 1)}</span><span><b>{item}</b><small>{variant === "hr" ? ["Employee profile", "Leave request", "Payroll review", "Document update"][index] : ["Updated today", "Ready for review", "Payment received", "Just now"][index]}</small></span><em>{index % 2 ? "Ready" : "Active"}</em></div>)}</div>
        </div>
      </div>
    </div>
  );
}

function ActivitySurface({ variant }: { variant: "invoice" | "hr" }) {
  return <div className="interface-chart-panel"><div className="interface-panel-head"><span><strong>{variant === "invoice" ? "Financial activity" : "Workforce activity"}</strong><small>Last 12 months</small></span><MoreHorizontal size={14} /></div><div className="interface-chart"><div className="chart-axis"><span>100</span><span>50</span><span>0</span></div><div className="chart-bars">{[42, 55, 47, 69, 57, 82, 64, 88, 76, 93, 81, 96].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div></div><div className="interface-chart-labels"><span>Jan</span><span>Mar</span><span>May</span><span>Jul</span><span>Sep</span><span>Nov</span></div></div>;
}

function BookingSurface() {
  return <div className="interface-calendar-panel"><div className="interface-panel-head"><span><strong>Calendar</strong><small>Mon, 24 Aug</small></span><span className="interface-select">Week <ChevronDown size={12} /></span></div><div className="calendar-grid"><div className="calendar-times"><span>09:00</span><span>11:00</span><span>13:00</span><span>15:00</span></div><div className="calendar-slots"><span className="calendar-event event-blue" style={{ top: "7%", height: "19%" }}>Consultation<small>09:30 · Room A</small></span><span className="calendar-event event-green" style={{ top: "40%", height: "16%" }}>Team booking<small>12:00 · Studio</small></span><span className="calendar-event event-purple" style={{ top: "70%", height: "18%" }}>Client meeting<small>14:30 · Room B</small></span></div></div></div>;
}

function DeskSurface() {
  return <div className="interface-floor-panel"><div className="interface-panel-head"><span><strong>Floor plan</strong><small>Floor 1 · Today</small></span><span className="interface-select">All desks <ChevronDown size={12} /></span></div><div className="floor-canvas"><span className="floor-room room-kitchen">Kitchen</span><span className="floor-room room-meeting">Meeting</span>{Array.from({ length: 18 }, (_, index) => <i key={index} className={`floor-desk ${index === 4 || index === 11 ? "is-reserved" : index === 15 ? "is-mine" : ""}`} style={{ left: `${12 + (index % 6) * 14}%`, top: `${18 + Math.floor(index / 6) * 27}%` }}><span>{index + 1}</span></i>)}<span className="floor-legend"><i className="free" />Available <i className="reserved" />Reserved</span></div></div>;
}

function SuiteInterface() {
  return <div className="product-interface interface-suite" aria-label="OperiX Suite sample interface"><div className="suite-interface-sidebar"><div className="interface-brand"><span className="interface-mark">O</span><span>Suite</span></div><span className="suite-side-active"><LayoutDashboard size={14} />Overview</span><span><Users size={14} />People</span><span><FileText size={14} />Activity</span><span><Settings2 size={14} />Settings</span><div className="suite-side-org"><small>Organization</small><strong>Northwind Co.</strong><ChevronDown size={12} /></div></div><div className="interface-main suite-interface-main"><header className="interface-topbar"><div className="interface-heading"><span>Connected workspace</span><strong>Good morning, Alex</strong></div><div className="interface-actions"><span className="interface-avatar">A</span></div></header><div className="suite-main-copy"><span className="interface-kicker">Your apps</span><h3>Move between the work that keeps your business moving.</h3><p>One account. One organization. The applications your team uses.</p></div><div className="suite-app-grid">{appLauncherItems.map((item) => <div className="suite-app-card" key={item.key} style={{ ["--app-accent" as string]: item.accent }}><span><ProductIcon product={item.key} size={17} /></span><strong>{item.shortName}</strong><small>{item.navigationDescription}</small><ArrowUpRight size={13} /></div>)}</div></div></div>;
}

function ControlInterface() {
  return <div className="product-interface interface-control" aria-label="OperiX Control sample interface"><aside className="control-interface-sidebar"><div className="interface-brand"><span className="interface-mark">O</span><span>Control</span></div><div className="control-interface-switcher"><Grid2X2 size={14} /><span>OperiX Apps</span><ChevronDown size={12} /></div>{["Organizations", "Users", "Roles", "Permissions", "Apps", "Security", "Integrations", "Audit logs"].map((item, index) => <span key={item} className={index === 3 ? "is-active" : ""}><ShieldCheck size={13} />{item}</span>)}</aside><div className="interface-main control-interface-main"><header className="interface-topbar"><div className="interface-heading"><span>OperiX Control / Permissions</span><strong>Manage access with confidence</strong></div><div className="interface-actions"><Search size={14} /><span className="interface-avatar">A</span></div></header><div className="control-breadcrumb"><span>Roles</span><ArrowUpRight size={12} /><strong>People Manager</strong></div><div className="control-tabs"><span className="is-active">Permissions</span><span>Users</span><span>Apps</span><span>Security</span><span>Audit logs</span></div><div className="control-permission-list">{[["View employee profiles", "Allow"], ["Edit employment details", "Allow"], ["Manage compensation", "Deny"], ["View time off requests", "Allow"], ["View HR reports", "Allow"]].map(([label, status]) => <div key={label}><span><LockKeyhole size={13} />{label}</span><strong className={status === "Deny" ? "is-denied" : ""}>{status}</strong></div>)}</div><div className="control-note"><ShieldCheck size={15} /><span><strong>App Launcher always available.</strong> Switch to Suite, Invoice, HR, Booking, Desk, or Control without leaving the OperiX session.</span></div></div></div>;
}

export function PlatformInterface() {
  return <div className="platform-interface"><div className="platform-layer platform-control"><ShieldCheck size={15} /><span>OperiX Control<small>Organizations · roles · permissions</small></span></div><div className="platform-connector" /><div className="platform-layer platform-suite"><Grid2X2 size={15} /><span>OperiX Suite<small>Account · organization · App Launcher</small></span></div><div className="platform-connector platform-split" /><div className="platform-products">{(["invoice", "hr", "booking", "desk"] as ProductKey[]).map((key) => { const product = getProduct(key); return <div className="platform-node" key={key} style={{ ["--node-accent" as string]: product.accent }}><ProductIcon product={key} size={15} /><span>{product.shortName}<small>{key === "invoice" ? "Finance" : key === "hr" ? "People" : key === "booking" ? "Reservations" : "Workplace"}</small></span></div>; })}</div></div>;
}

export function PlatformComposition() {
  return <div className="platform-composition"><div className="composition-window composition-invoice"><div className="composition-title"><ReceiptText size={12} />OperiX Invoice <MoreHorizontal size={12} /></div><div className="composition-table"><span>Invoices</span><b>INV-2026-0042</b><i>Paid</i><b>INV-2026-0041</b><i>Sent</i><b>INV-2026-0040</b><i>Overdue</i></div></div><div className="composition-window composition-hr"><div className="composition-title"><Users size={12} />OperiX HR <MoreHorizontal size={12} /></div><div className="composition-profile"><span className="profile-avatar">AH</span><div><b>Ariana Hayes</b><small>People Operations Manager</small></div></div><div className="composition-lines"><i /><i /><i /><i /></div></div><div className="composition-window composition-booking"><div className="composition-title"><CalendarDays size={12} />OperiX Booking <MoreHorizontal size={12} /></div><div className="mini-calendar"><span>Mon</span><span>Tue</span><span>Wed</span><i className="mini-event blue" /><i className="mini-event green" /><i className="mini-event purple" /></div></div><div className="composition-window composition-desk"><div className="composition-title"><MapPinned size={12} />OperiX Desk <MoreHorizontal size={12} /></div><div className="mini-floor">{Array.from({ length: 12 }, (_, index) => <i key={index} className={index === 5 ? "reserved" : index === 9 ? "mine" : ""} />)}</div><span className="mini-floor-label">Floor 1 · 16 available</span></div><div className="composition-window composition-control"><div className="composition-title"><ShieldCheck size={12} />OperiX Control <MoreHorizontal size={12} /></div><div className="composition-control-head"><span>Roles /</span><b>People Manager</b></div><div className="composition-permissions"><span>View employee profiles <strong>Allow</strong></span><span>Edit employment details <strong>Allow</strong></span><span>Manage compensation <strong className="deny">Deny</strong></span><span>View time off requests <strong>Allow</strong></span></div></div><div className="composition-suite"><div className="composition-suite-head"><span className="suite-brand-mark">O</span><span>OperiX Suite</span><XGlyph /></div><span className="composition-suite-greeting">Good morning, Alex.</span><span className="composition-suite-search"><Search size={11} />Search apps, people, and more</span><div className="composition-suite-apps">{appLauncherItems.slice(0, 6).map((item) => <span key={item.key} style={{ ["--app-accent" as string]: item.accent }}><ProductIcon product={item.key} size={14} /><b>{item.shortName}</b><small>{item.key === "invoice" ? "Finance" : item.key === "hr" ? "People" : item.key === "booking" ? "Bookings" : item.key === "desk" ? "Workplace" : item.key === "control" ? "Admin" : "Workspace"}</small></span>)}</div><span className="composition-suite-org">Northwind Co. <ChevronDown size={10} /></span></div></div>;
}

function XGlyph() { return <span className="composition-close">×</span>; }

export function AppLauncherVisual() {
  return <div className="launcher-visual"><div className="launcher-profile"><span className="profile-avatar">NW</span><div><strong>Northwind Co.</strong><small>Alex Morgan · Admin</small></div><ChevronDown size={15} /></div><div className="launcher-columns"><div><span className="launcher-caption">Account</span><a>Profile</a><a>Settings</a><a>Switch organization</a><a>Sign out</a></div><div className="launcher-apps"><span className="launcher-caption">Your OperiX apps</span>{appLauncherItems.map((item) => <a key={item.key} style={{ ["--app-accent" as string]: item.accent }}><span><ProductIcon product={item.key} size={16} /></span><strong>{item.name}</strong><small>{item.navigationDescription}</small><ArrowUpRight size={13} /></a>)}</div></div></div>;
}

export function ProductShowcase({ product }: { product: ProductKey }) {
  const definition = getProduct(product);
  return <div className="product-showcase"><BrowserFrame><ProductInterface variant={product} /></BrowserFrame>{definition.hasMobile ? <MobileDeviceFrame product={product} /> : null}</div>;
}

export function MobileAvailability({ showMobile = true }: { showMobile?: boolean }) {
  return <div className="availability-panel"><div className="availability-web"><LaptopGlyph /><span><strong>Web</strong><small>Use the full platform in your browser.</small></span></div>{showMobile ? <div className="availability-mobile"><SmartphoneGlyph /><span><strong>iOS + Android</strong><small>Invoice, HR, Booking, and Desk support mobile workflows.</small></span></div> : <div className="availability-mobile"><LaptopGlyph /><span><strong>Web-only product</strong><small>This product does not have a native mobile application.</small></span></div>}</div>;
}

function LaptopGlyph() { return <span className="availability-icon"><svg viewBox="0 0 28 28" aria-hidden="true"><rect x="4" y="4" width="20" height="14" rx="2" /><path d="M2 22h24" /><path d="M9 22l1-3h8l1 3" /></svg></span>; }
function SmartphoneGlyph() { return <span className="availability-icon"><svg viewBox="0 0 28 28" aria-hidden="true"><rect x="8" y="3" width="12" height="22" rx="3" /><path d="M12 6h4" /><circle cx="14" cy="21" r="1" /></svg></span>; }
