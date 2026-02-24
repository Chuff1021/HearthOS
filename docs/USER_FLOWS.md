# 👤 HearthOS — User Flows

**Version:** 1.0

---

## 1. Admin / Owner Flows

### 1.1 Initial Setup Flow
```
Login → Setup Wizard
    → Enter company info (name, logo, timezone, address)
    → Configure pricing tables (labor rates, trip fees by zone)
    → Add job types and checklist templates
    → Create user accounts (dispatchers, techs)
    → Connect integrations (QuickBooks, Stripe, Twilio)
    → Review dashboard → Done
```

### 1.2 User Management Flow
```
Admin Panel → Users
    → View all users (filter by role)
    → Add New User
        → Enter name, email, phone, role
        → Set permissions
        → Send invite email
        → User activates account
    → Edit User
        → Modify role / permissions
        → Deactivate / reactivate
    → View user performance metrics
```

### 1.3 Reporting Flow
```
Dashboard → Reports
    → Select report type:
        ├── Revenue by period / job type / tech
        ├── Jobs completed per tech
        ├── Callback & warranty rates
        ├── Checklist compliance
        └── Photo documentation rates
    → Set date range
    → Apply filters (tech, job type, status)
    → View charts + data table
    → Export (CSV, PDF)
```

### 1.4 Pricing Configuration Flow
```
Settings → Pricing
    → Labor Rates
        → Set hourly rate per job type
        → Set minimum charge
    → Trip Fees
        → Configure by zone / distance
    → Service Plan Pricing
        → Define plan tiers
        → Set recurring billing amounts
    → Save → Rates apply to new jobs
```

---

## 2. Office / Dispatcher Flows

### 2.1 Create New Customer Flow
```
Customers → New Customer
    → Enter contact info (name, phone, email)
    → Add property address
        → Auto-geocode address
        → Add access notes (gate code, pets, HOA)
    → Add fireplace unit(s)
        → Select unit type, fuel type
        → Enter brand, model, serial number
        → Enter install date, warranty expiry
    → Save Customer Profile
    → Option: Schedule job immediately
```

### 2.2 Schedule New Job Flow
```
Schedule → New Job  (or from Customer Profile → New Job)
    → Select customer (search by name/phone/address)
    → Select property
    → Select fireplace unit (or "new unit")
    → Select job type (Install / Service / Clean & Burn / etc.)
    → Set priority (Normal / High / Emergency)
    → Enter job description
    → Select date/time
        → Calendar shows tech availability
        → Travel time calculated from previous job
        → Conflict detection alerts shown
    → Assign technician(s)
        → Lead tech + optional helper
    → Estimate duration
    → Add parts needed (optional)
    → Save → Job created
    → Send confirmation to customer (SMS/email)
```

### 2.3 Dispatch Board Flow
```
Dispatch → Today's Board
    → View all jobs on map + timeline
    → Drag job to reassign tech or reschedule time
    → Click job → Quick view panel
        → Customer info
        → Job status
        → Tech location (live)
        → Quick actions: Call tech, Call customer, Edit job
    → Filter by: Tech, Job type, Status, Zone
    → Emergency job → Drag to top, auto-notify tech
```

### 2.4 Send Estimate Flow
```
Job Record → Create Estimate
    → Add line items
        → Labor (hours × rate)
        → Parts (from catalog or manual entry)
        → Trip fee
        → Discounts
    → Preview estimate (customer view)
    → Send to customer
        → Email with approval link
        → SMS with link
    → Customer approves online
    → Estimate converts to job confirmation
    → Option: Collect deposit
```

### 2.5 Invoice & Payment Flow
```
Job Completed → Auto-trigger invoice creation
    → Review invoice (pre-filled from estimate)
    → Adjust line items if needed
    → Add any additional charges
    → Send invoice to customer
        → Email with payment link
        → SMS reminder
    → Customer pays online (card/ACH)
    → Payment recorded → Invoice marked paid
    → Sync to QuickBooks Online
    → Receipt sent to customer
```

---

## 3. Technician / Installer Mobile Flows

### 3.1 Start of Day Flow
```
Open App → Today's Jobs
    → View job list (sorted by time)
    → View map with all job locations
    → Tap first job → Job Detail
    → Review: customer info, address, job type, notes
    → Tap "Navigate" → Opens GPS app
    → Tap "On My Way" → Status updates, customer notified
```

