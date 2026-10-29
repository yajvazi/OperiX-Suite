import type { Article } from "../types";
import { billingGuides } from "./invoice-billing";
import { mobileSelfHostGuides } from "./invoice-mobile-selfhost";
import { operationsGuides } from "./invoice-operations";
import { storageGuides } from "./invoice-storage";
import { troubleshootingGuides } from "./invoice-troubleshooting";

/** OperiX Invoice guides for the on-device mode, plans, daily workflows, mobile, self-hosting and troubleshooting. */
export const invoiceGuides: Article[] = [
  ...storageGuides,
  ...billingGuides,
  ...operationsGuides,
  ...mobileSelfHostGuides,
  ...troubleshootingGuides,
];
