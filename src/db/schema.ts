import { pgTable, uuid, varchar, text, boolean, timestamp, jsonb, integer, decimal, date, time, serial, index, uniqueIndex, pgEnum } from 'drizzle-orm/pg-core';

// Enums
export const userRoleEnum = pgEnum('user_role', ['admin', 'dispatcher', 'technician', 'customer']);
export const jobStatusEnum = pgEnum('job_status', ['scheduled', 'in_progress', 'completed', 'cancelled', 'on_hold']);
export const jobTypeEnum = pgEnum('job_type', ['installation', 'service', 'inspection', 'cleaning', 'repair', 'estimate']);
export const priorityEnum = pgEnum('priority', ['low', 'normal', 'high', 'urgent']);
export const paymentStatusEnum = pgEnum('payment_status', ['pending', 'partial', 'paid', 'overdue']);
export const invoiceStatusEnum = pgEnum('invoice_status', ['draft', 'sent', 'paid', 'void']);
export const todoPriorityEnum = pgEnum('todo_priority', ['low', 'medium', 'high', 'urgent']);
export const todoStatusEnum = pgEnum('todo_status', ['pending', 'in_progress', 'completed', 'cancelled']);

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
  phone: varchar('phone', { length: 20 }),
  phoneAlt: varchar('phone_alt', { length: 20 }),
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
  qbItemId: varchar('qb_item_id', { length: 50 }), // QuickBooks Item.Id
  name: varchar('name', { length: 255 }).notNull(),
  sku: varchar('sku', { length: 100 }),
  description: text('description'),
  category: varchar('category', { length: 100 }), // pipe, fittings, parts, supplies
  unitPrice: decimal('unit_price', { precision: 10, scale: 2 }),
  cost: decimal('cost', { precision: 10, scale: 2 }),
  quantityOnHand: integer('quantity_on_hand').default(0),
  reorderLevel: integer('reorder_level'),
  location: varchar('location', { length: 100 }), // Warehouse bin location
  isActive: boolean('is_active').default(true),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_inventory_items_org_id').on(table.orgId),
  qbIdx: index('idx_inventory_items_qb_id').on(table.qbItemId),
}));

// Todos
export const todos = pgTable('todos', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  priority: todoPriorityEnum('priority').default('medium').notNull(),
  status: todoStatusEnum('status').default('pending').notNull(),
  dueDate: date('due_date'),
  relatedJobId: varchar('related_job_id', { length: 100 }),
  relatedJobNumber: varchar('related_job_number', { length: 100 }),
  relatedCustomerId: varchar('related_customer_id', { length: 100 }),
  relatedCustomerName: varchar('related_customer_name', { length: 255 }),
  assignedTo: varchar('assigned_to', { length: 255 }),
  assignedToName: varchar('assigned_to_name', { length: 255 }),
  createdBy: varchar('created_by', { length: 255 }).notNull(),
  createdByName: varchar('created_by_name', { length: 255 }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  tags: jsonb('tags').$type<string[]>().default([]).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  orgIdx: index('idx_todos_org_id').on(table.orgId),
  statusIdx: index('idx_todos_status').on(table.status),
  priorityIdx: index('idx_todos_priority').on(table.priority),
  dueDateIdx: index('idx_todos_due_date').on(table.dueDate),
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
export type Todo = typeof todos.$inferSelect;
export type NewTodo = typeof todos.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type QBSyncStatus = typeof qbSyncStatus.$inferSelect;
export type NewQBSyncStatus = typeof qbSyncStatus.$inferInsert;
