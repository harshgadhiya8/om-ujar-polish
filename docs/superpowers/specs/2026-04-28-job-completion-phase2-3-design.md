# Job Completion Workflow - Phase 2/3 Design

**Date:** 2026-04-28
**Project:** Silver Ornament Polishing Management System
**Scope:** Phase 2 & 3 - Job Completion, Final Weights, and Delivery Tracking

## Overview

This design extends the existing Phase 1 (Initial Bill Creation) system to support the complete job lifecycle: from receiving ornaments to final delivery. When customers return to pick up their polished ornaments, the system will capture final weights, calculate charges based on added silver (fine), and mark jobs as delivered.

## Business Context

### Current State (Phase 1)
- Customer drops off silver ornaments
- Initial weight captured (from scale or manual)
- Job created with unique barcode
- Service charge calculated: `initial_weight × service_rate_per_kg`
- Status: "received"

### New Capability (Phase 2/3)
- Customer returns to pick up polished ornaments
- Final weight captured (ornaments + plastic bag)
- Plastic bag weight entered manually
- System calculates:
  - Fine (added silver during polishing)
  - Fine-based service charge
- Job marked as delivered
- Status automatically transitions: "received" → "processing" → "completed"

### Key Business Rules
1. Silver polishing typically **adds weight** (e.g., 1kg becomes 1.2kg)
2. Added weight (fine) is the basis for labor charge calculation
3. Plastic bag weight must be excluded from ornament weight
4. Both Phase 1 service charge and fine-based charge are stored for business analysis
5. All operations happen when customer picks up (single workflow)

## Database Schema Changes

### New Column
Add to `jobs` table:

```sql
ALTER TABLE jobs ADD COLUMN fine_based_charge REAL;
```

### Existing Columns (already present)
These columns exist but are currently unused:
- `final_weight` REAL - Total weight (ornaments + bag) measured at delivery
- `plastic_bag_weight` REAL - Weight of plastic bag (manual entry)
- `fine_amount` REAL - Calculated: added silver weight
- `service_charge` REAL - Phase 1 calculation, kept for comparison
- `total_amount` REAL - Reserved for future use (stays NULL)
- `delivered_at` TIMESTAMP - When customer picked up ornaments

### Calculation Schema

```
Input:
  - initial_weight (from Phase 1)
  - service_rate_per_kg (from Phase 1)
  - final_weight (captured at delivery)
  - plastic_bag_weight (manual entry)

Calculations:
  actual_ornament_weight = final_weight - plastic_bag_weight
  fine_amount = actual_ornament_weight - initial_weight
  fine_based_charge = fine_amount × service_rate_per_kg

Storage:
  - final_weight
  - plastic_bag_weight
  - fine_amount
  - fine_based_charge
  - delivered_at = NOW()
  - updated_at = NOW()
```

### Status Logic (Automatic)

Status is derived automatically based on data presence:

```javascript
if (final_weight === null) {
  status = "received"  // Phase 1 complete, work not started
}
else if (final_weight !== null && delivered_at === null) {
  status = "processing"  // Work done, waiting for pickup
}
else if (delivered_at !== null) {
  status = "completed"  // Customer picked up
}
```

**Note:** In practice, with the single-workflow approach, jobs will typically jump directly from "received" to "completed" since final_weight and delivered_at are set together.

## Backend API

### New Endpoint: Complete Job

```
PUT /api/jobs/:jobNumber/complete
```

**Request Body:**
```json
{
  "final_weight": 1.250,        // kg (from scale or manual)
  "plastic_bag_weight": 0.050   // kg (manual entry)
}
```

**Processing Logic:**

1. **Validation:**
   - Job exists (404 if not found)
   - Job not already completed (400 if `delivered_at IS NOT NULL`)
   - `final_weight > 0` (400 if invalid)
   - `plastic_bag_weight >= 0` (400 if invalid)
   - `final_weight > plastic_bag_weight` (400 if bag heavier than total)

2. **Calculations:**
   ```javascript
   actual_ornament_weight = final_weight - plastic_bag_weight
   fine_amount = actual_ornament_weight - initial_weight
   fine_based_charge = fine_amount × service_rate_per_kg
   ```

3. **Database Update (Transaction):**
   ```sql
   UPDATE jobs SET
     final_weight = ?,
     plastic_bag_weight = ?,
     fine_amount = ?,
     fine_based_charge = ?,
     delivered_at = CURRENT_TIMESTAMP,
     updated_at = CURRENT_TIMESTAMP
   WHERE job_number = ?
   ```

4. **Response:**
   ```json
   {
     "success": true,
     "job": {
       // Complete job object with all fields
     },
     "calculations": {
       "actual_ornament_weight": 1.200,
       "fine_amount": 0.200,
       "fine_based_charge": 100.00,
       "service_charge": 500.00  // Phase 1 charge for comparison
     },
     "message": "Job ABC0001 completed successfully"
   }
   ```

