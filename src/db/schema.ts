import { pgTable, uuid, varchar, text, boolean, timestamp, jsonb, integer, decimal, date, time, serial, index, uniqueIndex, pgEnum } from 'drizzle-orm/pg-core';

// Enums
export const userRoleEnum = pgEnum('user_role', ['admin', 'dispatcher', 'technician', 'customer']);
export const jobStatusEnum = pgEnum('job_status', ['scheduled', 'in_progress', 'completed', 'cancelled', 'on_hold']);
export const jobTypeEnum = pgEnum('job_type', ['installation', 'service', 'inspection', 'cleaning', 'repair', 'estimate']);
export const priorityEnum = pgEnum('priority', ['low', 'normal', 'high', 'urgent']);
export const paymentStatusEnum = pgEnum('payment_status', ['pending', 'partial', 'paid', 'overdue']);
export const invoiceStatusEnum = pgEnum('invoice_status', ['draft', 'sent', 'paid', 'void']);
export const estimateStatusEnum = pgEnum('estimate_status', ['draft', 'pending', 'accepted', 'declined', 'expired', 'converted']);
export const purchaseOrderStatusEnum = pgEnum('purchase_order_status', ['open', 'partial', 'closed', 'cancelled']);
export const billStatusEnum = pgEnum('bill_status', ['open', 'partial', 'paid', 'overdue', 'void']);

// Organizations
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  phone: varchar('phone', { length: 20 }),
  email: varchar('email', { length: 255 }),
  address: text('address'),
  logoUrl: text('logo_url'),
  timezone: varchar('timezone', { length: 50 }).default('America/New_York'),
  settings: jsonb('settings').default({}),
  subscriptionTier: varchar('subscription_tier', { length: 50 }).default('starter'),
  // QuickBooks integration
  qbRealmId: varchar('qb_realm_id', { length: 50 }),
  qbAccessToken: text('qb_access_token'),
  qbRefreshToken: text('qb_refresh_token'),
  qbTokenExpiresAt: timestamp('qb_token_expires_at'),
  qbConnected: boolean('qb_connected').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Users
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  phone: varchar('phone', { length: 20 }),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  role: userRoleEnum('role').notNull(),
  avatarUrl: text('avatar_url'),
  passwordHash: text('password_hash'),
  isActive: boolean('is_active').default(true),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  pushToken: text('push_token'),
  preferences: jsonb('preferences').default({}),
  // Technician-specific fields
  techColor: varchar('tech_color', { length: 7 }), // Hex color for dispatch board
  techSkills: jsonb('tech_skills').default([]), // ['gas', 'wood', 'pellet', 'electric']
  isOwner: boolean('is_owner').default(false),
  isSalaried: boolean('is_salaried').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_users_org_id').on(table.orgId),
  roleIdx: index('idx_users_role').on(table.role),
}));

// Customers (linked to QuickBooks)
export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  qbCustomerId: varchar('qb_customer_id', { length: 50 }).unique(), // QuickBooks Customer.Id
  userId: uuid('user_id').references(() => users.id), // Linked portal account (optional)
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  companyName: varchar('company_name', { length: 255 }),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  phoneAlt: varchar('phone_alt', { length: 50 }),
  // Mailing / billing address synced from QuickBooks Customer.BillAddr (falls
  // back to ShipAddr if BillAddr is empty). Stored on the customer rather than
  // the properties table since QB tracks one canonical address per customer.
  addressLine1: text('address_line1'),
  addressLine2: text('address_line2'),
  city: varchar('city', { length: 100 }),
  state: varchar('state', { length: 50 }),
  zip: varchar('zip', { length: 20 }),
  source: varchar('source', { length: 50 }), // referral, google, website, quickbooks
  tags: jsonb('tags').default([]),
  notes: text('notes'),
  isActive: boolean('is_active').default(true),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_customers_org_id').on(table.orgId),
  qbIdx: index('idx_customers_qb_id').on(table.qbCustomerId),
}));

// Properties
export const properties = pgTable('properties', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'cascade' }).notNull(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  nickname: varchar('nickname', { length: 100 }), // "Main House", "Vacation Home"
  address: text('address').notNull(),
  city: varchar('city', { length: 100 }).notNull(),
  state: varchar('state', { length: 2 }).notNull(),
  zip: varchar('zip', { length: 10 }).notNull(),
  lat: decimal('lat', { precision: 10, scale: 7 }),
  lng: decimal('lng', { precision: 10, scale: 7 }),
  accessNotes: text('access_notes'), // Gate code, dog, key location
  isPrimary: boolean('is_primary').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  customerIdx: index('idx_properties_customer_id').on(table.customerId),
  orgIdx: index('idx_properties_org_id').on(table.orgId),
}));

// Fireplace Units
export const fireplaceUnits = pgTable('fireplace_units', {
  id: uuid('id').primaryKey().defaultRandom(),
  propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'cascade' }).notNull(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  nickname: varchar('nickname', { length: 100 }), // "Living Room", "Master Bedroom"
  brand: varchar('brand', { length: 100 }).notNull(),
  model: varchar('model', { length: 100 }),
  serialNumber: varchar('serial_number', { length: 100 }),
  fuelType: varchar('fuel_type', { length: 50 }), // gas, wood, pellet, electric, propane
  installDate: date('install_date'),
  lastServiceDate: date('last_service_date'),
  nextServiceDate: date('next_service_date'),
  warrantyExpires: date('warranty_expires'),
  location: varchar('location', { length: 100 }), // "Living Room - North Wall"
  notes: text('notes'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  propertyIdx: index('idx_fireplace_units_property_id').on(table.propertyId),
  orgIdx: index('idx_fireplace_units_org_id').on(table.orgId),
}));

