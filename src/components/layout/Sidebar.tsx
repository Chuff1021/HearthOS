"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, Menu, UserRound, X } from "lucide-react";
import FlameLogo from "@/components/FlameLogo";
import { useAuthenticatedDisplayIdentity, UNKNOWN_DISPLAY_IDENTITY } from "./header-identity";
import { isActivePath, mobileNavItems, navigationGroups, type NavigationItem } from "./navigation-model";

const emptySubscribe = () => () => {};

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const hydrated = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const activePath = hydrated ? pathname : null;
  const navigationId = useId();

  return (
    <>
      <aside className="hearth-sidebar liquid-rail glass-shell" data-collapsed={collapsed} aria-label="HearthOS sidebar">
        <div className="hearth-sidebar-header">
          <div className="hearth-sidebar-logo" aria-hidden="true"><FlameLogo size={28} /></div>
          {!collapsed && (
            <div className="hearth-sidebar-brand">
              <strong>HearthOS</strong>
              <span>Field Service</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="hearth-nav-icon-button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            aria-controls={navigationId}
          >
            {collapsed ? <ChevronRight size={18} aria-hidden="true" /> : <ChevronLeft size={18} aria-hidden="true" />}
          </button>
        </div>
        <nav id={navigationId} className="hearth-sidebar-navigation" aria-label="Main navigation">
          <NavigationGroups pathname={activePath} collapsed={collapsed} />
        </nav>
        <div className="hearth-sidebar-footer">
          {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
            ? <AuthenticatedAccount collapsed={collapsed} />
            : <AccountLink collapsed={collapsed} identity={UNKNOWN_DISPLAY_IDENTITY} />}
        </div>
      </aside>
      <MobileDock pathname={activePath} />
    </>
  );
}

function AuthenticatedAccount({ collapsed }: { collapsed: boolean }) {
  const identity = useAuthenticatedDisplayIdentity();
  return <AccountLink collapsed={collapsed} identity={identity} />;
}

function AccountLink({ collapsed, identity }: {
  collapsed: boolean;
  identity: { name: string; initials: string; isSignedIn: boolean };
}) {
  const name = identity.isSignedIn ? identity.name : "Account";
  return (
    <Link href="/settings" className="hearth-account-link" aria-label={name + ": account settings"} title={collapsed ? name + ": account settings" : undefined}>
      <span className="hearth-account-avatar" aria-hidden="true">{identity.initials || <UserRound size={17} />}</span>
      {!collapsed && <span className="hearth-account-name"><strong>{name}</strong><span>Account settings</span></span>}
    </Link>
  );
}

function NavigationGroups({ pathname, collapsed = false, onNavigate }: {
  pathname: string | null;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return navigationGroups.map((group) => (
    <div key={group.label} className="hearth-nav-group" role="group" aria-label={group.label}>
      {!collapsed && <h2 className="hearth-nav-heading">{group.label}</h2>}
      {group.items.map((item) => (
        <NavigationLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} onNavigate={onNavigate} />
      ))}
    </div>
  ));
}

function NavigationLink({ item, pathname, collapsed, onNavigate }: {
  item: NavigationItem;
  pathname: string | null;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      prefetch={false}
      className="hearth-nav-link"
      data-integration={item.href === "/integrations/quickbooks" || undefined}
      aria-label={item.label}
      aria-current={isActivePath(pathname, item.href) ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      onClick={onNavigate}
    >
      <span className="hearth-nav-link-icon" aria-hidden="true"><Icon size={18} strokeWidth={2} /></span>
      {!collapsed && <span className="hearth-nav-link-label">{item.label}</span>}
    </Link>
  );
}

function MobileDock({ pathname }: { pathname: string | null }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const drawerId = useId();
  const titleId = useId();
  const moreActive = pathname !== null && !mobileNavItems.some((item) => isActivePath(pathname, item.href));

  useEffect(() => {
    dialogRef.current?.close();
  }, [pathname]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => { if (desktop.matches) dialogRef.current?.close(); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  function closeDrawer() {
    dialogRef.current?.close();
  }

  return (
    <>
      <nav className="hearth-mobile-dock" aria-label="Mobile navigation">
        {mobileNavItems.map((item) => (
          <NavigationLink key={item.href} item={item} pathname={pathname} />
        ))}
        <button
          ref={triggerRef}
          type="button"
          className="hearth-nav-link"
          aria-label="More navigation"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={drawerId}
          data-active={moreActive || undefined}
          onClick={() => { dialogRef.current?.showModal(); setOpen(true); }}
        >
          <Menu size={18} aria-hidden="true" />
          <span className="hearth-nav-link-label">More</span>
        </button>
      </nav>
      <dialog
        ref={dialogRef}
        id={drawerId}
        className="hearth-navigation-drawer"
        aria-labelledby={titleId}
        onCancel={closeDrawer}
        onClose={() => {
          setOpen(false);
          if (triggerRef.current?.getClientRects().length) triggerRef.current.focus();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const controls = event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeDrawer();
        }}
      >
        <div className="hearth-drawer-header">
          <h2 id={titleId}>All navigation</h2>
          <button type="button" className="hearth-nav-icon-button" aria-label="Close navigation" title="Close navigation" onClick={closeDrawer}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <nav className="hearth-drawer-navigation" aria-label="All navigation">
          <NavigationGroups pathname={pathname} onNavigate={closeDrawer} />
        </nav>
      </dialog>
    </>
  );
}