**Error Responses:**

```json
// Job not found
{ "error": "Job ABC0001 not found", "status": 404 }

// Already completed
{ "error": "Job ABC0001 already completed on 2026-04-15", "status": 400 }

// Invalid weights
{ "error": "Final weight must be greater than plastic bag weight", "status": 400 }

// Negative fine warning (still succeeds)
{
  "success": true,
  "warning": "Final weight is less than initial weight. Silver lost: 50g",
  "job": { ... },
  "calculations": { ... }
}
```

### Existing Endpoint: Get Job

```
GET /api/jobs/:jobNumber
```

Already exists (from Phase 1). Verify it returns all fields needed for display:
- Customer details (name, phone, address)
- Job details (ornament_type, ghughri_option, created_at)
- Phase 1 data (initial_weight, service_rate_per_kg, service_charge)
- Phase 2/3 data (if present): final_weight, plastic_bag_weight, fine_amount, fine_based_charge, delivered_at
- Barcode (base64 image)
- Current status

## Frontend UI

### Tab Structure

Update `App.js` to add tabbed navigation:

```
┌─────────────────────────────────────────┐
│ [ Create Job ] [ Complete Job ]         │
├─────────────────────────────────────────┤
│                                         │
│  Tab content appears here               │
│                                         │
└─────────────────────────────────────────┘
```

**Implementation:**
- Simple state-based tab switching (no routing)
- Tab 1: "Create Job" - existing InitialBill component (no changes)
- Tab 2: "Complete Job" - new CompleteJob component

### Complete Job Component

**File:** `frontend/src/components/CompleteJob.js`

**Component State:**
```javascript
{
  searchQuery: '',           // Job number input
  job: null,                 // Retrieved job details
  finalWeight: '',           // From scale or manual
  plasticBagWeight: '',      // Manual entry
  isPolling: false,          // Weight polling active
  message: { type: '', text: '' },
  loading: false
}
```

**UI Layout:**