// Manuals Library
export const manuals = pgTable('manuals', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  brand: varchar('brand', { length: 100 }).notNull(),
  model: varchar('model', { length: 100 }).notNull(),
  type: varchar('type', { length: 100 }),
  category: varchar('category', { length: 100 }),
  url: text('url').notNull(),
  pages: integer('pages'),
  source: varchar('source', { length: 50 }).default('url'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_manuals_org_id').on(table.orgId),
  brandIdx: index('idx_manuals_brand').on(table.brand),
  modelIdx: index('idx_manuals_model').on(table.model),
  categoryIdx: index('idx_manuals_category').on(table.category),
}));

// Manual Sections (for citations/page references)
export const manualSections = pgTable('manual_sections', {
  id: uuid('id').primaryKey().defaultRandom(),
  manualId: uuid('manual_id').references(() => manuals.id, { onDelete: 'cascade' }).notNull(),
  pageStart: integer('page_start').notNull(),
  pageEnd: integer('page_end'),
  title: varchar('title', { length: 255 }),
  snippet: text('snippet').notNull(),
  tags: jsonb('tags').default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  manualIdx: index('idx_manual_sections_manual_id').on(table.manualId),
  pageIdx: index('idx_manual_sections_page').on(table.pageStart),
}));

export const fireplaceManualRegistry = pgTable('fireplace_manual_registry', {
  manualId: text('manual_id').primaryKey(),
  manufacturer: text('manufacturer'),
  brand: text('brand'),
  model: text('model'),
  normalizedModel: text('normalized_model'),
  family: text('family'),
  size: text('size'),
  fuelType: text('fuel_type'),
  applianceType: text('appliance_type'),
  manualType: text('manual_type'),
  language: text('language'),
  revision: text('revision'),
  publicationDate: date('publication_date'),
  sourceUrl: text('source_url'),
  localFilePath: text('local_file_path'),
  checksum: text('checksum'),
  aliases: jsonb('aliases').default([]),
  chunkCollection: text('chunk_collection'),
  chunkNamespace: text('chunk_namespace'),
  supersedesManualId: text('supersedes_manual_id'),
  supersededByManualId: text('superseded_by_manual_id'),
  status: text('status').default('active').notNull(),
  metadataConfidence: decimal('metadata_confidence', { precision: 4, scale: 3 }).default('0').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  mfgModelTypeIdx: index('idx_fmr_mfg_model_type').on(table.manufacturer, table.normalizedModel, table.manualType),
  familySizeIdx: index('idx_fmr_family_size').on(table.family, table.size),
  statusUpdatedIdx: index('idx_fmr_status_updated').on(table.status, table.updatedAt),
}));

// Jobs
export const jobs = pgTable('jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  customerId: uuid('customer_id').references(() => customers.id).notNull(),
  propertyId: uuid('property_id').references(() => properties.id),
  fireplaceUnitId: uuid('fireplace_unit_id').references(() => fireplaceUnits.id),
  jobNumber: varchar('job_number', { length: 20 }).notNull(), // JOB-2024-0001
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  jobType: jobTypeEnum('job_type').notNull(),
  status: jobStatusEnum('status').default('scheduled'),
  priority: priorityEnum('priority').default('normal'),
  scheduledDate: date('scheduled_date'),
  scheduledTimeStart: time('scheduled_time_start'),
  scheduledTimeEnd: time('scheduled_time_end'),
  estimatedDuration: integer('estimated_duration'), // minutes
  actualDuration: integer('actual_duration'), // minutes
  completedAt: timestamp('completed_at', { withTimezone: true }),
  totalAmount: decimal('total_amount', { precision: 10, scale: 2 }).default('0'),
  invoiceId: uuid('invoice_id'), // Reference to invoice created
  qbInvoiceId: varchar('qb_invoice_id', { length: 50 }), // QuickBooks Invoice.Id
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_jobs_org_id').on(table.orgId),
  customerIdx: index('idx_jobs_customer_id').on(table.customerId),
  statusIdx: index('idx_jobs_status').on(table.status),
  dateIdx: index('idx_jobs_scheduled_date').on(table.scheduledDate),
}));

// Job Assignments (technicians assigned to jobs)
export const jobAssignments = pgTable('job_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'cascade' }).notNull(),
  technicianId: uuid('technician_id').references(() => users.id).notNull(),
  isLead: boolean('is_lead').default(false),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow(),
  notes: text('notes'),
}, (table) => ({
  jobIdx: index('idx_job_assignments_job_id').on(table.jobId),
  techIdx: index('idx_job_assignments_technician_id').on(table.technicianId),
}));

// Checklist Templates
export const checklistTemplates = pgTable('checklist_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  jobType: jobTypeEnum('job_type'),
  items: jsonb('items').notNull(), // [{ order, title, required, photoRequired }]
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Job Checklists
export const jobChecklists = pgTable('job_checklists', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'cascade' }).notNull(),
  templateId: uuid('template_id').references(() => checklistTemplates.id),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  completedBy: uuid('completed_by').references(() => users.id),
}, (table) => ({
  jobIdx: index('idx_job_checklists_job_id').on(table.jobId),
}));

