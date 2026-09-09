export default function OperationsStyles() {
  return <style>{`
    /* Every selector is scoped to owned page content, never the shared shell. */
    .ops-production {
      --color-bg: #f3f6f8;
      --color-surface: #fff;
      --color-surface-1: #fff;
      --color-surface-2: #f5f7fa;
      --color-surface-3: #eef2f6;
      --color-surface-4: #e8edf2;
      --color-border: #dce3eb;
      --color-border-hover: #aebccb;
      --color-text-primary: #1d2938;
      --color-text-secondary: #405167;
      --color-text-muted: #5c6b7f;
      --color-ember: #b4420a;
      --color-ember-dark: #963700;
      --color-ember-light: #ef601b;
      --color-success: #13795d;
      --color-warning: #a34c0c;
      --color-danger: #b42341;
      --color-info: #2867b9;
      --ops-action: #b4420a;
      --ops-action-hover: #963700;
      --ops-orange-bg: #fff0e6;
      --ops-orange-border: #efc7ae;
      --ops-green-bg: #eaf6ef;
      --ops-green-border: #c6e3d5;
      --ops-blue-bg: #edf3fc;
      --ops-blue-border: #ccdcf1;
      --ops-red-bg: #fceef1;
      --ops-red-border: #edcbd3;
      color: var(--color-text-primary);
      color-scheme: light;
      font-family: var(--font-geist-sans), Arial, sans-serif;
      background: var(--color-bg);
      min-width: 0;
      letter-spacing: 0;
    }
    [data-theme="dark"] .ops-production {
      --color-bg: #181818;
      --color-surface: #202020;
      --color-surface-1: #202020;
      --color-surface-2: #272727;
      --color-surface-3: #303030;
      --color-surface-4: #383838;
      --color-border: #3d4147;
      --color-border-hover: #697583;
      --color-text-primary: #edf1f5;
      --color-text-secondary: #c2cbd5;
      --color-text-muted: #a3afbc;
      --color-ember: #ffae79;
      --color-ember-dark: #ffc49e;
      --color-success: #83d7b4;
      --color-warning: #efbc7d;
      --color-danger: #ff9fb1;
      --color-info: #99c3ff;
      --ops-orange-bg: #392a21;
      --ops-orange-border: #74513a;
      --ops-green-bg: #20372e;
      --ops-green-border: #3d6857;
      --ops-blue-bg: #243247;
      --ops-blue-border: #425c7c;
      --ops-red-bg: #3e272e;
      --ops-red-border: #744451;
      color-scheme: dark;
    }
    .ops-production *, .ops-production *::before, .ops-production *::after {
      letter-spacing: 0;
    }
    main.ops-production::before { content: none !important; }
    .ops-production h1 { font-size: 24px; line-height: 1.3; font-weight: 650; overflow-wrap: anywhere; }
    .ops-production h2 { line-height: 1.4; overflow-wrap: anywhere; }
    .ops-production :is(h3, p, label) { overflow-wrap: anywhere; }
    .ops-production :is(button, a, input, select, textarea):focus-visible {
      outline: 2px solid var(--color-ember);
      outline-offset: 3px;
    }
    .ops-production :is(input:not([type="checkbox"]):not([type="radio"]), select, textarea) {
      min-width: 0;
      max-width: 100%;
      border-radius: 6px;
      background: var(--color-surface-1);
      font-family: inherit;
    }
    .ops-production :is(input:not([type="checkbox"]):not([type="radio"]), select) { min-height: 40px; }
    .ops-production input::placeholder, .ops-production textarea::placeholder { color: var(--color-text-muted); opacity: 1; }
    .ops-production input[type="checkbox"] { accent-color: var(--color-ember); }
    .ops-production button:disabled { cursor: not-allowed; }
    .ops-production button svg, .ops-production a svg { flex-shrink: 0; }
    .ops-production :is(.rounded-lg, .rounded-xl, .rounded-2xl) { border-radius: 6px; }
    /* Defeat legacy global white-border overrides only inside these pages. */
    .ops-production :is(.rounded-lg, .rounded-xl, .rounded-2xl)[style*="--color-border"] {
      border-color: var(--color-border) !important;
    }
    .ops-production table { border-collapse: collapse; font-variant-numeric: tabular-nums; }
    .ops-production thead { background: var(--color-surface-2); }
    .ops-production :is(th, td) { border-color: var(--color-border) !important; }
    .ops-production th { font-size: 11px; font-weight: 600; }
    .ops-production tbody tr:hover { background: var(--color-surface-2); }
    .ops-production .ops-primary {
      background: var(--ops-action);
      color: #fff;
      border: 1px solid var(--ops-action);
      border-radius: 6px;
      min-height: 40px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .ops-production .ops-primary:hover:not(:disabled) { background: var(--ops-action-hover); }
    .ops-production .ops-primary:disabled { opacity: 0.55; }
    .ops-production .ops-icon-button {
      width: 36px;
      height: 36px;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--color-border);
      border-radius: 6px;
      background: var(--color-surface-1);
      color: var(--color-text-secondary);
    }
    .ops-production .ops-icon-button:hover { background: var(--color-surface-2); }
    .ops-production .ops-metrics { background: var(--color-surface-1); gap: 0; border-block: 1px solid var(--color-border); }
    .ops-production .ops-metric { min-width: 0; padding: 14px 16px; border-right: 1px solid var(--color-border); }
    .ops-production .ops-metric:last-child { border-right: 0; }
    .ops-production .ops-metric > :first-child { font-size: 12px; font-weight: 500; text-transform: none; }
    .ops-production .ops-metric > :nth-child(2) { font-size: 23px; font-weight: 650; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
    .ops-production .ops-filter {
      border-radius: 5px;
      min-height: 40px;
      background: var(--color-surface-1);
      color: var(--color-text-secondary);
      border: 1px solid var(--color-border);
    }
    .ops-production .ops-filter[aria-pressed="true"] { background: var(--ops-orange-bg); color: var(--color-ember); border-color: var(--ops-orange-border); }
    .ops-production .ops-directory-table { border-radius: 6px; }
    .ops-production .ops-directory-table td { padding-block: 15px; }
    .ops-production .ops-customer-hero { padding: 20px 0; border-block: 1px solid var(--color-border); }
    .ops-production .ops-customer-hero a { overflow-wrap: anywhere; min-width: 0; }
    .ops-production .ops-customer-hero > div > div:first-child { max-width: 100%; }
    .ops-production .ops-profile-tabs { overflow-x: auto; }
    .ops-production .ops-profile-tabs button { flex-shrink: 0; white-space: nowrap; }
    .ops-production .ops-profile-table { min-width: 650px; }
    .ops-production .ops-profile-content { padding-bottom: calc(6rem + env(safe-area-inset-bottom)); }
    .ops-production.ops-workspace { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
    .ops-production .ops-toolbar { flex-shrink: 0; background: var(--color-surface-1); }
    .ops-production .ops-toolbar > div { min-width: 0; }
    .ops-production .ops-heading { flex-wrap: wrap; gap: 12px; }
    .ops-production .ops-heading > div:first-child { flex: 1; }
    .ops-production .ops-job-list { padding-bottom: calc(6rem + env(safe-area-inset-bottom)); }
    .ops-production .ops-job-row { background: var(--color-surface-1); transition: border-color 120ms, background 120ms; }
    .ops-production .ops-job-row:hover { border-color: var(--color-border-hover); background: var(--color-surface-2); }
    .ops-production .ops-job-row h3 { font-size: 15px; }
    .ops-production .ops-job-filters input { flex-basis: 260px; }
    .ops-production .ops-job-tabs button { min-height: 40px; }
    .ops-production .ops-job-tabs button[aria-pressed="true"] { color: var(--color-ember); border-bottom-color: var(--color-ember); }
    .ops-production .ops-modal { border-radius: 8px; background: var(--color-surface-1); box-shadow: 0 16px 60px #1d293826; }
    .ops-production .ops-modal :is(input, select, textarea) { background: var(--color-surface-1) !important; }
    .ops-production .ops-modal-heading { flex-wrap: wrap; gap: 12px; }
    .ops-production .ops-modal-heading > div { min-width: 0; }
    .ops-production .ops-modal-heading > div:first-child { flex: 1; }
    .ops-production .ops-modal-heading h2 { overflow-wrap: anywhere; }
    .ops-production .ops-modal-heading > div:last-child { flex-shrink: 0; }
    .ops-production .ops-project-heading { padding-block: 4px; }
    .ops-production .ops-project-metric { background: var(--color-surface-1); border: 0; border-right: 1px solid var(--color-border); border-radius: 0; }
    .ops-production .ops-project-sources { min-width: 0; padding: 16px 0; border-top: 1px solid var(--color-border); }
    .ops-production .ops-source-tabs { background: var(--color-surface-3); border: 1px solid var(--color-border); border-radius: 6px; }
    .ops-production .ops-source-tabs button { border-radius: 4px; }
    .ops-production .ops-source-tabs button[aria-pressed="true"] { background: var(--color-surface-1); color: var(--color-ember); box-shadow: 0 1px 3px #1d293812; }
    .ops-production .ops-source-button { border: 1px solid var(--color-border); background: var(--color-surface-1); }
    .ops-production .ops-source-button:hover:not(:disabled) { border-color: var(--color-border-hover); }
    .ops-production .ops-source-button[data-imported="true"] { background: var(--ops-green-bg); border-color: var(--ops-green-border); }
    .ops-production .ops-source-button strong { white-space: normal; overflow-wrap: anywhere; }
    .ops-production .ops-project-column { min-width: 0; padding: 12px 0; border-top: 2px solid #c9d4df; }
    .ops-production .ops-project-column[data-stage="parts_needed"] { border-top-color: #bc6e24; }
    .ops-production .ops-project-column[data-stage="parts_ordered"] { border-top-color: #2867b9; }
    .ops-production .ops-project-column[data-stage="ready"], .ops-production .ops-project-column[data-stage="complete"] { border-top-color: #13795d; }
    .ops-production .ops-project-column[data-stage="scheduled"] { border-top-color: #32828b; }
    .ops-production .ops-project-card { background: var(--color-surface-1); border: 1px solid var(--color-border); border-radius: 6px; box-shadow: none; }
    .ops-production .ops-project-card:hover { border-color: var(--color-border-hover); }
    .ops-production .ops-project-card[aria-pressed="true"] { border-color: #ce8b64; }
    .ops-production .ops-project-card > div:first-child { flex-wrap: wrap; gap: 6px; }
    .ops-production .ops-project-card > div:first-child > div { max-width: 100%; overflow-wrap: anywhere; }
    .ops-production .ops-project-card > div:first-child > div:last-child { font-variant-numeric: tabular-nums; }
    .ops-production .ops-project-badge { border-radius: 4px; font-size: 11px; line-height: 1.4; max-width: 100%; overflow-wrap: anywhere; }
    .ops-production .ops-parts-list { background: var(--color-surface-1); border-block: 1px solid var(--color-border); }
    .ops-production .ops-parts-list > div { border-bottom: 1px solid var(--color-border); border-radius: 0; }
    .ops-production .ops-parts-list > div:last-child { border-bottom: 0; }
    .ops-production .ops-project-scheduling { padding-block: 16px; border-block: 1px solid var(--color-border); }
    .ops-production .ops-schedule-controls { border-radius: 6px; padding: 3px; background: var(--color-surface-2); }
    .ops-production .ops-schedule-controls button { min-height: 32px; border-radius: 4px; color: var(--color-text-secondary); background: transparent; }
    .ops-production .ops-schedule-controls button[aria-pressed="true"] { background: var(--color-surface-1); color: var(--color-ember); box-shadow: 0 1px 3px #1d293819; }
    .ops-production .ops-schedule-scroll { background: var(--color-surface-1); padding-bottom: calc(6rem + env(safe-area-inset-bottom)); }
    .ops-production .ops-week-heading { background: var(--color-surface-2); }
    .ops-production .ops-calendar-event { border-radius: 5px; background: var(--color-surface-1); }
    .ops-production .ops-calendar-event:hover { box-shadow: 0 2px 6px #1d293822; }
    .ops-production .ops-calendar-event:focus-within { outline: 2px solid var(--color-ember); outline-offset: 1px; z-index: 15; }
    .ops-production .ops-event-content { padding: 5px 6px; gap: 1px; }
    .ops-production .ops-event-open { min-width: 0; padding-right: 20px; flex-shrink: 0; }
    .ops-production .ops-event-customer { line-height: 15px; flex-shrink: 0; }
    .ops-production .ops-event-title { line-height: 14px; flex-shrink: 0; }
    .ops-production .ops-calendar-event[data-short="true"] .ops-event-content { padding-block: 2px; gap: 0; }
    .ops-production .ops-calendar-event[data-short="true"] .ops-event-open { line-height: 15px; }
    .ops-production .ops-event-tech {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      min-width: 0;
      padding: 2px 4px;
      border: 1px solid var(--color-border);
      border-radius: 3px;
      background: var(--color-surface-2);
      color: var(--color-text-secondary);
      font-size: 10px;
      line-height: 14px;
    }
    .ops-production .ops-event-tech > i { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
    .ops-production .ops-event-remove { background: var(--color-surface-1); }
    .ops-production .ops-event-remove:hover { color: var(--color-danger); }
    .ops-production .ops-month-event { display: flex; flex-direction: column; align-items: stretch; gap: 1px; padding: 4px 6px; border-radius: 3px; background: var(--color-surface-3); font-size: 11px; line-height: 15px; }
    .ops-production .ops-month-event > span:first-child { white-space: nowrap; }
    .ops-production .ops-month-event > span:last-child { white-space: normal; overflow-wrap: anywhere; }
    .ops-production .ops-agenda-event { padding-inline: 12px; margin-block: 8px; border: 1px solid var(--color-border); border-radius: 6px; background: var(--color-surface-1); }
    .ops-production .ops-tech-filter { min-height: 32px; }
    @media (min-width: 1024px) {
      .ops-production :is(.ops-job-list, .ops-schedule-scroll, .ops-profile-content) { padding-bottom: 24px; }
    }
    @media (max-width: 639px) {
      .ops-production :is(input:not([type="checkbox"]):not([type="radio"]), select, textarea) { font-size: 16px; }
      .ops-production .ops-metric { padding: 12px; }
      .ops-production .ops-metric:nth-child(2n) { border-right: 0; }
      .ops-production .ops-metric:nth-child(n+3) { border-top: 1px solid var(--color-border); }
      .ops-production .ops-metric > :nth-child(2) { font-size: 20px; }
      .ops-production .ops-heading, .ops-production .ops-job-filters, .ops-production .ops-job-tabs { padding-inline: 16px; }
      .ops-production .ops-job-list { padding-inline: 16px; }
      .ops-production .ops-job-filters input { flex-basis: 100%; }
      .ops-production .ops-job-filters select { flex: 1 1 130px; }
      .ops-production .ops-profile-content { padding-inline: 16px; }
      .ops-production .ops-customer-hero { padding-block: 16px; }
      .ops-production .ops-customer-hero h1 { font-size: 22px; }
      .ops-production .ops-schedule-controls { flex-wrap: wrap; }
    }
  `}</style>;
}
