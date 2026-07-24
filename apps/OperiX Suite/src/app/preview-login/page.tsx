import Image from "next/image";
import { ArrowRight, Eye, LockKeyhole, ShieldCheck } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PREVIEW_COOKIE, verifyPreviewSession } from "@/lib/preview-auth";

type PreviewLoginProps = {
  searchParams: Promise<{ error?: string; next?: string }>;
};

export default async function PreviewLoginPage({ searchParams }: PreviewLoginProps) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const nextPath = params.next?.startsWith("/") && !params.next.startsWith("//")
    ? params.next
    : "/en/preview";

  if (verifyPreviewSession(cookieStore.get(PREVIEW_COOKIE)?.value)) redirect(nextPath);

  return (
    <section className="preview-login-page">
      <div className="preview-login-glow" />
      <div className="container preview-login-shell">
        <div className="preview-login-panel">
          <div className="preview-login-brand">
            <Image src="/brand/operix-wordmark-blue.svg" width={132} height={44} alt="OperiX" priority />
            <span>Suite</span>
          </div>
          <div className="preview-login-icon"><LockKeyhole aria-hidden="true" /></div>
          <span className="eyebrow">Private preview</span>
          <h1>Welcome back.</h1>
          <p>Sign in to review the complete OperiX Suite website before it is available publicly.</p>

          <form className="preview-login-form" action="/api/preview-login" method="post">
            <input type="hidden" name="next" value={nextPath} />
            <label>
              <span>Email or username</span>
              <input name="username" type="text" autoComplete="username" required autoFocus />
            </label>
            <label>
              <span>Password</span>
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            {params.error ? <p className="preview-login-error" role="alert">The username or password is incorrect.</p> : null}
            <button className="button preview-login-submit" type="submit">Open private preview <ArrowRight aria-hidden="true" /></button>
          </form>

          <div className="preview-login-note"><ShieldCheck aria-hidden="true" /> Secure owner access · Session expires after 12 hours</div>
        </div>

        <aside className="preview-login-visual" aria-hidden="true">
          <div className="preview-login-visual-top"><span><i /> Preview environment</span><small>Owner access</small></div>
          <div className="preview-browser-frame">
            <div className="preview-browser-bar"><span /><span /><span /><b>operixsuite.com</b></div>
            <div className="preview-browser-content">
              <Image src="/brand/operix-xc-white.svg" width={62} height={62} alt="" />
              <div><small>OperiX Control</small><strong>One suite.<br />Complete control.</strong></div>
              <div className="preview-browser-lines"><i /><i /><i /></div>
            </div>
          </div>
          <div className="preview-access-card"><Eye /><span><strong>Full website preview</strong>Review every page privately before launch.</span></div>
        </aside>
      </div>
    </section>
  );
}