// Job Checklist Items
export const jobChecklistItems = pgTable('job_checklist_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  checklistId: uuid('checklist_id').references(() => jobChecklists.id, { onDelete: 'cascade' }).notNull(),
  order: integer('order').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  isCompleted: boolean('is_completed').default(false),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  notes: text('notes'),
  photoUrl: text('photo_url'),
}, (table) => ({
  checklistIdx: index('idx_job_checklist_items_checklist_id').on(table.checklistId),
}));

// Job Photos
export const jobPhotos = pgTable('job_photos', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'cascade' }).notNull(),
  uploadedBy: uuid('uploaded_by').references(() => users.id).notNull(),
  url: text('url').notNull(),
  caption: varchar('caption', { length: 255 }),
  photoType: varchar('photo_type', { length: 50 }), // before, after, issue, completion
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  jobIdx: index('idx_job_photos_job_id').on(table.jobId),
}));

// Job Signatures
export const jobSignatures = pgTable('job_signatures', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'cascade' }).notNull(),
  signerName: varchar('signer_name', { length: 100 }).notNull(),
  signerRole: varchar('signer_role', { length: 50 }), // customer, technician
  signatureUrl: text('signature_url').notNull(),
  signedAt: timestamp('signed_at', { withTimezone: true }).defaultNow(),
});

// Job Notes
export const jobNotes = pgTable('job_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'cascade' }).notNull(),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  content: text('content').notNull(),
  isInternal: boolean('is_internal').default(false), // Hidden from customer
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  jobIdx: index('idx_job_notes_job_id').on(table.jobId),
}));

// Invoices
export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  jobId: uuid('job_id').references(() => jobs.id),
  customerId: uuid('customer_id').references(() => customers.id).notNull(),
  invoiceNumber: varchar('invoice_number', { length: 20 }).notNull(), // INV-2024-0001
  qbInvoiceId: varchar('qb_invoice_id', { length: 50 }).unique(), // QuickBooks Invoice.Id
  status: invoiceStatusEnum('status').default('draft'),
  issueDate: date('issue_date').notNull(),
  dueDate: date('due_date'),
  subtotal: decimal('subtotal', { precision: 10, scale: 2 }).notNull(),
  taxAmount: decimal('tax_amount', { precision: 10, scale: 2 }).default('0'),
  totalAmount: decimal('total_amount', { precision: 10, scale: 2 }).notNull(),
  balance: decimal('balance', { precision: 10, scale: 2 }).notNull(),
  notes: text('notes'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_invoices_org_id').on(table.orgId),
  customerIdx: index('idx_invoices_customer_id').on(table.customerId),
  jobIdx: index('idx_invoices_job_id').on(table.jobId),
  statusIdx: index('idx_invoices_status').on(table.status),
}));

// Invoice Line Items
export const invoiceLineItems = pgTable('invoice_line_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'cascade' }).notNull(),
  qbItemId: varchar('qb_item_id', { length: 50 }), // QuickBooks Item.Id
  description: text('description').notNull(),
  quantity: decimal('quantity', { precision: 10, scale: 2 }).notNull(),
  unitPrice: decimal('unit_price', { precision: 10, scale: 2 }).notNull(),
  total: decimal('total', { precision: 10, scale: 2 }).notNull(),
  order: integer('order').notNull(),
}, (table) => ({
  invoiceIdx: index('idx_invoice_line_items_invoice_id').on(table.invoiceId),
}));

// Payments
export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  invoiceId: uuid('invoice_id').references(() => invoices.id).notNull(),
  qbPaymentId: varchar('qb_payment_id', { length: 50 }), // QuickBooks Payment.Id
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  paymentMethod: varchar('payment_method', { length: 50 }), // cash, check, credit_card, ach
  checkNumber: varchar('check_number', { length: 50 }),
  transactionId: varchar('transaction_id', { length: 100 }),
  paidAt: timestamp('paid_at', { withTimezone: true }).defaultNow(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_payments_org_id').on(table.orgId),
  invoiceIdx: index('idx_payments_invoice_id').on(table.invoiceId),
  qbInvoiceUnique: uniqueIndex('payments_qb_payment_invoice_unique').on(table.qbPaymentId, table.invoiceId),
}));

// Service Plans (recurring service contracts)
export const servicePlans = pgTable('service_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  customerId: uuid('customer_id').references(() => customers.id).notNull(),
  fireplaceUnitId: uuid('fireplace_unit_id').references(() => fireplaceUnits.id),
  name: varchar('name', { length: 100 }).notNull(),
  frequency: varchar('frequency', { length: 20 }).notNull(), // annual, semi_annual, quarterly
  nextServiceDate: date('next_service_date'),
  price: decimal('price', { precision: 10, scale: 2 }),
  isActive: boolean('is_active').default(true),
  startDate: date('start_date'),
  endDate: date('end_date'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  customerIdx: index('idx_service_plans_customer_id').on(table.customerId),
}));

