import { BookingDataProvider } from "@/lib/booking-context";
import { BookingShell } from "@/components/booking-shell";

export default function BookingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <BookingDataProvider><BookingShell>{children}</BookingShell></BookingDataProvider>;
}
