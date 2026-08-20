"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type Locale = "en" | "sq";
type Dictionary = Record<string, string>;

const dictionaries: Record<Locale, Dictionary> = {
  en: {
    overview: "Overview", organization: "Organization", users: "Users", teams: "Teams & groups", roles: "Roles & permissions", apps: "Apps", integrations: "Integrations", automations: "Automations", notifications: "Notifications", billing: "Billing & plans", usage: "Usage", security: "Security", audit: "Audit log", api: "API & webhooks", data: "Data & storage", status: "System status", settings: "Settings",
    search: "Search OperiX Control", organizationSwitcher: "Organization", productSwitcher: "Product", signOut: "Sign out", language: "Language", english: "English", albanian: "Shqip", openMenu: "Open navigation", closeMenu: "Close navigation", notificationsEmpty: "No Control notifications yet.", commandTitle: "Command palette", commandHint: "Search navigation and quick actions", commandSearchPlaceholder: "Search pages and actions", navigation: "Navigation", quickActions: "Quick actions", noMatchingActions: "No matching actions.", cancel: "Cancel", save: "Save changes", retry: "Retry", loading: "Loading OperiX Control…", accessDenied: "You do not have permission to access this area.", notConfigured: "This surface is not connected to the shared OperiX data contract yet.", goodMorning: "Good morning", dashboardDescription: "Manage your OperiX organization from one place.", yourApps: "Your apps", suiteModules: "Suite modules available to your organization", manageApps: "Manage apps", usersStat: "Users", activeAppsStat: "Active apps", adminsStat: "Admins", storageStat: "Storage", monthlyUsageStat: "Monthly usage", securityAlertsStat: "Security alerts",
  },
  sq: {
    overview: "Përmbledhje", organization: "Organizata", users: "Përdoruesit", teams: "Ekipet dhe grupet", roles: "Rolet dhe lejet", apps: "Aplikacionet", integrations: "Integrimet", automations: "Automatizimet", notifications: "Njoftimet", billing: "Faturimi dhe planet", usage: "Përdorimi", security: "Siguria", audit: "Regjistri i auditimit", api: "API dhe webhook-et", data: "Të dhënat dhe ruajtja", status: "Statusi i sistemit", settings: "Cilësimet",
    search: "Kërko në OperiX Control", organizationSwitcher: "Organizata", productSwitcher: "Produkti", signOut: "Dil", language: "Gjuha", english: "English", albanian: "Shqip", openMenu: "Hap navigimin", closeMenu: "Mbyll navigimin", notificationsEmpty: "Nuk ka njoftime të Control.", commandTitle: "Paleta e komandave", commandHint: "Kërko navigimin dhe veprimet", commandSearchPlaceholder: "Kërko faqe dhe veprime", navigation: "Navigimi", quickActions: "Veprime të shpejta", noMatchingActions: "Nuk u gjetën veprime.", cancel: "Anulo", save: "Ruaj ndryshimet", retry: "Provo përsëri", loading: "Po ngarkohet OperiX Control…", accessDenied: "Nuk ke leje për të hyrë në këtë zonë.", notConfigured: "Kjo pjesë nuk është lidhur ende me kontratën e përbashkët të të dhënave OperiX.", goodMorning: "Mirëmëngjes", dashboardDescription: "Menaxho organizatën tënde OperiX nga një vend.", yourApps: "Aplikacionet e tua", suiteModules: "Modulet e Suite të disponueshme për organizatën", manageApps: "Menaxho aplikacionet", usersStat: "Përdoruesit", activeAppsStat: "Aplikacionet aktive", adminsStat: "Administratorët", storageStat: "Ruajtja", monthlyUsageStat: "Përdorimi mujor", securityAlertsStat: "Sinjalizimet e sigurisë",
  },
};

type LocaleContextValue = { locale: Locale; setLocale: (locale: Locale) => void; t: (key: string) => string };
const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children, defaultLocale = "en" }: { children: React.ReactNode; defaultLocale?: string | null }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale === "sq" ? "sq" : "en");

  useEffect(() => {
    const stored = window.localStorage.getItem("operix-control-locale");
    if (stored === "sq" || stored === "en") setLocaleState(stored);
  }, []);

  function setLocale(next: Locale) {
    setLocaleState(next);
    window.localStorage.setItem("operix-control-locale", next);
  }

  const value = useMemo(() => ({ locale, setLocale, t: (key: string) => dictionaries[locale][key] || dictionaries.en[key] || key }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used inside LocaleProvider");
  return value;
}