// Inventory Items
export const inventoryItems = pgTable('inventory_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  qbItemId: varchar('qb_item_id', { length: 50 }).unique(), // QuickBooks Item.Id
  name: varchar('name', { length: 255 }).notNull(),
  sku: varchar('sku', { length: 100 }),
  description: text('description'),
  category: varchar('category', { length: 100 }), // pipe, fittings, parts, supplies
  unitPrice: decimal('unit_price', { precision: 10, scale: 2 }),
  cost: decimal('cost', { precision: 10, scale: 2 }),
  // Set when cost is saved manually (price audit apply or single-item PATCH).
  // QuickBooks sync skips updating cost when this is non-null, so manual
  // corrections aren't silently overwritten by Item.PurchaseCost.
  costOverriddenAt: timestamp('cost_overridden_at', { withTimezone: true }),
  quantityOnHand: integer('quantity_on_hand').default(0),
  reorderLevel: integer('reorder_level'),
  location: varchar('location', { length: 100 }), // Warehouse bin location
  isActive: boolean('is_active').default(true),
  isTracked: boolean('is_tracked').default(true).notNull(), // local "is this part of my actual inventory" flag
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_inventory_items_org_id').on(table.orgId),
  qbIdx: index('idx_inventory_items_qb_id').on(table.qbItemId),
  trackedIdx: index('idx_inventory_items_tracked').on(table.isTracked),
}));

// Vendors (linked to QuickBooks)
export const vendors = pgTable('vendors', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  qbVendorId: varchar('qb_vendor_id', { length: 50 }).unique(), // QuickBooks Vendor.Id
  displayName: varchar('display_name', { length: 255 }).notNull(),
  companyName: varchar('company_name', { length: 255 }),
  firstName: varchar('first_name', { length: 100 }),
  lastName: varchar('last_name', { length: 100 }),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  phoneAlt: varchar('phone_alt', { length: 50 }),
  website: varchar('website', { length: 255 }),
  addressLine1: text('address_line1'),
  addressLine2: text('address_line2'),
  city: varchar('city', { length: 100 }),
  state: varchar('state', { length: 50 }),
  zip: varchar('zip', { length: 20 }),
  accountNumber: varchar('account_number', { length: 255 }),
  taxId: varchar('tax_id', { length: 100 }),
  is1099: boolean('is_1099').default(false),
  paymentTerms: varchar('payment_terms', { length: 255 }),
  category: varchar('category', { length: 100 }), // supplier, contractor, utility, etc.
  notes: text('notes'),
  balance: decimal('balance', { precision: 12, scale: 2 }).default('0'),
  isActive: boolean('is_active').default(true),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_vendors_org_id').on(table.orgId),
  qbIdx: index('idx_vendors_qb_id').on(table.qbVendorId),
  nameIdx: index('idx_vendors_display_name').on(table.displayName),
}));

// Estimates (proposals to customers; can be converted to invoices)
export const estimates = pgTable('estimates', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  customerId: uuid('customer_id').references(() => customers.id),
  jobId: uuid('job_id').references(() => jobs.id),
  qbEstimateId: varchar('qb_estimate_id', { length: 50 }).unique(),
  estimateNumber: varchar('estimate_number', { length: 30 }),
  status: estimateStatusEnum('status').default('pending'),
  issueDate: date('issue_date'),
  expirationDate: date('expiration_date'),
  acceptedDate: date('accepted_date'),
  subtotal: decimal('subtotal', { precision: 12, scale: 2 }).default('0'),
  taxAmount: decimal('tax_amount', { precision: 12, scale: 2 }).default('0'),
  totalAmount: decimal('total_amount', { precision: 12, scale: 2 }).default('0'),
  customerMemo: text('customer_memo'),
  privateNote: text('private_note'),
  convertedInvoiceId: uuid('converted_invoice_id'),
  emailStatus: varchar('email_status', { length: 50 }),
  billEmail: varchar('bill_email', { length: 255 }),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_estimates_org_id').on(table.orgId),
  customerIdx: index('idx_estimates_customer_id').on(table.customerId),
  qbIdx: index('idx_estimates_qb_id').on(table.qbEstimateId),
  statusIdx: index('idx_estimates_status').on(table.status),
}));

export const estimateLineItems = pgTable('estimate_line_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  estimateId: uuid('estimate_id').references(() => estimates.id, { onDelete: 'cascade' }).notNull(),
  qbItemId: varchar('qb_item_id', { length: 50 }),
  description: text('description'),
  quantity: decimal('quantity', { precision: 12, scale: 4 }).default('1'),
  unitPrice: decimal('unit_price', { precision: 12, scale: 4 }).default('0'),
  total: decimal('total', { precision: 12, scale: 2 }).default('0'),
  order: integer('order').default(0),
}, (table) => ({
  estimateIdx: index('idx_estimate_line_items_estimate_id').on(table.estimateId),
}));

// Purchase Orders (orders TO vendors)
export const purchaseOrders = pgTable('purchase_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  vendorId: uuid('vendor_id').references(() => vendors.id),
  qbPurchaseOrderId: varchar('qb_purchase_order_id', { length: 50 }).unique(),
  poNumber: varchar('po_number', { length: 30 }),
  status: purchaseOrderStatusEnum('status').default('open'),
  issueDate: date('issue_date'),
  expectedDate: date('expected_date'),
  receivedDate: date('received_date'),
  subtotal: decimal('subtotal', { precision: 12, scale: 2 }).default('0'),
  taxAmount: decimal('tax_amount', { precision: 12, scale: 2 }).default('0'),
  totalAmount: decimal('total_amount', { precision: 12, scale: 2 }).default('0'),
  shipAddress: text('ship_address'),
  vendorMessage: text('vendor_message'),
  privateNote: text('private_note'),
  emailStatus: varchar('email_status', { length: 50 }),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_purchase_orders_org_id').on(table.orgId),
  vendorIdx: index('idx_purchase_orders_vendor_id').on(table.vendorId),
  qbIdx: index('idx_purchase_orders_qb_id').on(table.qbPurchaseOrderId),
  statusIdx: index('idx_purchase_orders_status').on(table.status),
}));