```
┌─────────────────────────────────────────────────────┐
│ Complete Job & Delivery                             │
├─────────────────────────────────────────────────────┤
│                                                     │
│ 🔍 Search Job                                       │
│ ┌─────────────────────────┐  ┌────────┐           │
│ │ ABC0001                 │  │ Search │           │
│ └─────────────────────────┘  └────────┘           │
│                                                     │
├─────────────────────────────────────────────────────┤
│ [Appears after successful search]                  │
│                                                     │
│ 📋 Job Details                                      │
│ Customer: Harsh Patel (9876543210)                 │
│ Job #: ABC0001                                      │
│ Ornament: Bangles | Ghughri: With                  │
│ Created: 2026-04-20                                 │
│                                                     │
│ Initial Weight: 1.000 kg                            │
│ Service Rate: ₹500/kg                               │
│ Phase 1 Service Charge: ₹500.00                     │
│                                                     │
│ [Barcode displayed here]                            │
│                                                     │
├─────────────────────────────────────────────────────┤
│ ⚖️ Final Measurements                               │
│                                                     │
│ Final Weight (with bag):                            │
│ ┌──────────────┐  ┌───────────────────┐           │
│ │ 1.250        │  │ Capture from Scale│           │
│ └──────────────┘  └───────────────────┘           │
│                                                     │
│ Plastic Bag Weight:                                 │
│ ┌──────────────┐                                   │
│ │ 0.050        │  kg                               │
│ └──────────────┘                                   │
│                                                     │
├─────────────────────────────────────────────────────┤
│ 💰 Calculations (Live)                              │
│                                                     │
│ Actual Ornament Weight: 1.200 kg                    │
│ Fine (Added Silver):    0.200 kg (200g)             │
│ Fine Based Charge:      ₹100.00                     │
│                                                     │
│ ℹ️ Phase 1 Charge:       ₹500.00 (for comparison)  │
│                                                     │
│ ┌────────────────────────┐                         │
│ │  Complete & Deliver    │                         │
│ └────────────────────────┘                         │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### User Workflow

1. **Search for Job:**
   - User enters job number (e.g., ABC0001)
   - Clicks "Search" or presses Enter
   - API call: `GET /api/jobs/ABC0001`
   - Display job details if found
   - Show error if not found

2. **Review Job Information:**
   - All Phase 1 data displayed
   - Customer information visible
   - Barcode shown
   - Current status indicated
   - If status = "completed", show read-only view with message: "Already delivered on [date]"

3. **Capture Final Weight:**
   - **Option A:** Click "Capture from Scale"
     - Starts weight polling (same as Phase 1)
     - Polls `/api/weight` every 2 seconds
     - Weight appears in input field
   - **Option B:** Manually type weight in input field
   - Weight must be > 0

4. **Enter Plastic Bag Weight:**
   - Manual entry only
   - Must be >= 0
   - Must be < final_weight

5. **View Live Calculations:**
   - As user enters/updates values, calculate and display:
     - Actual ornament weight = final - bag
     - Fine = actual - initial
     - Fine based charge = fine × rate
     - Show Phase 1 charge for comparison
   - **Warning cases:**
     - If fine < 0: "⚠️ Warning: Final weight is less than initial. Silver lost: Xg"
     - If fine > 50% of initial: "⚠️ Large weight gain detected. Please verify."

6. **Complete Job:**
   - Click "Complete & Deliver" button
   - Validation:
     - Final weight required
     - Plastic bag weight required
     - Final > bag weight
   - API call: `PUT /api/jobs/ABC0001/complete`
   - Show success message with summary
   - Clear form, ready for next job

### Validation Rules

**Client-side:**
- Job number required for search
- Final weight must be > 0
- Plastic bag weight must be >= 0
- Final weight must be > plastic bag weight

**Warnings (not blocking):**
- If fine < 0: Show warning but allow completion
- If fine > 50% of initial_weight: Show confirmation dialog

### Messages & Feedback

**Success:**
```
✅ Job ABC0001 completed successfully!
Fine: 200g | Charge: ₹100.00
Customer can pick up their ornaments.
```

**Error:**
```
❌ Job not found
❌ This job was already completed on 2026-04-15
❌ Final weight must be greater than plastic bag weight
```

**Warning:**
```
⚠️ Warning: Final weight (950g) is less than initial weight (1000g).
Silver lost during polishing: 50g
Proceed with completion?
```

## Edge Cases

### 1. Negative Fine (Silver Lost)

**Scenario:** `actual_ornament_weight < initial_weight`

**Cause:** Silver lost during polishing (unusual but possible)

**Handling:**
- Allow the operation (valid business case)
- Display prominent warning in UI
- `fine_amount` will be negative
- `fine_based_charge` will be negative
- Show clearly in completion summary
- Business decision needed: charge nothing? credit customer?

**Example:**
```
Initial: 1000g
Final: 950g (after bag subtraction)
Fine: -50g (lost)
Charge: -₹25 (if rate = ₹500/kg)
```

### 2. Very Large Fine (Possible Error)

**Scenario:** Fine > 50% of initial weight

**Cause:** Likely data entry error (typed 10kg instead of 1kg)

**Handling:**
- Show confirmation dialog before completing
- "Added weight is 5kg (500% of initial). This seems unusually high. Please verify."
- User can confirm or go back to correct

### 3. Job Already Completed

**Scenario:** User searches for job that was already delivered

**Handling:**
- Display all job details in read-only mode
- Show message: "✅ This job was completed on 2026-04-15 at 3:45 PM"
- Display final calculations
- Disable completion form
- No edit/update allowed (data integrity)

### 4. Scale Connection Issues

**Scenario:** Mock weight API fails or times out

**Handling:**
- Show error: "❌ Could not read from scale. Please enter weight manually."
- Don't block workflow - manual entry always available
- Log error for debugging

### 5. Concurrent Updates

**Scenario:** Two users try to complete same job simultaneously

**Handling:**
- First request succeeds
- Second request gets 400 error: "Job already completed"
- Frontend shows error message
- No data corruption (database-level constraint)

### 6. Partial Weight Entry

**Scenario:** User enters final weight but forgets bag weight

**Handling:**
- Disable "Complete & Deliver" button until both weights entered
- Show validation message: "Please enter both final weight and bag weight"

### 7. Browser Refresh Mid-Entry

**Scenario:** User entered weights but refreshed page before completing

**Handling:**
- Form state is lost (not persisted)
- No partial data saved to database
- User must search again and re-enter weights
- This is acceptable - completion is atomic operation

## Data Migration

### Migration Script

```sql
-- Add new column to existing jobs table
ALTER TABLE jobs ADD COLUMN fine_based_charge REAL;

