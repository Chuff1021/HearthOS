import {
  BarChart3, Boxes, BriefcaseBusiness, CalendarDays, CircleDollarSign,
  ClipboardCheck, CreditCard, FileText, Gauge, Inbox, MapPinned, NotebookTabs,
  PackageCheck, PlugZap, Receipt, Settings, Sparkles, Users, UserRoundCog,
  type LucideIcon,
} from "lucide-react";

export type NavigationItem = { label: string; href: string; icon: LucideIcon };

export const navigationGroups: { label: string; items: NavigationItem[] }[] = [
  { label: "Main", items: [
    { label: "Dashboard", href: "/", icon: Gauge },
    { label: "To-Do List", href: "/todos", icon: ClipboardCheck },
    { label: "Schedule", href: "/schedule", icon: CalendarDays },
    { label: "Projects", href: "/projects", icon: BriefcaseBusiness },
    { label: "Meeks Portal", href: "/meeks", icon: CalendarDays },
    { label: "Jobs", href: "/jobs", icon: BriefcaseBusiness },
    { label: "Customers", href: "/customers", icon: Users },
    { label: "Website Inbox", href: "/website-inbox", icon: Inbox },
    { label: "Service Map", href: "/service-map", icon: MapPinned },
    { label: "Dispatch Map", href: "/dispatch", icon: MapPinned },
  ] },
  { label: "Billing", items: [
    { label: "Invoices", href: "/invoices", icon: Receipt },
    { label: "Payments", href: "/payments", icon: CreditCard },
    { label: "Expenses", href: "/expenses", icon: CircleDollarSign },
    { label: "Estimates", href: "/estimates", icon: FileText },
    { label: "Purchase Orders", href: "/purchase-orders", icon: PackageCheck },
  ] },
  { label: "Operations", items: [
    { label: "Inventory", href: "/inventory", icon: Boxes },
    { label: "Vendors", href: "/vendors", icon: NotebookTabs },
    { label: "Reports", href: "/reports", icon: BarChart3 },
    { label: "GABE", href: "/gabe", icon: Sparkles },
  ] },
  { label: "Admin", items: [
    { label: "Team", href: "/team", icon: UserRoundCog },
    { label: "GABE Audit", href: "/admin/gabe-audit", icon: ClipboardCheck },
    { label: "Time Admin", href: "/admin/time", icon: CalendarDays },
    { label: "Settings", href: "/settings", icon: Settings },
  ] },
  { label: "Integrations", items: [
    { label: "QuickBooks", href: "/integrations/quickbooks", icon: PlugZap },
  ] },
];

export const mobileNavItems: NavigationItem[] = [
  { label: "Home", href: "/", icon: Gauge },
  { label: "Schedule", href: "/schedule", icon: CalendarDays },
  { label: "Jobs", href: "/jobs", icon: BriefcaseBusiness },
  { label: "Customers", href: "/customers", icon: Users },
];

export function isActivePath(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}