export const purchaseOrderLineItems = pgTable('purchase_order_line_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id, { onDelete: 'cascade' }).notNull(),
  qbItemId: varchar('qb_item_id', { length: 50 }),
  qbAccountId: varchar('qb_account_id', { length: 50 }),
  description: text('description'),
  quantity: decimal('quantity', { precision: 12, scale: 4 }).default('1'),
  unitCost: decimal('unit_cost', { precision: 12, scale: 4 }).default('0'),
  total: decimal('total', { precision: 12, scale: 2 }).default('0'),
  receivedQty: decimal('received_qty', { precision: 12, scale: 4 }).default('0'),
  order: integer('order').default(0),
}, (table) => ({
  poIdx: index('idx_po_line_items_po_id').on(table.purchaseOrderId),
}));

// Bills (vendor bills / accounts payable)
export const bills = pgTable('bills', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  vendorId: uuid('vendor_id').references(() => vendors.id),
  qbBillId: varchar('qb_bill_id', { length: 50 }).unique(),
  billNumber: varchar('bill_number', { length: 30 }),
  status: billStatusEnum('status').default('open'),
  issueDate: date('issue_date'),
  dueDate: date('due_date'),
  subtotal: decimal('subtotal', { precision: 12, scale: 2 }).default('0'),
  taxAmount: decimal('tax_amount', { precision: 12, scale: 2 }).default('0'),
  totalAmount: decimal('total_amount', { precision: 12, scale: 2 }).default('0'),
  balance: decimal('balance', { precision: 12, scale: 2 }).default('0'),
  privateNote: text('private_note'),
  paymentTerms: varchar('payment_terms', { length: 100 }),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_bills_org_id').on(table.orgId),
  vendorIdx: index('idx_bills_vendor_id').on(table.vendorId),
  qbIdx: index('idx_bills_qb_id').on(table.qbBillId),
  statusIdx: index('idx_bills_status').on(table.status),
}));

export const billLineItems = pgTable('bill_line_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  billId: uuid('bill_id').references(() => bills.id, { onDelete: 'cascade' }).notNull(),
  qbItemId: varchar('qb_item_id', { length: 50 }),
  qbAccountId: varchar('qb_account_id', { length: 50 }),
  description: text('description'),
  quantity: decimal('quantity', { precision: 12, scale: 4 }).default('1'),
  unitCost: decimal('unit_cost', { precision: 12, scale: 4 }).default('0'),
  amount: decimal('amount', { precision: 12, scale: 2 }).default('0'),
  billable: boolean('billable').default(false),
  customerId: uuid('customer_id').references(() => customers.id),
  order: integer('order').default(0),
}, (table) => ({
  billIdx: index('idx_bill_line_items_bill_id').on(table.billId),
}));

// Audit Logs
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id),
  action: varchar('action', { length: 100 }).notNull(), // create, update, delete
  entityType: varchar('entity_type', { length: 100 }).notNull(), // job, invoice, customer
  entityId: uuid('entity_id'),
  oldValue: jsonb('old_value'),
  newValue: jsonb('new_value'),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_audit_logs_org_id').on(table.orgId),
  entityIdx: index('idx_audit_logs_entity').on(table.entityType, table.entityId),
}));

// QuickBooks Sync Status
export const qbSyncStatus = pgTable('qb_sync_status', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  syncType: varchar('sync_type', { length: 50 }).notNull(), // customers, items, invoices, payments
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  status: varchar('status', { length: 20 }).notNull(), // idle, syncing, error
  recordsProcessed: integer('records_processed').default(0),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_qb_sync_status_org_id').on(table.orgId),
  typeIdx: uniqueIndex('idx_qb_sync_status_org_type').on(table.orgId, table.syncType),
}));

export const fireplaceTechnicalFacts = pgTable('fireplace_technical_facts', {
  factId: text('fact_id').primaryKey(),
  manualId: text('manual_id').notNull(),
  manufacturer: text('manufacturer'),
  model: text('model'),
  normalizedModel: text('normalized_model'),
  family: text('family'),
  size: text('size'),
  manualType: text('manual_type'),
  factType: text('fact_type').notNull(),
  factSubtype: text('fact_subtype'),
  valueJson: jsonb('value_json').default({}).notNull(),
  units: text('units'),
  pageNumber: integer('page_number'),
  sourceUrl: text('source_url'),
  evidenceExcerpt: text('evidence_excerpt'),
  confidence: decimal('confidence', { precision: 4, scale: 3 }).default('0').notNull(),
  revision: text('revision'),
  sourceKind: text('source_kind').default('prose').notNull(),
  extractionConfidenceTier: text('extraction_confidence_tier').default('weak_pattern_match'),
  sourceAuthority: text('source_authority').default('unknown'),
  precedenceRank: integer('precedence_rank').default(0),
  supersededFactIds: jsonb('superseded_fact_ids').default([]),
  headingScope: text('heading_scope'),
  provenanceDetail: text('provenance_detail').default('prose'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  manualFactIdx: index('idx_ftf_manual').on(table.manualId, table.factType),
  modelFactIdx: index('idx_ftf_model').on(table.normalizedModel, table.factType),
  pageIdx: index('idx_ftf_page').on(table.pageNumber),
}));

