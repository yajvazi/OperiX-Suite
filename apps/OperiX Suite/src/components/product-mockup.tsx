import Image from "next/image";
import { BarChart3, FileText, LayoutDashboard, Settings, UserRound, Users } from "lucide-react";

const bars = [38, 54, 44, 70, 58, 82, 66, 88, 76, 94, 84, 100];

export function DashboardMockup({ variant = "suite" }: { variant?: "suite" | "invoice" | "hr" }) {
  const isHR = variant === "hr";
  return (
    <div className={`dashboard-mockup dashboard-${variant}`} aria-label={`${variant} dashboard preview`}>
      <aside>
        <div className="mock-logo"><Image src="/brand/operix-x-dashboard.svg" width={30} height={30} alt="" aria-hidden="true" /></div>
        <LayoutDashboard />
        {isHR ? <Users /> : <FileText />}
        <BarChart3 />
        <Settings />
      </aside>
      <div className="mock-main">
        <header>
          <div>
            <span>{isHR ? "People overview" : variant === "invoice" ? "Financial overview" : "Business overview"}</span>
            <strong>{isHR ? "Your team, at a glance" : "Good morning"}</strong>
          </div>
          <div className="mock-avatar"><UserRound aria-hidden="true" /></div>
        </header>
        <div className="mock-stats">
          <div><span>{isHR ? "Employees" : "Revenue"}</span><strong>{isHR ? "Team" : "€24,850"}</strong><small>Current period</small></div>
          <div><span>{isHR ? "Attendance" : "Outstanding"}</span><strong>{isHR ? "On track" : "€4,280"}</strong><small>Updated today</small></div>
          <div><span>{isHR ? "Leave" : "Invoices"}</span><strong>{isHR ? "Overview" : "128"}</strong><small>Live workspace</small></div>
        </div>
        <div className="mock-content">
          <div className="mock-chart">
            <div className="mock-block-head"><strong>{isHR ? "Workforce activity" : "Performance"}</strong><span>12 months</span></div>
            <div className="bars">
              {bars.map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}
            </div>
          </div>
          <div className="mock-list">
            <div className="mock-block-head"><strong>{isHR ? "Team status" : "Recent activity"}</strong><span>View all</span></div>
            {[1, 2, 3, 4].map((item) => (
              <div className="mock-row" key={item}>
                <span className="mock-dot" />
                <span><b>{isHR ? `Team member ${item}` : `Document 00${item}`}</b><small>{isHR ? "Employee record" : "Updated recently"}</small></span>
                <em>{item % 2 ? "Active" : "Ready"}</em>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PhoneMockup({ variant = "invoice" }: { variant?: "invoice" | "hr" }) {
  const isHR = variant === "hr";
  return (
    <div className="phone-mockup" aria-label={`${variant} mobile app preview`}>
      <div className="phone-notch" />
      <div className="phone-screen">
        <header><Image className="phone-wordmark" src="/brand/operix-wordmark-blue.svg" width={52} height={18} alt="OperiX" /><div className="tiny-avatar"><Image src="/brand/operix-x-mark.svg" width={14} height={14} alt="" aria-hidden="true" /></div></header>
        <p>Today</p>
        <h3>{isHR ? "Your team" : "Overview"}</h3>
        <div className="phone-primary">
          <small>{isHR ? "People at work" : "Revenue"}</small>
          <strong>{isHR ? "Team ready" : "€24,850"}</strong>
        </div>
        <div className="phone-grid"><div /><div /></div>
        <div className="phone-list">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}
