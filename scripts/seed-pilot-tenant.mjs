import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
const confirmation = process.env.HEARTHOS_PILOT_SEED_CONFIRM;
const requestedSlug = process.argv[2];

if (!databaseUrl) throw new Error("DATABASE_URL is required.");
if (confirmation !== "hearthos-staging") {
  throw new Error("Refusing to seed without HEARTHOS_PILOT_SEED_CONFIRM=hearthos-staging.");
}
if (!requestedSlug || requestedSlug === "default") {
  throw new Error("Pass the non-default pilot organization slug as the first argument.");
}

const sql = postgres(databaseUrl, { max: 1, prepare: false, ssl: "require" });

const ids = {
  users: [
    "72000000-0000-4000-8000-000000000001",
    "72000000-0000-4000-8000-000000000002",
    "72000000-0000-4000-8000-000000000003",
    "72000000-0000-4000-8000-000000000004",
  ],
  customers: [
    "72100000-0000-4000-8000-000000000001",
    "72100000-0000-4000-8000-000000000002",
    "72100000-0000-4000-8000-000000000003",
    "72100000-0000-4000-8000-000000000004",
    "72100000-0000-4000-8000-000000000005",
    "72100000-0000-4000-8000-000000000006",
  ],
  properties: [
    "72200000-0000-4000-8000-000000000001",
    "72200000-0000-4000-8000-000000000002",
    "72200000-0000-4000-8000-000000000003",
    "72200000-0000-4000-8000-000000000004",
    "72200000-0000-4000-8000-000000000005",
    "72200000-0000-4000-8000-000000000006",
  ],
  units: [
    "72300000-0000-4000-8000-000000000001",
    "72300000-0000-4000-8000-000000000002",
    "72300000-0000-4000-8000-000000000003",
    "72300000-0000-4000-8000-000000000004",
    "72300000-0000-4000-8000-000000000005",
    "72300000-0000-4000-8000-000000000006",
  ],
  jobs: [
    "72400000-0000-4000-8000-000000000001",
    "72400000-0000-4000-8000-000000000002",
    "72400000-0000-4000-8000-000000000003",
    "72400000-0000-4000-8000-000000000004",
    "72400000-0000-4000-8000-000000000005",
    "72400000-0000-4000-8000-000000000006",
  ],
  inventory: [
    "72500000-0000-4000-8000-000000000001",
    "72500000-0000-4000-8000-000000000002",
    "72500000-0000-4000-8000-000000000003",
    "72500000-0000-4000-8000-000000000004",
    "72500000-0000-4000-8000-000000000005",
    "72500000-0000-4000-8000-000000000006",
  ],
  vendors: [
    "72600000-0000-4000-8000-000000000001",
    "72600000-0000-4000-8000-000000000002",
  ],
  estimates: [
    "72700000-0000-4000-8000-000000000001",
    "72700000-0000-4000-8000-000000000002",
  ],
  invoices: [
    "72800000-0000-4000-8000-000000000001",
    "72800000-0000-4000-8000-000000000002",
    "72800000-0000-4000-8000-000000000003",
  ],
};