export const fireplaceExplodedPartsGraph = pgTable('fireplace_exploded_parts_graph', {
  calloutId: text('callout_id').primaryKey(),
  manualId: text('manual_id').notNull(),
  model: text('model'),
  normalizedModel: text('normalized_model'),
  family: text('family'),
  size: text('size'),
  figurePageNumber: integer('figure_page_number'),
  figureCaption: text('figure_caption'),
  diagramType: text('diagram_type'),
  calloutLabel: text('callout_label'),
  partNumber: text('part_number'),
  partName: text('part_name'),
  compatibilityScope: text('compatibility_scope'),
  sourceConfidence: decimal('source_confidence', { precision: 4, scale: 3 }).default('0').notNull(),
  sourceMode: text('source_mode').default('native_text').notNull(),
  ocrConfidence: decimal('ocr_confidence', { precision: 4, scale: 3 }),
  sourceUrl: text('source_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  manualModelIdx: index('idx_fepg_manual_model').on(table.manualId, table.normalizedModel),
  partIdx: index('idx_fepg_part').on(table.partNumber, table.partName),
}));

// Type exports for TypeScript
export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;
export type FireplaceUnit = typeof fireplaceUnits.$inferSelect;
export type NewFireplaceUnit = typeof fireplaceUnits.$inferInsert;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type JobAssignment = typeof jobAssignments.$inferSelect;
export type NewJobAssignment = typeof jobAssignments.$inferInsert;
export type ChecklistTemplate = typeof checklistTemplates.$inferSelect;
export type NewChecklistTemplate = typeof checklistTemplates.$inferInsert;
export type JobChecklist = typeof jobChecklists.$inferSelect;
export type NewJobChecklist = typeof jobChecklists.$inferInsert;
export type JobChecklistItem = typeof jobChecklistItems.$inferSelect;
export type NewJobChecklistItem = typeof jobChecklistItems.$inferInsert;
export type JobPhoto = typeof jobPhotos.$inferSelect;
export type NewJobPhoto = typeof jobPhotos.$inferInsert;
export type JobSignature = typeof jobSignatures.$inferSelect;
export type NewJobSignature = typeof jobSignatures.$inferInsert;
export type JobNote = typeof jobNotes.$inferSelect;
export type NewJobNote = typeof jobNotes.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type InvoiceLineItem = typeof invoiceLineItems.$inferSelect;
export type NewInvoiceLineItem = typeof invoiceLineItems.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type ServicePlan = typeof servicePlans.$inferSelect;
export type NewServicePlan = typeof servicePlans.$inferInsert;
export type InventoryItem = typeof inventoryItems.$inferSelect;
export type NewInventoryItem = typeof inventoryItems.$inferInsert;
export type Vendor = typeof vendors.$inferSelect;
export type NewVendor = typeof vendors.$inferInsert;
export type Estimate = typeof estimates.$inferSelect;
export type NewEstimate = typeof estimates.$inferInsert;
export type EstimateLineItem = typeof estimateLineItems.$inferSelect;
export type NewEstimateLineItem = typeof estimateLineItems.$inferInsert;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type NewPurchaseOrder = typeof purchaseOrders.$inferInsert;
export type PurchaseOrderLineItem = typeof purchaseOrderLineItems.$inferSelect;
export type NewPurchaseOrderLineItem = typeof purchaseOrderLineItems.$inferInsert;
export type Bill = typeof bills.$inferSelect;
export type NewBill = typeof bills.$inferInsert;
export type BillLineItem = typeof billLineItems.$inferSelect;
export type NewBillLineItem = typeof billLineItems.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type QBSyncStatus = typeof qbSyncStatus.$inferSelect;
export type NewQBSyncStatus = typeof qbSyncStatus.$inferInsert;
export const gabeSourceRegistry = pgTable('gabe_source_registry', {
  sourceId: text('source_id').primaryKey(),
  sourceType: text('source_type').notNull(),
  manufacturer: text('manufacturer'),
  publisher: text('publisher'),
  title: text('title').notNull(),
  model: text('model'),
  family: text('family'),
  size: text('size'),
  documentKind: text('document_kind'),
  revision: text('revision'),
  publicationDate: date('publication_date'),
  effectiveDate: date('effective_date'),
  jurisdictionScope: text('jurisdiction_scope'),
  sourceUrl: text('source_url').notNull(),
  checksum: text('checksum'),
  ingestStatus: text('ingest_status').default('discovered').notNull(),
  confidence: decimal('confidence', { precision: 4, scale: 3 }).default('0').notNull(),
  supersedesSourceId: text('supersedes_source_id'),
  supersededBySourceId: text('superseded_by_source_id'),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  nextRecheckAt: timestamp('next_recheck_at', { withTimezone: true }),
  activationStatus: text('activation_status').default('pending_review').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  typeStatusIdx: index('idx_gsr_type_status').on(table.sourceType, table.ingestStatus, table.activationStatus),
  modelFamilyIdx: index('idx_gsr_model_family').on(table.manufacturer, table.model, table.family),
  recheckIdx: index('idx_gsr_recheck').on(table.nextRecheckAt),
}));

export const gabeSourceReviewQueue = pgTable('gabe_source_review_queue', {
  queueId: text('queue_id').primaryKey(),
  sourceId: text('source_id').notNull(),
  reason: text('reason').notNull(),
  severity: text('severity').default('medium').notNull(),
  status: text('status').default('open').notNull(),
  assignedTo: text('assigned_to'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  statusIdx: index('idx_gsrq_status').on(table.status, table.severity),
}));

