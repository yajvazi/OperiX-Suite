"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { AppLocale } from "@invoice-monorepo/i18n";

type Messages = Record<string, string>;
const messages: Record<AppLocale, Messages> = {
  en: {
    dashboard: "Dashboard", employees: "Employees", attendance: "Attendance", leave: "Leave", payroll: "Payroll", recruitment: "Recruitment", performance: "Performance", organizationStructure: "Organization", contracts: "Contracts", workflows: "Workflows",
    documents: "Documents", reports: "Reports", settings: "Settings", search: "Search HR", notifications: "Notifications",
    goodMorning: "Good morning", today: "Here’s what’s happening in your organization today.", totalEmployees: "Total Employees",
    presentToday: "Present Today", onLeave: "On Leave", newHires: "New Hires This Month", openPositions: "Open Positions",
    attendanceOverview: "Attendance Overview", leaveOverview: "Leave Overview", upcomingLeave: "Upcoming Leave",
    announcements: "Announcements", birthdays: "Birthdays", recentActivity: "Recent HR Activity", addEmployee: "Add Employee",
    noData: "No data available yet", retry: "Try again", signIn: "Sign in", useAccount: "Sign in to your OperiX account.",
    email: "Email", password: "Password", signOut: "Sign out", organization: "Organization", appSwitcher: "App switcher",
    requestLeave: "Request leave", clockIn: "Clock in", clockOut: "Clock out", approvals: "Approvals", active: "Active",
  },
  sq: {
    dashboard: "Paneli", employees: "Punonjësit", attendance: "Vijueshmëria", leave: "Lejet", payroll: "Pagat", recruitment: "Rekrutimi", performance: "Performanca", organizationStructure: "Organizata", contracts: "Kontratat", workflows: "Rrjedhat e punës",
    documents: "Dokumentet", reports: "Raportet", settings: "Cilësimet", search: "Kërko në HR", notifications: "Njoftimet",
    goodMorning: "Mirëmëngjes", today: "Ja çfarë po ndodh sot në organizatën tuaj.", totalEmployees: "Gjithsej punonjës",
    presentToday: "Të pranishëm sot", onLeave: "Me leje", newHires: "Punësime këtë muaj", openPositions: "Pozita të hapura",
    attendanceOverview: "Përmbledhja e vijueshmërisë", leaveOverview: "Përmbledhja e lejeve", upcomingLeave: "Lejet e ardhshme",
    announcements: "Njoftimet", birthdays: "Përvjetorët", recentActivity: "Aktiviteti i fundit HR", addEmployee: "Shto punonjës",
    noData: "Ende nuk ka të dhëna", retry: "Provo përsëri", signIn: "Hyr", useAccount: "Hyni në llogarinë tuaj OperiX.",
    email: "Email", password: "Fjalëkalimi", signOut: "Dil", organization: "Organizata", appSwitcher: "Ndërruesi i aplikacioneve",
    requestLeave: "Kërko leje", clockIn: "Fillo punën", clockOut: "Përfundo punën", approvals: "Miratimet", active: "Aktiv",
  },
};

const LocaleContext = createContext<{ locale: AppLocale; setLocale: (locale: AppLocale) => void; t: (key: string) => string } | null>(null);

export function HrLocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<AppLocale>("en");
  const value = useMemo(() => ({ locale, setLocale, t: (key: string) => messages[locale][key] ?? messages.en[key] ?? key }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useHrLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useHrLocale must be used within HrLocaleProvider");
  return value;
}