### 3.2 Job Execution Flow
```
Arrive at job site
    → Tap "I've Arrived" → Clock in, status = On Site
    → Review job details and checklist
    → Tap "Start Work" → Status = In Progress

    CHECKLIST FLOW:
    → Work through checklist items top to bottom
    → Each item:
        → Mark complete / N/A
        → Enter measurement if required (e.g., gas pressure: 3.5 inWC)
        → Take required photo (camera opens inline)
        → Add notes if needed
    → Required items cannot be skipped
    → Progress bar shows completion %

    PHOTO FLOW:
    → Tap camera icon on checklist item
    → Take photo or select from gallery
    → AI auto-tags photo type
    → Add caption (optional)
    → Photo saved to job record

    COMPLETION FLOW:
    → All required items complete
    → Add completion notes
    → Customer signature capture
        → Customer signs on tech's phone
        → Signature saved with timestamp
    → Tap "Complete Job"
    → Status = Completed
    → Invoice auto-generated (office notified)
    → Customer receives completion notification
```

### 3.3 Parts & Materials Flow
```
Job Detail → Parts Tab
    → View parts listed for job
    → Mark parts as used
    → Add unlisted parts (manual entry)
    → Note serial numbers for installed parts
    → Parts sync to invoice line items
```

### 3.4 Issue / Callback Flow
```
During job → Tap "Flag Issue"
    → Select issue type:
        ├── Parts needed (not on truck)
        ├── Safety concern
        ├── Requires supervisor
        └── Customer not home
    → Add description + photo
    → Notify dispatcher (push notification)
    → Dispatcher responds in-app
    → If callback needed:
        → Mark job as "Requires Callback"
        → Add callback reason
        → Dispatcher schedules follow-up job
```

### 3.5 Offline Mode Flow
```
No internet connection detected
    → App switches to offline mode (banner shown)
    → All job data pre-loaded from last sync
    → Continue working:
        → Complete checklist items (stored locally)
        → Take photos (stored locally)
        → Capture signature (stored locally)
        → Clock in/out (stored locally)
    → Connection restored
        → Background sync begins
        → All data uploaded
        → Conflicts resolved (server wins for scheduling)
        → Sync complete notification
```

---

## 4. Customer Portal Flows

### 4.1 Customer Onboarding Flow
```
Receive invite email/SMS from company
    → Click link → Create account
    → Set password
    → View profile (pre-filled by office)
    → Confirm contact info
    → View upcoming appointment
```

### 4.2 Appointment Tracking Flow
```
Login → Dashboard
    → View upcoming appointment card
        → Date, time window, tech name + photo
        → Job type description
    → Day of appointment:
        → Receive SMS: "Tech is on the way" + ETA
        → Track tech on map (optional, if enabled)
    → After job:
        → Receive completion notification
        → View job summary + photos
        → Rate the service (1-5 stars)
```

### 4.3 Estimate Approval Flow
```
Receive email/SMS: "Your estimate is ready"
    → Click link → View estimate
    → Review line items
    → View attached photos (if any)
    → Approve or Request Changes
        → Approve: Digital signature + timestamp
        → Request Changes: Add comment → Sent to office
    → Approved → Confirmation sent
    → Option: Pay deposit now
```

### 4.4 Invoice Payment Flow
```
Receive email/SMS: "Invoice ready"
    → Click link → View invoice
    → Review charges
    → Select payment method:
        ├── Credit/debit card (Stripe)
        ├── ACH bank transfer
        └── Financing (if enabled)
    → Enter payment details
    → Confirm payment
    → Receipt emailed
    → Invoice marked paid
```

### 4.5 Service History Flow
```
Portal → My Fireplaces
    → Select fireplace unit
    → View timeline:
        → Install date
        → Each service visit (date, type, tech, notes)
        → Photos from each visit
        → Parts replaced
    → View warranty status
    → Download service records (PDF)
```

---

## 5. Cross-Role Notification Flows

### Job Status Notifications
```
Job Created
    → Tech: Push notification "New job assigned: [date]"
    → Customer: SMS/email "Appointment confirmed"

Tech En Route
    → Customer: SMS "Your tech [Name] is on the way! ETA: 20 min"

Job Completed
    → Dispatcher: In-app notification "Job #XXX completed"
    → Customer: SMS/email "Service complete. Invoice attached."

Invoice Sent
    → Customer: Email + SMS with payment link

Payment Received
    → Admin: In-app notification
    → Customer: Receipt email

Checklist Flagged
    → Dispatcher: Push "Job #XXX has flagged checklist items"
    → Admin: Email digest (daily)
```
