"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Camera,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  ClipboardCheck,
  FileText,
  FileCheck2,
  Flame,
  Gauge,
  History,
  LogIn,
  MapPin,
  Menu,
  Navigation,
  PackageCheck,
  ReceiptText,
  Route,
  Search,
  ShieldCheck,
  Smartphone,
  UserRound,
  Wrench,
  X,
} from "lucide-react";

const operatingChapters = [
  {
    icon: <FileCheck2 />,
    title: "Sell the complete system.",
    copy: "Build accurate fireplace packages from the real catalog, then move an approved estimate straight into the work.",
    detail: "Estimates · products · options · approvals",
  },
  {
    icon: <PackageCheck />,
    title: "Know the project is ready.",
    copy: "See required parts, purchase orders, site readiness, and scheduling in one continuous operating record.",
    detail: "Projects · purchasing · schedule · dispatch",
  },
  {
    icon: <Wrench />,
    title: "Own the service relationship.",
    copy: "Keep the exact unit, history, manuals, photos, notes, payments, and next service moment connected to the home.",
    detail: "Field service · unit history · lifetime value",
  },
];

const hearthDisciplines = ["Gas", "Wood", "Pellet", "Electric", "Outdoor", "Chimney"];

export default function DemoLanding() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!("IntersectionObserver" in window)) {
      elements.forEach((element) => element.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" },
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  async function submitDemo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setResult(null);
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());

    try {
      const response = await fetch("/api/demo-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to submit your request.");
      form.reset();
      setResult({
        type: "success",
        message: "Your request is in. We’ll be in touch to schedule your private walkthrough.",
      });
    } catch (error) {
      setResult({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to submit your request.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="launch-site">
      <header className="launch-nav">
        <Link href="/" className="launch-brand" aria-label="HearthOS home">
          <LaunchBrandMark />
          <strong>HearthOS</strong>
        </Link>

        <nav className="launch-links" aria-label="Marketing navigation">
          <a href="#platform">Platform</a>
          <a href="#difference">Built for hearth</a>
          <a href="#field-app">Field app</a>
          <a href="#lifecycle">Customer lifecycle</a>
        </nav>

        <div className="launch-nav-actions">
          <Link href="/sign-in?redirect_url=/account" className="launch-login"><LogIn size={14} /> Sign in</Link>
          <a href="#demo-form" className="launch-button launch-button-small">
            Book a demo <ArrowRight size={14} />
          </a>
        </div>

        <button
          className="launch-menu"
          type="button"
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
        >
          {mobileOpen ? <X size={21} /> : <Menu size={21} />}
        </button>

        {mobileOpen && (
          <div className="launch-mobile-nav">
            <a href="#platform" onClick={() => setMobileOpen(false)}>Platform</a>
            <a href="#difference" onClick={() => setMobileOpen(false)}>Built for hearth</a>
            <a href="#field-app" onClick={() => setMobileOpen(false)}>Field app</a>
            <a href="#lifecycle" onClick={() => setMobileOpen(false)}>Customer lifecycle</a>
            <Link className="launch-mobile-signin" href="/sign-in?redirect_url=/account" onClick={() => setMobileOpen(false)}><LogIn size={15} /> Sign in to your account</Link>
            <a href="#demo-form" className="launch-button" onClick={() => setMobileOpen(false)}>Book a demo</a>
          </div>
        )}
      </header>

      <section className="launch-hero">
        <div className="launch-hero-wash" />
        <div className="launch-hero-copy">
          <div className="launch-eyebrow"><Flame size={14} /> The operating system for the hearth industry</div>
          <h1>HearthOS.</h1>
          <p className="launch-hero-line">Designed by hearth professionals.<br />For hearth professionals.</p>
          <p className="launch-hero-support">
            One purpose-built system for the showroom, the warehouse, the office,
            the installation crew, and every service call after.
          </p>
          <div className="launch-hero-actions">
            <a href="#demo-form" className="launch-button">
              Book your private demo <ArrowRight size={16} />
            </a>
            <a href="#platform" className="launch-secondary">
              See HearthOS <ChevronRight size={16} />
            </a>
          </div>
          <Link href="/sign-in?redirect_url=/account" className="launch-member-link">
            Already using HearthOS? <strong>Sign in to your account</strong> <ChevronRight size={14} />
          </Link>
        </div>

        <div className="launch-hero-signal" aria-label="HearthOS platform summary">
          <span><i /> Purpose-built for hearth</span>
          <span>Showroom to service</span>
          <span>Office + field, connected</span>
        </div>
      </section>

      <section className="launch-industry-band" aria-label="Hearth industry specialties">
        <div>
          <span>One industry. Every part of the operation.</span>
          <div className="launch-disciplines">
            {hearthDisciplines.map((discipline) => <b key={discipline}>{discipline}</b>)}
          </div>
        </div>
      </section>

      <section className="launch-product" id="platform">
        <div className="launch-heading" data-reveal>
          <span>The hearth operating system</span>
          <h2>Your entire operation.<br />One source of truth.</h2>
          <p>HearthOS connects sales, projects, products, people, money, and lifetime customer history without forcing your business into a generic service workflow.</p>
        </div>
        <div data-reveal>
          <ProductConsole />
        </div>
        <div className="launch-product-caption" data-reveal>
          <span><CheckCircle2 /> Live business pulse</span>
          <span><CheckCircle2 /> Project readiness</span>
          <span><CheckCircle2 /> Field visibility</span>
          <span><CheckCircle2 /> Fireplace history</span>
        </div>
      </section>

      <section className="launch-difference" id="difference">
        <div className="launch-difference-heading" data-reveal>
          <span>Built from the hearth trade outward</span>
          <h2>Generic software starts with a job.<br />HearthOS starts with the hearth.</h2>
          <p>Every workflow follows the way a hearth company actually works: configure the system, secure the parts, prepare the site, install it right, and care for it for years.</p>
        </div>
        <div className="launch-chapters">
          {operatingChapters.map((chapter) => (
            <article key={chapter.title} data-reveal>
              <div className="launch-chapter-top">
                <i>{chapter.icon}</i>
              </div>
              <h3>{chapter.title}</h3>
              <p>{chapter.copy}</p>
              <small>{chapter.detail}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="launch-field" id="field-app">
        <div className="launch-field-heading" data-reveal>
          <span>The HearthOS field app</span>
          <h2>Give every technician<br />a better day in the field.</h2>
          <p>Complete job information arrives before the technician does. Time, location, notes, photos, equipment, and closeout stay in one guided mobile workflow.</p>
        </div>

        <div className="launch-field-layout">
          <div className="launch-field-outcomes" data-reveal>
            <article>
              <i><Route size={18} /></i>
              <div><strong>Less back-and-forth</strong><p>Technicians see the customer, unit, job scope, schedule, and special instructions without calling the office for context.</p></div>
            </article>
            <article>
              <i><Clock3 size={18} /></i>
              <div><strong>Cleaner time and job tracking</strong><p>Clock-in, GPS status, job progress, assigned tasks, and completed work stay visible to the team as the day moves.</p></div>
            </article>
            <article>
              <i><Camera size={18} /></i>
              <div><strong>Faster, more complete closeout</strong><p>Photos, notes, checklists, equipment details, and payment steps stay attached to the right job from the start.</p></div>
            </article>
          </div>
          <div data-reveal>
            <TechFieldStage />
          </div>
        </div>

        <div className="launch-field-results" data-reveal>
          <span><b>Fewer office interruptions</b><small>Complete job context travels with the technician.</small></span>
          <span><b>Stronger field accountability</b><small>Status, time, notes, and photos stay connected.</small></span>
          <span><b>Quicker billing readiness</b><small>Completed work returns to the office in one record.</small></span>
        </div>
      </section>

      <section className="launch-lifecycle" id="lifecycle">
        <div className="launch-lifecycle-copy" data-reveal>
          <div className="launch-eyebrow launch-eyebrow-dark"><History size={14} /> The installed unit becomes a living record</div>
          <h2>Know every fire you put into the world.</h2>
          <p>
            Model, serial number, fuel type, venting, warranty, photos, service notes, and customer history stay connected long after installation day.
          </p>
          <div className="launch-lifecycle-proof">
            <span><ShieldCheck /> Complete equipment history</span>
            <span><Smartphone /> Available to office and field</span>
            <span><Gauge /> Built for recurring service</span>
          </div>
        </div>
        <div data-reveal>
          <UnitRecordStage />
        </div>
      </section>

      <section className="launch-conversion" id="demo-form">
        <div className="launch-conversion-copy" data-reveal>
          <span>Private walkthrough</span>
          <h2>See your hearth business<br />inside HearthOS.</h2>
          <p>A focused conversation with people who understand the work, the products, and the details that make this industry different.</p>
          <div className="launch-demo-points">
            <span><Check /> Built around your operation</span>
            <span><Check /> Clear setup and data answers</span>
            <span><Check /> Built around hearth workflows</span>
          </div>
        </div>

        <form className="launch-form" onSubmit={submitDemo} data-reveal>
          <div className="launch-form-heading">
            <strong>Book your demo</strong>
            <span>Tell us a little about your dealership.</span>
          </div>
          <div className="launch-form-grid">
            <label>First name<input name="firstName" autoComplete="given-name" required /></label>
            <label>Last name<input name="lastName" autoComplete="family-name" required /></label>
            <label className="launch-span-2">Work email<input name="email" type="email" autoComplete="email" required /></label>
            <label>Phone<input name="phone" type="tel" autoComplete="tel" required /></label>
            <label>Company<input name="company" autoComplete="organization" required /></label>
            <label>
              Your role
              <select name="role" required defaultValue="">
                <option value="" disabled>Select role</option>
                <option>Owner / Executive</option>
                <option>Operations</option>
                <option>Sales</option>
                <option>Service / Dispatch</option>
                <option>Other</option>
              </select>
            </label>
            <label>
              Team size
              <select name="teamSize" required defaultValue="">
                <option value="" disabled>Select size</option>
                <option>1-5</option>
                <option>6-15</option>
                <option>16-30</option>
                <option>31-75</option>
                <option>76+</option>
              </select>
            </label>
            <label className="launch-span-2">
              What should work better?
              <select name="primaryGoal" required defaultValue="">
                <option value="" disabled>Select a priority</option>
                <option>Scheduling and dispatch</option>
                <option>Estimates and sales</option>
                <option>Projects and purchasing</option>
                <option>Service and customer history</option>
                <option>Inventory and pricebook</option>
                <option>Reporting and profitability</option>
                <option>Everything in one system</option>
              </select>
            </label>
            <input type="hidden" name="currentSoftware" value="" />
            <label className="launch-honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
          </div>
          <button className="launch-button launch-submit" type="submit" disabled={submitting}>
            {submitting ? "Sending request..." : "Request my demo"} {!submitting && <ArrowRight size={16} />}
          </button>
          {result && <div className={`launch-form-result ${result.type}`} role="status" aria-live="polite">{result.message}</div>}
          <small>We’ll only use your information to follow up about HearthOS.</small>
        </form>
      </section>

      <footer className="launch-footer">
        <div className="launch-brand"><LaunchBrandMark compact /><strong>HearthOS</strong></div>
        <p>Designed by hearth professionals, for hearth professionals.</p>
        <div><Link href="/sign-in?redirect_url=/account"><LogIn size={13} /> Sign in</Link><a href="#demo-form">Book a demo</a></div>
      </footer>
    </main>
  );
}

function ProductConsole() {
  return (
    <div className="launch-console" aria-label="HearthOS operating dashboard preview">
      <aside className="launch-console-rail">
        <div className="launch-console-logo"><LaunchBrandMark compact /><b>HearthOS</b></div>
        {["Overview", "Schedule", "Projects", "Customers", "Inventory"].map((item, index) => (
          <span className={index === 0 ? "active" : ""} key={item}>{item}</span>
        ))}
        <div className="launch-console-user"><i>SH</i><span><b>Summit Hearth</b><small>Owner view</small></span></div>
      </aside>

      <div className="launch-console-main">
        <div className="launch-console-topbar">
          <div><small>Tuesday, September 1</small><strong>Good morning, Summit Hearth.</strong></div>
          <div className="launch-console-actions">
            <span><Search size={14} /> Search</span>
            <span className="synced"><i /> Books synced</span>
          </div>
        </div>

        <div className="launch-metrics">
          <ConsoleMetric icon={<CircleDollarSign />} label="Revenue YTD" value="$1.42M" note="+12.4% this year" tone="green" />
          <ConsoleMetric icon={<PackageCheck />} label="Ready projects" value="12" note="3 can schedule now" tone="orange" />
          <ConsoleMetric icon={<CalendarDays />} label="Jobs today" value="18" note="6 techs active" tone="blue" />
        </div>

        <div className="launch-console-workspace">
          <div className="launch-map">
            <div className="launch-panel-heading"><span>Field operations</span><b><i /> Live</b></div>
            <div className="launch-map-image">
              <small className="launch-map-credit">© Mapbox © OpenStreetMap</small>
              <div className="launch-map-callout">
                <small>Next arrival · 18 min</small>
                <strong>42 Apex installation</strong>
                <span><MapPin size={12} /> Springfield, Missouri</span>
              </div>
            </div>
          </div>
          <div className="launch-today">
            <div className="launch-panel-heading"><span>Today</span><b>18 jobs</b></div>
            {[
              ["8:00", "Apex install", "Ready"],
              ["10:30", "Gas service", "En route"],
              ["1:00", "Pellet clean", "Scheduled"],
              ["3:30", "Inspection", "Scheduled"],
            ].map((job, index) => (
              <div className="launch-job" key={job[0]}>
                <span>{job[0]}</span>
                <i className={`tone-${index}`} />
                <div><strong>{job[1]}</strong><small>Assigned team</small></div>
                <em>{job[2]}</em>
              </div>
            ))}
          </div>
        </div>

        <div className="launch-readiness">
          <span><PackageCheck size={16} /></span>
          <div><strong>Tomorrow is protected.</strong><small>All required parts confirmed for the next three installations.</small></div>
          <b>100%</b>
        </div>
      </div>
    </div>
  );
}

function LaunchBrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`launch-brand-mark ${compact ? "compact" : ""}`} aria-hidden="true">
      <Flame size={compact ? 16 : 19} strokeWidth={2.25} />
    </span>
  );
}

function TechFieldStage() {
  const jobs = [
    { time: "8:00 AM", title: "42 Apex installation", customer: "Morgan Residence", status: "Ready", tone: "orange" },
    { time: "11:30 AM", title: "Annual gas service", customer: "Cedar Ridge Home", status: "Scheduled", tone: "blue" },
    { time: "2:00 PM", title: "Pellet stove diagnostic", customer: "Taylor Residence", status: "Scheduled", tone: "green" },
  ];

  return (
    <div className="launch-tech-stage" aria-label="HearthOS technician app previews with fictional demo data">
      <div className="launch-tech-glow" />
      <div className="launch-phone launch-phone-primary">
        <div className="launch-phone-island" />
        <div className="launch-tech-screen">
          <div className="launch-tech-header">
            <div><LaunchBrandMark compact /><span><strong>HearthOS</strong><small>Alex Demo · Field technician</small></span></div>
            <em><i /> GPS live</em>
          </div>
          <div className="launch-shift-card">
            <span><i><Clock3 size={14} /></i><b>Shift in progress</b><small>Clocked in at 7:42 AM</small></span>
            <em>6h 18m</em>
          </div>
          <div className="launch-tech-metrics">
            <span><b>3</b><small>Jobs today</small></span>
            <span><b>1</b><small>Completed</small></span>
            <span><b>2</b><small>Open</small></span>
          </div>
          <div className="launch-tech-section-head"><strong>Today&apos;s route</strong><span>September 1</span></div>
          <div className="launch-tech-jobs">
            {jobs.map((job) => (
              <div className="launch-tech-job" key={job.time}>
                <i className={job.tone} />
                <span><small>{job.time}</small><strong>{job.title}</strong><em>{job.customer}</em></span>
                <b>{job.status}</b>
              </div>
            ))}
          </div>
          <TechMockNav active="Jobs" />
        </div>
      </div>

      <div className="launch-phone launch-phone-secondary">
        <div className="launch-phone-island" />
        <div className="launch-tech-screen launch-job-screen">
          <div className="launch-job-screen-top"><ChevronRight size={16} /><span>Job details</span><em>In progress</em></div>
          <div className="launch-job-hero">
            <small>Installation · Job 10482</small>
            <strong>42 Apex installation</strong>
            <span><MapPin size={12} /> Waynesboro, Pennsylvania</span>
          </div>
          <div className="launch-job-customer">
            <i><UserRound size={16} /></i><span><small>Customer</small><strong>Morgan Residence</strong></span><b>Call</b>
          </div>
          <div className="launch-job-unit">
            <small>Installed unit</small><strong>42 Apex NexGen-Hybrid</strong><span>Wood fireplace · Living room</span>
          </div>
          <div className="launch-job-progress"><span><i className="done"><Check size={11} /></i><b>Arrival and safety</b></span><span><i className="done"><Check size={11} /></i><b>Installation checklist</b></span><span><i><Camera size={11} /></i><b>Job photos</b><em>8 added</em></span></div>
          <div className="launch-photo-strip"><i /><i /><i /><span><Camera size={15} /> Add</span></div>
          <div className="launch-job-actions"><span><FileText size={13} /> Notes</span><span><ReceiptText size={13} /> Invoice</span></div>
          <div className="launch-complete-job"><CheckCircle2 size={14} /> Complete job</div>
        </div>
      </div>
    </div>
  );
}

function TechMockNav({ active }: { active: string }) {
  return (
    <div className="launch-tech-nav">
      {[{ label: "Jobs", icon: Navigation }, { label: "Inbox", icon: FileText }, { label: "Photos", icon: Camera }, { label: "Profile", icon: UserRound }].map(({ label, icon: Icon }) => (
        <span className={label === active ? "active" : ""} key={label}><Icon size={13} /><small>{label}</small></span>
      ))}
    </div>
  );
}

function ConsoleMetric({ icon, label, value, note, tone }: { icon: ReactNode; label: string; value: string; note: string; tone: string }) {
  return (
    <div className={`launch-metric ${tone}`}>
      <span>{icon}</span>
      <div><small>{label}</small><strong>{value}</strong><em>{note}</em></div>
    </div>
  );
}

function UnitRecordStage() {
  return (
    <div className="launch-unit-record" aria-label="Installed fireplace record preview">
      <div className="launch-unit-image">
        <div className="launch-unit-status"><i /> Installed system · Active</div>
        <div className="launch-unit-overlay">
          <small>Living room</small>
          <strong>42 Apex NexGen-Hybrid</strong>
          <span>Wood fireplace · Installed Nov 14, 2025</span>
        </div>
      </div>
      <div className="launch-unit-data">
        <div className="launch-unit-data-head">
          <div><small>Customer record</small><strong>The Reynolds Residence</strong></div>
          <span>Unit ID · HS-20481</span>
        </div>
        <div className="launch-unit-specs">
          <div><small>Serial number</small><strong>TRV-42A-02164</strong></div>
          <div><small>Warranty</small><strong>Registered</strong></div>
          <div><small>Next service</small><strong>Nov 2026</strong></div>
        </div>
        <div className="launch-unit-timeline">
          <span><i><ClipboardCheck size={14} /></i><b>Installation completed</b><small>18 photos · crew checklist</small></span>
          <span><i><FileCheck2 size={14} /></i><b>Warranty registered</b><small>Documents attached</small></span>
          <span><i><CalendarDays size={14} /></i><b>Annual service planned</b><small>Customer reminder ready</small></span>
        </div>
        <div className="launch-unit-actions">
          <span>Photos</span><span>Documents</span><span>Service history</span>
          <button type="button" aria-label="Open unit record"><ArrowRight size={15} /></button>
        </div>
      </div>
    </div>
  );
}
