import type { Article } from "../types";
import { generalGuides } from "./general";
import { invoiceGuides } from "./invoice";
import { invoiceWebGuides } from "./invoice-web";
import { bookingExtraGuides } from "./booking-extra";

/** Hand-written guides in English and Albanian. The generated Invoice catalog and the Booking registry are merged in articles.ts. */
export const guideArticles: Article[] = [...generalGuides, ...invoiceGuides, ...invoiceWebGuides, ...bookingExtraGuides];
