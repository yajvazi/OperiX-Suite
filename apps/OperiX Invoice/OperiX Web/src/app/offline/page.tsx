import { WifiOff } from "lucide-react";
import { Brand } from "@/components/brand";

export default function OfflinePage() {
  return <main className="min-h-screen grid place-items-center p-6 bg-white"><section className="max-w-md text-center"><Brand dark /><WifiOff size={42} className="mx-auto mt-12 mb-5 text-[#004ffe]"/><h1 className="page-title mb-3">You’re offline</h1><p className="muted leading-6">OperiX keeps the app shell available, but business records require a secure internet connection. Reconnect and refresh to continue.</p></section></main>;
}
