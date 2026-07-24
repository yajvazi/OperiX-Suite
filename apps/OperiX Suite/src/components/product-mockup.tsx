import Image from "next/image";
import { BarChart3, FileText, LayoutDashboard, Settings, UserRound, Users } from "lucide-react";

const bars = [38, 54, 44, 70, 58, 82, 66, 88, 76, 94, 84, 100];

export function DashboardMockup({ variant = "suite" }: { variant?: "suite" | "invoice" | "hr" | "booking" | "desk" }) {
  const isHR = variant === "hr";
  const isBooking = variant === "booking";
  const isDesk = variant === "desk";
  if (isDesk) return <DeskMockup />;
  return (
    <div className={`dashboard-mockup dashboard-${variant}`} aria-label={`${variant} dashboard preview`}>
      <aside>
        <div className="mock-logo"><Image src={isDesk?"/brand/operix-desk-logo-white.svg":isBooking?"/brand/operix-booking-logo-white.svg":"/brand/operix-x-dashboard.svg"} width={30} height={30} alt="" aria-hidden="true" /></div>
        <LayoutDashboard />
        {isHR ? <Users /> : <FileText />}
        <BarChart3 />
        <Settings />
      </aside>
      <div className="mock-main">
        <header>
          <div>
            <span>{isHR ? "People overview" : isDesk ? "Workspace overview" : isBooking ? "Booking overview" : variant === "invoice" ? "Financial overview" : "Business overview"}</span>
            <strong>{isHR ? "Your team, at a glance" : isDesk ? "Floor plan at a glance" : isBooking ? "Today's appointments" : "Good morning"}</strong>
          </div>
          <div className="mock-avatar"><UserRound aria-hidden="true" /></div>
        </header>
        <div className="mock-stats">
          <div><span>{isHR ? "Employees" : isDesk ? "Desks" : isBooking ? "Appointments" : "Revenue"}</span><strong>{isHR ? "Team" : isDesk ? "42" : isBooking ? "18" : "€24,850"}</strong><small>Current period</small></div>
          <div><span>{isHR ? "Attendance" : isDesk ? "Available" : isBooking ? "Confirmed" : "Outstanding"}</span><strong>{isHR ? "On track" : isDesk ? "16" : isBooking ? "14" : "€4,280"}</strong><small>Updated today</small></div>
          <div><span>{isHR ? "Leave" : isDesk ? "Rooms" : isBooking ? "Open slots" : "Invoices"}</span><strong>{isHR ? "Overview" : isDesk ? "8" : isBooking ? "6" : "128"}</strong><small>Live workspace</small></div>
        </div>
        <div className="mock-content">
          {isDesk ? <div className="mock-floorplan"><div className="mock-block-head"><strong>Floor plan</strong><span>Today · 16 free</span></div><div className="floorplan-canvas"><div className="floor-zone zone-open"><small>Open workspace</small>{[1,2,3,4,5,6].map(item=><i key={item} className={item%3===0?"reserved":"free"}><b>{item}</b><em>{item%3===0?"●":""}</em></i>)}</div><div className="floor-zone zone-room"><small>Meeting room</small><i className="reserved"><b>Room A</b><em>●</em></i></div><span className="floor-pin pin-one">A</span><span className="floor-pin pin-two">M</span></div></div> : isBooking ? <div className="mock-schedule mock-booking"><div className="mock-block-head"><strong>Appointments</strong><span>09:00–17:00</span></div>{[1,2,3,4,5,6].map(item=><div className="mock-schedule-row" key={item}><span>{`${String(8+item).padStart(2,"0")}:00`}</span><i className={item%3===0?"busy":"available"}>{item%3===0?"Consultation":"Open"}</i></div>)}</div> : <div className="mock-chart">
            <div className="mock-block-head"><strong>{isHR ? "Workforce activity" : "Performance"}</strong><span>12 months</span></div>
            <div className="bars">
              {bars.map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}
            </div>
          </div>}
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

function DeskMockup(){return <div className="desk-product-mockup" aria-label="OperiX Desk floor plan preview"><aside className="desk-mock-sidebar"><div className="desk-mock-brand"><Image src="/brand/operix-desk-logo-white.svg" width={92} height={28} alt="OperiX Desk"/></div><span>AI Assistant</span><span>My Reservations</span><b>ADMINISTRATION</b><span>▦ Admin Dashboard</span><span>▣ Resources</span><span>▱ Floor Builder</span><span>♙ Team Builder</span><span>⌁ Analytics</span><span>♙ Users</span></aside><div className="desk-mock-main"><header className="desk-mock-top"><div className="desk-mock-search">⌕ Search desks, rooms, colleagues…</div><span>▣ HQ · Prishtina</span><span>◉</span><strong>Sarah Chen</strong><i>S</i></header><div className="desk-mock-filters"><label>DATE <b>07/24/2026</b></label><label>FLOOR <b>Floor 1⌄</b></label><label>RESOURCE TYPE <b>All resources⌄</b></label></div><div className="desk-mock-workspace"><div className="desk-mock-zones"><strong>⚱ Zones</strong><span>☑ Collaboration</span><span>☑ Meeting</span><span>☑ Open Area</span><hr/><small>LEGEND</small><span className="legend-green">● Available</span><span className="legend-red">● Reserved</span><span className="legend-blue">● My Reservation</span></div><div className="desk-mock-map"><div className="desk-map-label">Floor 1 · Fri, Jul 24</div><div className="desk-floor"><em>Kitchen</em><em>Server Room</em><em>Reception</em>{Array.from({length:18},(_,i)=><i key={i} className={i===5?"pin reserved":"pin"} style={{left:`${12+(i%6)*14}%`,top:`${20+Math.floor(i/6)*25}%`}}>{i===5?"":""}</i>)}</div></div><div className="desk-mock-detail"><div className="desk-photo">Available Now</div><small>Floor 1 &gt; Open Area</small><h3>Desk 1</h3><p>Hot Desk</p><b className="desk-available">Available</b><ul><li>Near window</li><li>Charging station</li><li>Ergonomic chair</li><li>Near team</li></ul><button>Reserve Now</button><button className="desk-secondary">Recurring reservation</button></div></div></div></div>}

export function PhoneMockup({ variant = "invoice" }: { variant?: "invoice" | "hr" }) {
  const isHR = variant === "hr";
  return (
    <div className="phone-mockup" aria-label={`${variant} mobile app preview`}>
      <div className="phone-notch" />
      <div className="phone-screen">
        <header><Image className="phone-wordmark" src="/brand/operix-wordmark-blue.svg" width={52} height={18} alt="OperiX" /><div className="tiny-avatar"><UserRound aria-hidden="true" /></div></header>
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
