# GO LIVE TODAY - Execution Plan

## Completed in this push
- QuickBooks customer/global search resilience with token refresh + retry
- Schedule intake upgraded (job types, lookup, notes, validation)
- Drag/drop scheduling stabilization
- Added QuickBooks Vendors API route (`/api/quickbooks/vendors`)
- Added QuickBooks Purchase Orders API route (`/api/quickbooks/purchase-orders`)
- Added initial audit log system (`/api/audit-logs`) and invoice create/update/delete logging

## Next high-impact tasks (today)
1. Dashboard PO panel
   - list vendors
   - create PO from dashboard
   - list recent POs + sync status
2. Inventory import and mapping hardening
   - pull QB items regularly
   - attach itemRef to estimate/invoice lines
3. Estimate AI scaffold
   - prompt -> structured draft estimate endpoint
   - retrieval from historical jobs + line items
4. Audit expansion
   - log estimate changes
   - log schedule move/add/delete

## QA checklist before end of day
- [ ] Create schedule job and verify in calendar + tech view
- [ ] Drag/drop across week multiple times
- [ ] QB customer lookup returns live results
- [ ] Vendors endpoint returns QB data
- [ ] Create test purchase order in QB from API
- [ ] Invoice changes appear in `/api/audit-logs?entityType=invoice`