-- No data migration needed
-- Existing jobs will have NULL for fine_based_charge
-- Value will be calculated when job is completed
```

**Safety:**
- Non-destructive change
- Backward compatible
- Existing Phase 1 jobs unaffected
- No data loss

### Rollback Plan

If Phase 2/3 needs to be rolled back:
```sql
-- Remove column (optional - can also leave it)
ALTER TABLE jobs DROP COLUMN fine_based_charge;
```

Database will function normally with Phase 1 code.

## Testing Strategy

### Unit Tests (Backend)

1. **Calculation Tests:**
   - Positive fine (normal case)
   - Negative fine (silver lost)
   - Zero fine (exact match)
   - Large fine (> 100% of initial)

2. **Validation Tests:**
   - Missing job number
   - Job not found
   - Already completed
   - Invalid weights (negative, bag > total)

3. **Database Tests:**
   - Transaction rollback on error
   - Concurrent completion attempts
   - Status derivation logic

### Integration Tests

1. **API Tests:**
   - Complete job successfully
   - Error responses for invalid input
   - Job retrieval with all fields
   - Status transitions

### Manual Testing Checklist

- [ ] Create job in Phase 1
- [ ] Search for job in Phase 2 tab
- [ ] Capture weight from mock scale
- [ ] Manually enter weight
- [ ] Enter bag weight
- [ ] Verify live calculations update
- [ ] Complete job successfully
- [ ] Search for completed job (should be read-only)
- [ ] Test negative fine scenario
- [ ] Test large fine warning
- [ ] Test validation errors
- [ ] Verify barcode displays correctly
- [ ] Test tab switching

## Implementation Notes

### Technology Stack (Unchanged)

- Backend: Node.js + Express + SQLite3
- Frontend: React 19
- No new dependencies required

### File Changes

**Backend:**
- `backend/server.js` - Add new endpoint, add migration

**Frontend:**
- `frontend/src/App.js` - Add tab structure
- `frontend/src/components/CompleteJob.js` - New component
- `frontend/src/components/CompleteJob.css` - New styles

**Database:**
- Migration to add `fine_based_charge` column

### Reusable Code

From Phase 1 InitialBill component:
- Weight polling logic (for "Capture from Scale")
- Message display component/logic
- API error handling patterns
- Form validation patterns

### Future Considerations

**Not in Scope (Phase 2/3):**
- Barcode scanning hardware integration (manual entry for now)
- Camera-based barcode scanning
- Ghughri calculation logic
- Total amount calculation
- Bulk operations
- Reports/analytics
- Mobile app

**Reserved for Future:**
- `total_amount` field (stays NULL)
- Additional status values if needed
- Payment tracking
- SMS notifications

## Success Criteria

Phase 2/3 is complete when:

1. ✅ User can search for a job by job number
2. ✅ All Phase 1 job details display correctly
3. ✅ User can capture final weight (scale or manual)
4. ✅ User can enter plastic bag weight
5. ✅ Live calculations show: actual weight, fine, fine-based charge
6. ✅ Both Phase 1 and fine-based charges displayed
7. ✅ Job can be marked as completed/delivered
8. ✅ Status automatically transitions based on data
9. ✅ Completed jobs show read-only view
10. ✅ Validation prevents invalid operations
11. ✅ Edge cases handled gracefully
12. ✅ Database migration successful

## Open Questions

**Resolved:**
- ✅ Service charge calculation (both stored)
- ✅ Workflow timing (single operation at pickup)
- ✅ UI approach (tabbed interface)
- ✅ Status transitions (automatic)
- ✅ Weight capture method (both scale and manual)

**Deferred:**
- Ghughri calculation logic (later phase)
- Total amount formula (waiting for business decision)
- Barcode scanning hardware (manual entry for now)
- What to charge when fine is negative

## Appendix: Example Scenarios

### Scenario 1: Normal Job (Silver Added)

```
Phase 1 (Create):
  Initial Weight: 1.000 kg
  Service Rate: ₹500/kg
  Service Charge: ₹500

Phase 2/3 (Complete):
  Final Weight: 1.250 kg
  Bag Weight: 0.050 kg

  Calculations:
  Actual Ornament: 1.250 - 0.050 = 1.200 kg
  Fine: 1.200 - 1.000 = 0.200 kg (200g added)
  Fine Based Charge: 0.200 × 500 = ₹100

  Result: Customer pays ₹100 (or ₹500? TBD)
```

### Scenario 2: Silver Lost

```
Phase 1:
  Initial Weight: 1.000 kg
  Service Rate: ₹500/kg
  Service Charge: ₹500

Phase 2/3:
  Final Weight: 1.000 kg
  Bag Weight: 0.050 kg

  Calculations:
  Actual Ornament: 1.000 - 0.050 = 0.950 kg
  Fine: 0.950 - 1.000 = -0.050 kg (50g lost)
  Fine Based Charge: -0.050 × 500 = -₹25

  Warning: "Silver lost during polishing: 50g"
  Business Decision: How to charge?
```

### Scenario 3: Large Gain

```
Phase 1:
  Initial Weight: 0.500 kg
  Service Rate: ₹600/kg
  Service Charge: ₹300

Phase 2/3:
  Final Weight: 1.100 kg
  Bag Weight: 0.050 kg

  Calculations:
  Actual Ornament: 1.100 - 0.050 = 1.050 kg
  Fine: 1.050 - 0.500 = 0.550 kg (550g added - 110%)
  Fine Based Charge: 0.550 × 600 = ₹330

  Warning: "Large weight gain detected: 110% of initial"
  Confirm before proceeding
```

---

**End of Design Document**
