"use client";

import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import {
  createDemoState,
  type DemoClient,
  type DemoInvoice,
  type DemoProduct,
  type DemoState,
  type DemoVendor,
} from "@/lib/demo-data";

const storageKey = "operix-invoice-demo-v1";

interface DemoContextValue {
  state: DemoState;
  hydrated: boolean;
  addClient: (entry: Omit<DemoClient, "id">) => boolean;
  addVendor: (entry: Omit<DemoVendor, "id">) => boolean;
  addProduct: (entry: Omit<DemoProduct, "id">) => boolean;
  addInvoice: (entry: DemoInvoice) => boolean;
  reset: () => void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

function localId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(createDemoState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved) as DemoState;
          if (parsed.version === 1) setState(parsed);
        }
      } catch {
        window.localStorage.removeItem(storageKey);
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(storageKey, JSON.stringify(state));
  }, [hydrated, state]);

  function commit(next: DemoState) {
    window.localStorage.setItem(storageKey, JSON.stringify(next));
    setState(next);
  }

  function addClient(entry: Omit<DemoClient, "id">) {
    if (state.clients.length >= 8) return false;
    commit({ ...state, clients: [...state.clients, { ...entry, id: localId("client") }] });
    return true;
  }

  function addVendor(entry: Omit<DemoVendor, "id">) {
    if (state.vendors.length >= 8) return false;
    commit({ ...state, vendors: [...state.vendors, { ...entry, id: localId("vendor") }] });
    return true;
  }

  function addProduct(entry: Omit<DemoProduct, "id">) {
    if (state.products.length >= 16) return false;
    commit({ ...state, products: [...state.products, { ...entry, id: localId("product") }] });
    return true;
  }

  function addInvoice(entry: DemoInvoice) {
    if (state.invoices.length >= 20) return false;
    commit({ ...state, invoices: [entry, ...state.invoices] });
    return true;
  }

  function reset() {
    const fresh = createDemoState();
    setState(fresh);
    window.localStorage.setItem(storageKey, JSON.stringify(fresh));
  }

  return (
    <DemoContext.Provider value={{ state, hydrated, addClient, addVendor, addProduct, addInvoice, reset }}>
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo() {
  const value = useContext(DemoContext);
  if (!value) throw new Error("useDemo must be used inside DemoProvider");
  return value;
}