export const gabeJurisdictionRegistry = pgTable('gabe_jurisdiction_registry', {
  jurisdictionId: text('jurisdiction_id').primaryKey(),
  country: text('country'),
  state: text('state'),
  county: text('county'),
  city: text('city'),
  serviceArea: text('service_area'),
  adoptedCodeFamily: text('adopted_code_family'),
  adoptedCodeEdition: text('adopted_code_edition'),
  effectiveDate: date('effective_date'),
  referenceSourceId: text('reference_source_id'),
  confidence: decimal('confidence', { precision: 4, scale: 3 }).default('0').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  lookupIdx: index('idx_gjr_lookup').on(table.country, table.state, table.county, table.city),
}));

export type FireplaceTechnicalFact = typeof fireplaceTechnicalFacts.$inferSelect;
export type NewFireplaceTechnicalFact = typeof fireplaceTechnicalFacts.$inferInsert;
export type FireplaceExplodedPart = typeof fireplaceExplodedPartsGraph.$inferSelect;
export type NewFireplaceExplodedPart = typeof fireplaceExplodedPartsGraph.$inferInsert;
export type GabeSourceRegistry = typeof gabeSourceRegistry.$inferSelect;
export type NewGabeSourceRegistry = typeof gabeSourceRegistry.$inferInsert;
export type GabeSourceReviewQueue = typeof gabeSourceReviewQueue.$inferSelect;
export type NewGabeSourceReviewQueue = typeof gabeSourceReviewQueue.$inferInsert;
export const gabeSourceWorkerJobs = pgTable('gabe_source_worker_jobs', {
  jobId: text('job_id').primaryKey(),
  sourceId: text('source_id').notNull(),
  jobType: text('job_type').notNull(),
  status: text('status').default('queued').notNull(),
  attempts: integer('attempts').default(0).notNull(),
  maxAttempts: integer('max_attempts').default(5).notNull(),
  lastError: text('last_error'),
  nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
  payload: jsonb('payload').default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  statusRetryIdx: index('idx_gswj_status_retry').on(table.status, table.nextRetryAt, table.updatedAt),
}));

export const gabeSourceChecksumSnapshots = pgTable('gabe_source_checksum_snapshots', {
  snapshotId: text('snapshot_id').primaryKey(),
  sourceId: text('source_id').notNull(),
  checksum: text('checksum'),
  metadataHash: text('metadata_hash'),
  observedAt: timestamp('observed_at', { withTimezone: true }).defaultNow().notNull(),
  changedBinary: boolean('changed_binary').default(false).notNull(),
  changedMetadata: boolean('changed_metadata').default(false).notNull(),
  revisionHint: text('revision_hint'),
  notes: text('notes'),
}, (table) => ({
  sourceObservedIdx: index('idx_gscs_source_observed').on(table.sourceId, table.observedAt),
}));

export const gabeSourceSupersessionEdges = pgTable('gabe_source_supersession_edges', {
  edgeId: text('edge_id').primaryKey(),
  fromSourceId: text('from_source_id').notNull(),
  toSourceId: text('to_source_id').notNull(),
  relation: text('relation').default('supersedes').notNull(),
  confidence: decimal('confidence', { precision: 4, scale: 3 }).default('0').notNull(),
  status: text('status').default('proposed').notNull(),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  fromToIdx: index('idx_gsse_from_to').on(table.fromSourceId, table.toSourceId, table.status),
}));

export const gabeSourceActivationAudit = pgTable('gabe_source_activation_audit', {
  eventId: text('event_id').primaryKey(),
  sourceId: text('source_id').notNull(),
  eventType: text('event_type').notNull(),
  actor: text('actor'),
  action: text('action'),
  reason: text('reason'),
  details: jsonb('details').default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  sourceCreatedIdx: index('idx_gsaa_source_created').on(table.sourceId, table.createdAt),
}));

export type GabeJurisdictionRegistry = typeof gabeJurisdictionRegistry.$inferSelect;
export type NewGabeJurisdictionRegistry = typeof gabeJurisdictionRegistry.$inferInsert;
export type GabeSourceWorkerJob = typeof gabeSourceWorkerJobs.$inferSelect;
export type NewGabeSourceWorkerJob = typeof gabeSourceWorkerJobs.$inferInsert;
export type GabeSourceChecksumSnapshot = typeof gabeSourceChecksumSnapshots.$inferSelect;
export type NewGabeSourceChecksumSnapshot = typeof gabeSourceChecksumSnapshots.$inferInsert;
export type GabeSourceSupersessionEdge = typeof gabeSourceSupersessionEdges.$inferSelect;
export type NewGabeSourceSupersessionEdge = typeof gabeSourceSupersessionEdges.$inferInsert;
export const gabeSourceDeadLetterJobs = pgTable('gabe_source_dead_letter_jobs', {
  dlqId: text('dlq_id').primaryKey(),
  jobId: text('job_id').notNull(),
  sourceId: text('source_id').notNull(),
  reason: text('reason'),
  payload: jsonb('payload').default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  createdIdx: index('idx_gsdl_created').on(table.createdAt),
}));

