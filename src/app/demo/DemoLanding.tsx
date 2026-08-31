"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  FileCheck2,
  Flame,
  MapPin,
  Menu,
  PackageCheck,
  Search,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import FlameLogo from "@/components/FlameLogo";

const operatingChapters = [
  {
    number: "01",
    icon: <FileCheck2 />,
    title: "Sell the complete system.",
    copy: "Build accurate fireplace packages from the real catalog, then move an approved estimate straight into the work.",
    detail: "Estimates · products · options · approvals",
  },
  {
    number: "02",
    icon: <PackageCheck />,
    title: "Know the project is ready.",
    copy: "See required parts, purchase orders, site readiness, and scheduling in one continuous operating record.",
    detail: "Projects · purchasing · schedule · dispatch",
  },
  {
    number: "03",
    icon: <Wrench />,
    title: "Own the service relationship.",
    copy: "Keep the exact unit, history, manuals, photos, notes, payments, and next service moment connected to the home.",
    detail: "Field service · unit history · lifetime value",
  },
];

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
          <FlameLogo size={36} />
          <strong>HearthOS</strong>
        </Link>

        <nav className="launch-links" aria-label="Marketing navigation">
          <a href="#platform">Platform</a>
          <a href="#difference">Why HearthOS</a>
          <a href="#intelligence">GABE</a>
        </nav>

        <div className="launch-nav-actions">
          <Link href="/sign-in?redirect_url=/account" className="launch-login">Sign in</Link>
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
            <a href="#difference" onClick={() => setMobileOpen(false)}>Why HearthOS</a>
            <a href="#intelligence" onClick={() => setMobileOpen(false)}>GABE</a>
            <Link href="/sign-in?redirect_url=/account" onClick={() => setMobileOpen(false)}>Sign in</Link>
            <a href="#demo-form" className="launch-button" onClick={() => setMobileOpen(false)}>Book a demo</a>
          </div>
        )}
      </header>

      <section className="launch-hero">
        <div className="launch-hero-wash" />
        <div className="launch-hero-copy">
          <div className="launch-eyebrow"><Flame size={14} /> Built exclusively for fireplace dealers</div>
          <h1>HearthOS.</h1>
          <p className="launch-hero-line">The whole business, beautifully connected.</p>
          <p className="launch-hero-support">
            Every sale. Every part. Every project. Every service call.
            One operating system from showroom to field.
          </p>
          <div className="launch-hero-actions">
            <a href="#demo-form" className="launch-button">
              Book your private demo <ArrowRight size={16} />
            </a>
            <a href="#platform" className="launch-secondary">
              See HearthOS <ChevronRight size={16} />
            </a>
          </div>
        </div>

        <div className="launch-hero-signal" aria-label="HearthOS platform summary">
          <span><i /> Live operations</span>
          <span>QuickBooks connected</span>
          <span>Office + field</span>
        </div>
      </section>

      <section className="launch-product" id="platform">
        <div className="launch-heading" data-reveal>
          <span>One calm operating view</span>
          <h2>Nothing to assemble.<br />Nothing to chase.</h2>
          <p>HearthOS turns the work, money, people, projects, and customer history into one shared source of truth.</p>
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
          <span>Designed around the life of the fireplace</span>
          <h2>From first conversation<br />to every fire after.</h2>
        </div>
        <div className="launch-chapters">
          {operatingChapters.map((chapter) => (
            <article key={chapter.number} data-reveal>
              <div className="launch-chapter-top">
                <span>{chapter.number}</span>
                <i>{chapter.icon}</i>
              </div>
              <h3>{chapter.title}</h3>
              <p>{chapter.copy}</p>
              <small>{chapter.detail}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="launch-intelligence" id="intelligence">
        <div className="launch-ai-copy" data-reveal>
          <div className="launch-eyebrow launch-eyebrow-dark"><Sparkles size={14} /> GABE · Gas Appliance and Burner Expert</div>
          <h2>Ask the business.<br />Ask the fireplace.</h2>
          <p>
            GABE connects live operating context with product manuals, diagrams, service history,
            and the records behind the work.
          </p>
          <div className="launch-ai-proof">
            <span><ShieldCheck /> Grounded in your business</span>
            <span><Flame /> Built for hearth products</span>
          </div>
        </div>
        <div data-reveal>
          <GabeStage />
        </div>
      </section>

      <section className="launch-conversion" id="demo-form">
        <div className="launch-conversion-copy" data-reveal>
          <span>Private walkthrough</span>
          <h2>See your dealership<br />inside HearthOS.</h2>
          <p>A focused conversation about the workflows that matter most to your team.</p>
          <div className="launch-demo-points">
            <span><Check /> Built around your operation</span>
            <span><Check /> Clear setup and data answers</span>
            <span><Check /> No generic software tour</span>
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
        <div className="launch-brand"><FlameLogo size={32} /><strong>HearthOS</strong></div>
        <p>The operating system for fireplace dealers.</p>
        <div><Link href="/sign-in?redirect_url=/account">Sign in</Link><a href="#demo-form">Book a demo</a></div>
      </footer>
    </main>
  );
}

function ProductConsole() {
  return (
    <div className="launch-console" aria-label="HearthOS operating dashboard preview">
      <aside className="launch-console-rail">
        <div className="launch-console-logo"><FlameLogo size={29} /><b>HearthOS</b></div>
        {["Overview", "Schedule", "Projects", "Customers", "Inventory"].map((item, index) => (
          <span className={index === 0 ? "active" : ""} key={item}>{item}</span>
        ))}
        <div className="launch-console-user"><i>CH</i><span><b>Colton</b><small>Owner</small></span></div>
      </aside>

      <div className="launch-console-main">
        <div className="launch-console-topbar">
          <div><small>Tuesday, July 21</small><strong>Good morning, Colton.</strong></div>
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

function ConsoleMetric({ icon, label, value, note, tone }: { icon: ReactNode; label: string; value: string; note: string; tone: string }) {
  return (
    <div className={`launch-metric ${tone}`}>
      <span>{icon}</span>
      <div><small>{label}</small><strong>{value}</strong><em>{note}</em></div>
    </div>
  );
}

function GabeStage() {
  return (
    <div className="launch-gabe">
      <div className="launch-gabe-top">
        <span><Bot size={17} /> GABE</span>
        <small>Gas Appliance and Burner Expert</small>
      </div>
      <div className="launch-gabe-thread">
        <div className="launch-gabe-question">
          Which projects need attention before we build next week’s schedule?
        </div>
        <div className="launch-gabe-answer">
          <span><Sparkles size={15} /></span>
          <p>
            Two projects need action. The Hughes install is waiting on venting confirmation from PO 1048.
            The Nelson project is fully received and ready to schedule.
          </p>
        </div>
        <div className="launch-gabe-sources">
          <span>Projects</span><span>Purchase orders</span><span>Schedule</span>
        </div>
      </div>
      <div className="launch-gabe-prompt">
        <span>Ask about the business, a manual, diagram, or part.</span>
        <button type="button" aria-label="Send example question"><ArrowRight size={16} /></button>
      </div>
    </div>
  );
}