function isoDate(offsetDays = 0) {
  const value = new Date();
  value.setUTCHours(12, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

function isoTimestamp(offsetDays = 0, hour = 12) {
  const value = new Date();
  value.setUTCHours(hour, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value.toISOString();
}

const people = [
  ["Avery", "Demo", "avery.demo@hearthos.test", "admin", true, "#ef6c35"],
  ["Morgan", "Demo", "morgan.demo@hearthos.test", "dispatcher", false, "#64748b"],
  ["Caleb", "Demo", "caleb.demo@hearthos.test", "technician", false, "#2563eb"],
  ["Jordan", "Demo", "jordan.demo@hearthos.test", "technician", false, "#16a34a"],
];

const customerRows = [
  ["Mason", "Demo", "mason.demo@example.test", "717-555-0101", "101 Hearthstone Lane", "Waynesboro", "PA", "17268", "referral", ["fireplace", "installation"]],
  ["Riley", "Demo", "riley.demo@example.test", "717-555-0102", "214 Summit View Drive", "Waynesboro", "PA", "17268", "website", ["service-plan", "gas"]],
  ["Cameron", "Demo", "cameron.demo@example.test", "301-555-0103", "38 North Valley Court", "Hagerstown", "MD", "21740", "showroom", ["wood", "estimate"]],
  ["Taylor", "Demo", "taylor.demo@example.test", "717-555-0104", "77 Orchard Ridge Road", "Greencastle", "PA", "17225", "google", ["pellet", "service"]],
  ["Parker", "Demo", "parker.demo@example.test", "301-555-0105", "412 Market Spring Way", "Smithsburg", "MD", "21783", "referral", ["gas", "repair"]],
  ["Reese", "Demo", "reese.demo@example.test", "717-555-0106", "19 Blue Ridge Terrace", "Mont Alto", "PA", "17237", "website", ["outdoor-living", "installation"]],
];

const coordinates = [
  ["39.7559200", "-77.5777700"],
  ["39.7490500", "-77.5894200"],
  ["39.6418700", "-77.7200000"],
  ["39.7904600", "-77.7277700"],
  ["39.6542600", "-77.5741600"],
  ["39.8414800", "-77.5594300"],
];

const unitRows = [
  ["Napoleon", "Elevation X 42", "gas", "Living Room"],
  ["Quadra-Fire", "Expedition II", "wood", "Family Room"],
  ["Quadra-Fire", "Trekker", "pellet", "Den"],
  ["Napoleon", "Ascent Deep 42", "gas", "Great Room"],
  ["Napoleon", "Oakville X3", "gas", "Living Room"],
  ["Napoleon", "Galaxy 48", "gas", "Outdoor Patio"],
];

const inventoryRows = [
  ["LTR-NAP-ELEV42", "Napoleon Elevation X 42", "Direct vent gas fireplace", "Fireplaces", "5899.00", "3815.00", 2, 1, "Showroom A"],
  ["LTR-QF-EXP2", "Quadra-Fire Expedition II", "Wood insert with cast surround", "Inserts", "4895.00", "3190.00", 1, 1, "Showroom B"],
  ["LTR-QF-TREK", "Quadra-Fire Trekker", "Pellet stove package", "Stoves", "5299.00", "3440.00", 2, 1, "Showroom B"],
  ["LTR-NAP-OAKX3", "Napoleon Oakville X3", "Direct vent gas insert", "Inserts", "4499.00", "2925.00", 3, 1, "Warehouse A1"],
  ["LTR-SVC-GAS", "Annual Gas Fireplace Service", "Inspection, cleaning, and safety test", "Service", "249.00", "78.00", 0, 0, "Service"],
  ["LTR-SVC-CHIM", "Level 1 Chimney Inspection", "Visual inspection and condition report", "Service", "189.00", "55.00", 0, 0, "Service"],
];

const jobSpecs = [
  [0, "LT-2601", "Elevation X 42 Installation", "installation", "scheduled", "high", 1, "08:00", "13:00", 5899, [2, 3]],
  [1, "LT-2602", "Annual Gas Fireplace Service", "service", "scheduled", "normal", 1, "13:30", "15:00", 249, [2]],
  [2, "LT-2603", "Wood Insert Consultation", "estimate", "scheduled", "normal", 2, "09:00", "10:30", 0, [3]],
  [3, "LT-2604", "Pellet Stove Diagnostic", "repair", "in_progress", "urgent", 0, "14:00", "16:00", 389, [2]],
  [4, "LT-2599", "Gas Insert Ignition Repair", "repair", "completed", "normal", -2, "10:00", "12:00", 465, [3]],
  [5, "LT-2598", "Outdoor Fireplace Installation", "installation", "completed", "normal", -8, "08:00", "15:00", 8490, [2, 3]],
];

function customerPayload(index) {
  const [firstName, lastName, email, phone, line1, city, state, zip, source, tags] = customerRows[index];
  const revenue = [5899, 249, 0, 389, 465, 8490][index];
  return {
    id: ids.customers[index],
    displayName: `${firstName} ${lastName}`,
    firstName,
    lastName,
    email,
    phone,
    address: { line1, city, state, zip },
    balance: index === 0 ? 5899 : index === 3 ? 389 : 0,
    active: true,
    tags,
    totalJobs: 1,
    totalRevenue: revenue,
    notes: `Synthetic LT Rush pilot record. Source: ${source}.`,
    createdAt: isoTimestamp(-45 - index),
    updatedAt: isoTimestamp(-index),
  };
}

function coreInvoice(index, customerIndex, status, amount, balance, title) {
  return {
    id: ids.invoices[index],
    invoiceNumber: `LTR-INV-${2601 + index}`,
    customerId: ids.customers[customerIndex],
    customerName: `${customerRows[customerIndex][0]} ${customerRows[customerIndex][1]}`,
    jobNumber: jobSpecs[customerIndex][1],
    jobTitle: title,
    issueDate: isoDate(-7 - index),
    dueDate: isoDate(23 - index),
    status,
    subtotal: amount,
    taxRate: 0,
    taxAmount: 0,
    totalAmount: amount,
    balance,
    lineItems: [{
      id: `72900000-0000-4000-8000-00000000000${index + 1}`,
      description: title,
      qty: 1,
      unitPrice: amount,
      total: amount,
    }],
    notes: "Synthetic pilot invoice for demonstration only.",
    createdAt: isoTimestamp(-7 - index),
    updatedAt: isoTimestamp(-index),
  };
}

await sql.begin(async (tx) => {
  const [org] = await tx`
    select id, name, slug, settings
    from organizations
    where slug = ${requestedSlug}
    limit 1
  `;
  if (!org) throw new Error(`Organization not found: ${requestedSlug}`);
  if (org.slug === "default") throw new Error("Refusing to seed Aaron's organization.");

  const settings = {
    ...(org.settings && typeof org.settings === "object" ? org.settings : {}),
    brandPrimary: "#9c3d2b",
    brandSecondary: "#27352d",
    company: {
      name: "L.T. Rush Stone Inc",
      phone: "717-765-6941",
      website: "https://www.ltrushstone.com",
      address: "4493 Buchanan Trail E, Waynesboro, PA 17268",
      demoData: true,
    },
    scheduling: { dayStart: "08:00", dayEnd: "17:00", defaultDuration: "120" },
  };
  await tx`
    update organizations set
      name = 'L.T. Rush Stone Inc',
      phone = '717-765-6941',
      address = '4493 Buchanan Trail E, Waynesboro, PA 17268',
      timezone = 'America/New_York',
      subscription_tier = 'pilot',
      onboarding_status = 'active',
      settings = ${JSON.stringify(settings)}::jsonb,
      updated_at = now()
    where id = ${org.id}
  `;

  for (let index = 0; index < people.length; index += 1) {
    const [firstName, lastName, email, role, isOwner, color] = people[index];
    await tx`
      insert into users (id, org_id, email, phone, first_name, last_name, role, is_active, is_owner, tech_color, tech_skills)
      values (${ids.users[index]}, ${org.id}, ${email}, '717-555-0199', ${firstName}, ${lastName}, ${role}, true, ${isOwner}, ${color}, ${JSON.stringify(["gas", "wood", "pellet"])}::jsonb)
      on conflict (id) do update set
        org_id = excluded.org_id, email = excluded.email, first_name = excluded.first_name,
        last_name = excluded.last_name, role = excluded.role, is_active = true,
        is_owner = excluded.is_owner, tech_color = excluded.tech_color, updated_at = now()
    `;
  }

  for (let index = 0; index < customerRows.length; index += 1) {
    const [firstName, lastName, email, phone, line1, city, state, zip, source, tags] = customerRows[index];
    await tx`
      insert into customers (id, org_id, qb_customer_id, first_name, last_name, email, phone, address_line1, city, state, zip, source, tags, notes, is_active)
      values (${ids.customers[index]}, ${org.id}, ${`DEMO-LTR-C${index + 1}`}, ${firstName}, ${lastName}, ${email}, ${phone}, ${line1}, ${city}, ${state}, ${zip}, ${source}, ${JSON.stringify(tags)}::jsonb, 'Synthetic LT Rush pilot record.', true)
      on conflict (id) do update set
        org_id = excluded.org_id, first_name = excluded.first_name, last_name = excluded.last_name,
        email = excluded.email, phone = excluded.phone, address_line1 = excluded.address_line1,
        city = excluded.city, state = excluded.state, zip = excluded.zip, tags = excluded.tags,
        notes = excluded.notes, is_active = true, updated_at = now()
    `;
    await tx`
      insert into properties (id, customer_id, org_id, nickname, address, city, state, zip, lat, lng, is_primary)
      values (${ids.properties[index]}, ${ids.customers[index]}, ${org.id}, 'Primary residence', ${line1}, ${city}, ${state}, ${zip}, ${coordinates[index][0]}, ${coordinates[index][1]}, true)
      on conflict (id) do update set
        customer_id = excluded.customer_id, org_id = excluded.org_id, address = excluded.address,
        city = excluded.city, state = excluded.state, zip = excluded.zip, lat = excluded.lat,
        lng = excluded.lng, is_primary = true, updated_at = now()
    `;
    await tx`
      insert into fireplace_units (id, property_id, org_id, nickname, brand, model, fuel_type, install_date, last_service_date, location, notes, is_active)
      values (${ids.units[index]}, ${ids.properties[index]}, ${org.id}, ${unitRows[index][3]}, ${unitRows[index][0]}, ${unitRows[index][1]}, ${unitRows[index][2]}, ${isoDate(-720 + index * 40)}, ${isoDate(-150 + index * 12)}, ${unitRows[index][3]}, 'Synthetic pilot appliance.', true)
      on conflict (id) do update set
        property_id = excluded.property_id, org_id = excluded.org_id, brand = excluded.brand,
        model = excluded.model, fuel_type = excluded.fuel_type, last_service_date = excluded.last_service_date,
        notes = excluded.notes, is_active = true, updated_at = now()
    `;
  }

  const customersPayload = customerRows.map((_, index) => customerPayload(index));
  const invoicesPayload = [
    coreInvoice(0, 0, "sent", 5899, 5899, "Napoleon Elevation X 42 installation deposit"),
    coreInvoice(1, 4, "paid", 465, 0, "Gas insert ignition repair"),
    coreInvoice(2, 5, "paid", 8490, 0, "Outdoor fireplace installation"),
  ];
  const corePayload = { customers: customersPayload, invoices: invoicesPayload, nextInvoiceNum: 2604, nextCustomerNum: 7 };
  await tx`
    insert into hearth_core_data_store_tenant (org_id, key, payload, updated_at)
    values (${org.id}, 'core', ${JSON.stringify(corePayload)}::jsonb, now())
    on conflict (org_id, key) do update set payload = excluded.payload, updated_at = now()
  `;

  for (let index = 0; index < jobSpecs.length; index += 1) {
    const [customerIndex, jobNumber, title, jobType, status, priority, dateOffset, start, end, amount, techIndexes] = jobSpecs[index];
    const address = `${customerRows[customerIndex][4]}, ${customerRows[customerIndex][5]}, ${customerRows[customerIndex][6]} ${customerRows[customerIndex][7]}`;
    const assignedTechs = techIndexes.map((techIndex) => ({
      id: ids.users[techIndex],
      name: `${people[techIndex][0]} ${people[techIndex][1]}`,
      color: people[techIndex][5],
    }));
    const payload = {
      id: ids.jobs[index], jobNumber, title,
      customerId: ids.customers[customerIndex],
      customerName: `${customerRows[customerIndex][0]} ${customerRows[customerIndex][1]}`,
      propertyAddress: address,
      fireplaceUnit: { brand: unitRows[customerIndex][0], model: unitRows[customerIndex][1], nickname: unitRows[customerIndex][3], type: unitRows[customerIndex][2] },
      jobType, status, priority,
      scheduledDate: isoDate(dateOffset), scheduledTimeStart: start, scheduledTimeEnd: end,
      assignedTechs, totalAmount: amount,
      notes: "Synthetic LT Rush pilot job for workflow testing.",
      completedAt: status === "completed" ? isoTimestamp(dateOffset, 18) : undefined,
      createdAt: isoTimestamp(-14 - index), updatedAt: isoTimestamp(0), photos: [],
    };
    await tx`
      insert into hearth_jobs_store (id, org_id, job_number, scheduled_date, scheduled_time_start, status, payload, created_at, updated_at)
      values (${ids.jobs[index]}, ${org.id}, ${jobNumber}, ${isoDate(dateOffset)}, ${start}, ${status}, ${JSON.stringify(payload)}::jsonb, ${payload.createdAt}, now())
      on conflict (id) do update set
        org_id = excluded.org_id, job_number = excluded.job_number, scheduled_date = excluded.scheduled_date,
        scheduled_time_start = excluded.scheduled_time_start, status = excluded.status,
        payload = excluded.payload, updated_at = now()
    `;
    await tx`
      insert into jobs (id, org_id, customer_id, property_id, fireplace_unit_id, job_number, title, description, job_type, status, priority, scheduled_date, scheduled_time_start, scheduled_time_end, estimated_duration, completed_at, total_amount, notes)
      values (${ids.jobs[index]}, ${org.id}, ${ids.customers[customerIndex]}, ${ids.properties[customerIndex]}, ${ids.units[customerIndex]}, ${jobNumber}, ${title}, 'Synthetic LT Rush pilot job.', ${jobType}, ${status}, ${priority}, ${isoDate(dateOffset)}, ${start}, ${end}, 120, ${status === "completed" ? isoTimestamp(dateOffset, 18) : null}, ${String(amount)}, 'Demo data only.')
      on conflict (id) do update set
        org_id = excluded.org_id, customer_id = excluded.customer_id, property_id = excluded.property_id,
        fireplace_unit_id = excluded.fireplace_unit_id, title = excluded.title, job_type = excluded.job_type,
        status = excluded.status, priority = excluded.priority, scheduled_date = excluded.scheduled_date,
        scheduled_time_start = excluded.scheduled_time_start, scheduled_time_end = excluded.scheduled_time_end,
        completed_at = excluded.completed_at, total_amount = excluded.total_amount, updated_at = now()
    `;
  }

  for (let index = 0; index < inventoryRows.length; index += 1) {
    const [sku, name, description, category, price, cost, quantity, reorder, location] = inventoryRows[index];
    await tx`
      insert into inventory_items (id, org_id, qb_item_id, name, sku, description, category, unit_price, cost, quantity_on_hand, reorder_level, location, is_active, is_tracked)
      values (${ids.inventory[index]}, ${org.id}, ${`DEMO-${sku}`}, ${name}, ${sku}, ${description}, ${category}, ${price}, ${cost}, ${quantity}, ${reorder}, ${location}, true, true)
      on conflict (id) do update set
        org_id = excluded.org_id, name = excluded.name, sku = excluded.sku, description = excluded.description,
        category = excluded.category, unit_price = excluded.unit_price, cost = excluded.cost,
        quantity_on_hand = excluded.quantity_on_hand, reorder_level = excluded.reorder_level,
        location = excluded.location, is_active = true, is_tracked = true, updated_at = now()
    `;
  }

  const vendorRows = [
    ["Napoleon Demo Distribution", "supplier", "800-555-0140"],
    ["Quadra-Fire Demo Distribution", "supplier", "800-555-0141"],
  ];
  for (let index = 0; index < vendorRows.length; index += 1) {
    await tx`
      insert into vendors (id, org_id, qb_vendor_id, display_name, company_name, phone, category, notes, is_active)
      values (${ids.vendors[index]}, ${org.id}, ${`DEMO-LTR-V${index + 1}`}, ${vendorRows[index][0]}, ${vendorRows[index][0]}, ${vendorRows[index][2]}, ${vendorRows[index][1]}, 'Synthetic pilot vendor.', true)
      on conflict (id) do update set
        org_id = excluded.org_id, display_name = excluded.display_name, company_name = excluded.company_name,
        phone = excluded.phone, category = excluded.category, notes = excluded.notes, is_active = true, updated_at = now()
    `;
  }

  const estimateRows = [
    [0, "LTR-EST-2601", "pending", "5899.00", 0],
    [2, "LTR-EST-2602", "accepted", "4895.00", 1],
  ];
  for (let index = 0; index < estimateRows.length; index += 1) {
    const [customerIndex, number, status, total, inventoryIndex] = estimateRows[index];
    await tx`
      insert into estimates (id, org_id, customer_id, qb_estimate_id, estimate_number, status, issue_date, expiration_date, subtotal, tax_amount, total_amount, customer_memo, private_note, bill_email)
      values (${ids.estimates[index]}, ${org.id}, ${ids.customers[customerIndex]}, ${`DEMO-${number}`}, ${number}, ${status}, ${isoDate(-2 - index)}, ${isoDate(28 - index)}, ${total}, '0', ${total}, 'Thank you for considering L.T. Rush Stone.', 'Synthetic pilot estimate.', ${customerRows[customerIndex][2]})
      on conflict (id) do update set
        org_id = excluded.org_id, customer_id = excluded.customer_id, estimate_number = excluded.estimate_number,
        status = excluded.status, issue_date = excluded.issue_date, expiration_date = excluded.expiration_date,
        subtotal = excluded.subtotal, total_amount = excluded.total_amount, updated_at = now()
    `;
    await tx`
      insert into estimate_line_items (id, estimate_id, qb_item_id, description, quantity, unit_price, total, "order")
      values (${`72710000-0000-4000-8000-00000000000${index + 1}`}, ${ids.estimates[index]}, ${`DEMO-${inventoryRows[inventoryIndex][0]}`}, ${inventoryRows[inventoryIndex][1]}, '1', ${total}, ${total}, 1)
      on conflict (id) do update set
        estimate_id = excluded.estimate_id, qb_item_id = excluded.qb_item_id,
        description = excluded.description, quantity = excluded.quantity,
        unit_price = excluded.unit_price, total = excluded.total
    `;
  }

  const normalizedInvoices = [
    [0, 0, "sent", "5899.00", "5899.00"],
    [1, 4, "paid", "465.00", "0.00"],
    [2, 5, "paid", "8490.00", "0.00"],
  ];
  for (let index = 0; index < normalizedInvoices.length; index += 1) {
    const [invoiceIndex, customerIndex, status, total, balance] = normalizedInvoices[index];
    await tx`
      insert into invoices (id, org_id, job_id, customer_id, invoice_number, qb_invoice_id, status, issue_date, due_date, subtotal, tax_amount, total_amount, balance, notes, paid_at)
      values (${ids.invoices[invoiceIndex]}, ${org.id}, ${ids.jobs[customerIndex]}, ${ids.customers[customerIndex]}, ${`LTR-INV-${2601 + invoiceIndex}`}, ${`DEMO-LTR-I${invoiceIndex + 1}`}, ${status}, ${isoDate(-7 - index)}, ${isoDate(23 - index)}, ${total}, '0', ${total}, ${balance}, 'Synthetic pilot invoice.', ${status === "paid" ? isoTimestamp(-index) : null})
      on conflict (id) do update set
        org_id = excluded.org_id, job_id = excluded.job_id, customer_id = excluded.customer_id,
        status = excluded.status, issue_date = excluded.issue_date, due_date = excluded.due_date,
        subtotal = excluded.subtotal, total_amount = excluded.total_amount, balance = excluded.balance,
        paid_at = excluded.paid_at, updated_at = now()
    `;
    await tx`
      insert into invoice_line_items (id, invoice_id, description, quantity, unit_price, total, "order")
      values (${`72810000-0000-4000-8000-00000000000${index + 1}`}, ${ids.invoices[invoiceIndex]}, ${corePayload.invoices[index].jobTitle}, '1', ${total}, ${total}, 1)
      on conflict (id) do update set
        invoice_id = excluded.invoice_id, description = excluded.description,
        quantity = excluded.quantity, unit_price = excluded.unit_price, total = excluded.total
    `;
  }

  await tx`
    insert into payments (id, org_id, invoice_id, qb_payment_id, amount, payment_method, transaction_id, paid_at, notes)
    values ('72820000-0000-4000-8000-000000000001', ${org.id}, ${ids.invoices[1]}, 'DEMO-LTR-P1', '465.00', 'credit_card', 'DEMO-TXN-LTR-1', ${isoTimestamp(-1)}, 'Synthetic pilot payment.')
    on conflict (id) do update set org_id = excluded.org_id, invoice_id = excluded.invoice_id, amount = excluded.amount, paid_at = excluded.paid_at
  `;
  await tx`
    insert into tenant_square_payments (org_id, square_payment_id, status, amount, currency, customer_name, invoice_number, source_type, order_id, created_at, updated_at, raw)
    values (${org.id}, 'DEMO-LTR-SQ-1', 'COMPLETED', '465.00', 'USD', 'Parker Demo', 'LTR-INV-2602', 'CARD', 'DEMO-LTR-ORDER-1', ${isoTimestamp(-1)}, now(), ${JSON.stringify({ demo: true })}::jsonb)
    on conflict (org_id, square_payment_id) do update set status = excluded.status, amount = excluded.amount, updated_at = now(), raw = excluded.raw
  `;

  await tx`
    insert into onboarding_progress (org_id, status, current_step, completed_steps, checklist, started_at, completed_at, updated_at)
    values (${org.id}, 'completed', 'complete', ${JSON.stringify(["company", "quickbooks", "payments", "team", "scheduling"])}::jsonb, ${JSON.stringify({ demoData: true, integrationsSkipped: true })}::jsonb, now(), now(), now())
    on conflict (org_id) do update set
      status = 'completed', current_step = 'complete', completed_steps = excluded.completed_steps,
      checklist = excluded.checklist, completed_at = now(), updated_at = now()
  `;
});

const [summary] = await sql`
  select
    o.id as org_id,
    o.name,
    o.slug,
    (select count(*)::int from customers c where c.org_id = o.id) as customers,
    (select count(*)::int from jobs j where j.org_id = o.id) as jobs,
    (select count(*)::int from estimates e where e.org_id = o.id) as estimates,
    (select count(*)::int from invoices i where i.org_id = o.id) as invoices,
    (select count(*)::int from inventory_items ii where ii.org_id = o.id) as inventory_items,
    (select count(*)::int from users u where u.org_id = o.id) as users
  from organizations o
  where o.slug = ${requestedSlug}
`;

console.log(JSON.stringify(summary, null, 2));
await sql.end();