export const gabeSourceDiffSummaries = pgTable('gabe_source_diff_summaries', {
  diffId: text('diff_id').primaryKey(),
  sourceId: text('source_id').notNull(),
  snapshotFromId: text('snapshot_from_id'),
  snapshotToId: text('snapshot_to_id'),
  summaryJson: jsonb('summary_json').default({}).notNull(),
  summaryText: text('summary_text'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  sourceCreatedIdx: index('idx_gsds_source_created').on(table.sourceId, table.createdAt),
}));

export const gabeSourceSignedActions = pgTable('gabe_source_signed_actions', {
  signedActionId: text('signed_action_id').primaryKey(),
  sourceId: text('source_id').notNull(),
  actor: text('actor').notNull(),
  actorRole: text('actor_role').notNull(),
  action: text('action').notNull(),
  payloadHash: text('payload_hash').notNull(),
  signature: text('signature').notNull(),
  verified: boolean('verified').default(false).notNull(),
  details: jsonb('details').default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  sourceCreatedIdx: index('idx_gssa_source_created').on(table.sourceId, table.createdAt),
}));

export type GabeSourceActivationAudit = typeof gabeSourceActivationAudit.$inferSelect;
export type NewGabeSourceActivationAudit = typeof gabeSourceActivationAudit.$inferInsert;
export type GabeSourceDeadLetterJob = typeof gabeSourceDeadLetterJobs.$inferSelect;
export type NewGabeSourceDeadLetterJob = typeof gabeSourceDeadLetterJobs.$inferInsert;
export type GabeSourceDiffSummary = typeof gabeSourceDiffSummaries.$inferSelect;
export type NewGabeSourceDiffSummary = typeof gabeSourceDiffSummaries.$inferInsert;
export const gabeFeedbackEvents = pgTable('gabe_feedback_events', {
  feedbackId: text('feedback_id').primaryKey(),
  question: text('question').notNull(),
  answerExcerpt: text('answer_excerpt'),
  manufacturer: text('manufacturer'),
  model: text('model'),
  intent: text('intent'),
  confidence: decimal('confidence', { precision: 4, scale: 3 }),
  outcome: text('outcome'),
  adminNotes: text('admin_notes'),
  promoteToRegression: boolean('promote_to_regression').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  outcomeCreatedIdx: index('idx_gfe_outcome_created').on(table.outcome, table.createdAt),
}));

export const gabeEvalRuns = pgTable('gabe_eval_runs', {
  runId: text('run_id').primaryKey(),
  suiteName: text('suite_name').notNull(),
  scorecardJson: jsonb('scorecard_json').default({}).notNull(),
  totalCases: integer('total_cases').default(0).notNull(),
  passedCases: integer('passed_cases').default(0).notNull(),
  environmentProfile: text('environment_profile'),
  gitCommitSha: text('git_commit_sha'),
  aggregateMetrics: jsonb('aggregate_metrics').default({}).notNull(),
  perCategoryMetrics: jsonb('per_category_metrics').default({}).notNull(),
  regressionFailures: integer('regression_failures').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  suiteCreatedIdx: index('idx_ger_suite_created').on(table.suiteName, table.createdAt),
}));

export const gabeEvalCaseResults = pgTable('gabe_eval_case_results', {
  resultId: text('result_id').primaryKey(),
  evalRunId: text('eval_run_id').notNull(),
  caseId: text('case_id').notNull(),
  query: text('query').notNull(),
  actualResponseMetadata: jsonb('actual_response_metadata').default({}).notNull(),
  pass: boolean('pass').default(false).notNull(),
  failureReasons: jsonb('failure_reasons').default([]).notNull(),
  citationPageOk: boolean('citation_page_ok'),
  validatorResult: text('validator_result'),
  answerStatus: text('answer_status'),
  runtimeDurationMs: integer('runtime_duration_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  runCaseIdx: index('idx_gecr_run_case').on(table.evalRunId, table.caseId),
}));

export type GabeSourceSignedAction = typeof gabeSourceSignedActions.$inferSelect;
export type NewGabeSourceSignedAction = typeof gabeSourceSignedActions.$inferInsert;
export type GabeFeedbackEvent = typeof gabeFeedbackEvents.$inferSelect;
export type NewGabeFeedbackEvent = typeof gabeFeedbackEvents.$inferInsert;
export type GabeEvalRun = typeof gabeEvalRuns.$inferSelect;
export type NewGabeEvalRun = typeof gabeEvalRuns.$inferInsert;
export type GabeEvalCaseResult = typeof gabeEvalCaseResults.$inferSelect;
export type NewGabeEvalCaseResult = typeof gabeEvalCaseResults.$inferInsert;

// Time-off requests submitted from the tech app, approved/denied by admin.
// Postgres-backed (was previously a JSON file, which doesn't persist across
// Vercel lambda invocations — tech submissions never reached the admin view).
export const timeOffRequests = pgTable('time_off_requests', {
  id: text('id').primaryKey(),
  techId: text('tech_id').notNull(),
  techName: text('tech_name'),
  type: varchar('type', { length: 50 }).notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  reason: text('reason'),
  status: varchar('status', { length: 20 }).default('pending').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  statusIdx: index('idx_time_off_requests_status').on(table.status),
  techIdx: index('idx_time_off_requests_tech_id').on(table.techId),
  createdIdx: index('idx_time_off_requests_created').on(table.createdAt),
}));
export type TimeOffRequest = typeof timeOffRequests.$inferSelect;
export type NewTimeOffRequest = typeof timeOffRequests.$inferInsert;
