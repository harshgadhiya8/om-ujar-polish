# Daily Ledger System Design

**Date:** 2026-05-05
**Project:** Silver Ornament Polishing Management System
**Scope:** Daily Ledger - Date-based reporting with detailed calculations

## Overview

This design adds a daily ledger feature that displays completed jobs for a selected date or date range, showing detailed weight calculations (javak vajan based). The ledger provides an interactive table view with column visibility controls and export capabilities (CSV/PDF).

## Business Context

### Current State
- Jobs are created with initial weight (aavak vajan)
- Jobs are completed with final weight capture (javak vajan)
- Fine calculation: `javak - aavak - bag - customer_bag + ghat`
- All completion data stored in database
- Individual job receipts can be printed

### New Capability
- View all completed jobs for a specific date or date range
- See detailed weight calculations across multiple jobs
- Customize which columns to display
- View totals/sums for all numeric columns
- Export ledger as CSV or PDF for record-keeping

### Use Cases
1. **Daily Reconciliation:** View all jobs completed today
2. **Historical Review:** Check jobs from any past date
3. **Multi-day Analysis:** See jobs across date ranges (e.g., last 7 days)
4. **Record Keeping:** Download CSV/PDF for accounting/backup
5. **Focused View:** Hide irrelevant columns to focus on specific metrics

## Architecture Overview

### Approach: Smart Unified Endpoint

Single backend endpoint that handles:
- Date-based filtering via query parameters
- Multiple response formats (JSON, CSV, PDF)
- Efficient SQL queries for performance

**Benefits:**
- Clean, RESTful API design
- Scalable with large datasets
- Professional server-generated exports
- Single endpoint to maintain

## Backend API Design

### Endpoint

```
GET /api/ledger
```

### Query Parameters

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| start_date | ISO Date | Yes | Start of date range | 2026-05-05 |
| end_date | ISO Date | No | End of date range (defaults to start_date) | 2026-05-10 |
| format | String | No | Response format: "json", "csv", "pdf" (default: "json") | csv |
| columns | String | No | Comma-separated column names to include (for CSV/PDF filtering) | job_number,customer_name,fine |

### Examples

**Get today's ledger as JSON:**
```
GET /api/ledger?start_date=2026-05-05
```

**Get date range as JSON:**
```
GET /api/ledger?start_date=2026-05-01&end_date=2026-05-05
```

**Download CSV:**
```
GET /api/ledger?start_date=2026-05-05&format=csv
```

**Download PDF with selected columns:**
```
GET /api/ledger?start_date=2026-05-05&format=pdf&columns=job_number,customer_name,fine
```

### SQL Query Logic

```sql
SELECT
    j.job_number,
    j.customer_id,
    c.name as customer_name,
    j.initial_weight as aavak_vajan,
    j.final_weight as javak_vajan,
    j.plastic_bag_weight as bag_vajan,
    j.customer_bag_weight,
    j.ghat,
    j.fine_amount as fine,
    j.delivered_at
FROM jobs j
JOIN customers c ON j.customer_id = c.customer_id
WHERE j.status = 'completed'
  AND DATE(j.delivered_at) >= ?
  AND DATE(j.delivered_at) <= ?
ORDER BY j.delivered_at DESC
```

**Notes:**
- Uses `DATE()` function to ignore time component
- Filters only completed jobs (`status = 'completed'`)
- Sorts by completion time (latest first within the date range)
- All weights in grams (as stored in database)

### Response Format: JSON

```json
{
  "start_date": "2026-05-05",
  "end_date": "2026-05-05",
  "jobs": [
    {
      "job_number": "ABC0001",
      "customer_id": "ABC",
      "customer_name": "Harsh Patel",
      "aavak_vajan": 1000,
      "javak_vajan": 1200,
      "bag_vajan": 50,
      "customer_bag_weight": 0,
      "ghat": 0,
      "fine": 150,
      "delivered_at": "2026-05-05 14:30:00"
    },
    {
      "job_number": "DEF0023",
      "customer_id": "DEF",
      "customer_name": "Patel Kumar",
      "aavak_vajan": 2000,
      "javak_vajan": 2250,
      "bag_vajan": 60,
      "customer_bag_weight": 10,
      "ghat": 5,
      "fine": 175,
      "delivered_at": "2026-05-05 10:15:00"
    }
  ],
  "totals": {
    "aavak_vajan": 3000,
    "javak_vajan": 3450,
    "bag_vajan": 110,
    "customer_bag_weight": 10,
    "ghat": 5,
    "fine": 325
  }
}
```

**Totals Calculation:**
- Sum all numeric columns across all jobs
- Includes: aavak_vajan, javak_vajan, bag_vajan, customer_bag_weight, ghat, fine
- Text columns (job_number, customer_id, customer_name) not included in totals

### Response Format: CSV

**Content-Type:** `text/csv`
**Content-Disposition:** `attachment; filename="ledger_YYYY-MM-DD.csv"` (or `ledger_YYYY-MM-DD_to_YYYY-MM-DD.csv` for ranges)

**Structure:**
```csv
Daily Ledger Report
Date Range: 05-May-2026 to 05-May-2026

Job Number,Customer ID,Customer Name,Aavak Vajan (g),Javak Vajan (g),Bag Vajan (g),Customer Bag Weight (g),Ghat (g),Fine (g)
ABC0001,ABC,Harsh Patel,1000,1200,50,0,0,150
DEF0023,DEF,Patel Kumar,2000,2250,60,10,5,175

TOTAL,,,3000,3450,110,10,5,325
```

**Details:**
- First row: Report title
- Second row: Date range
- Third row: Blank separator
- Fourth row: Column headers with units
- Data rows: One per job
- Blank row before totals
- Totals row: "TOTAL" in first column, sums in numeric columns

### Response Format: PDF

**Content-Type:** `application/pdf`
**Content-Disposition:** `attachment; filename="ledger_YYYY-MM-DD.pdf"`

**Page Layout:**
- Page size: A4 landscape (297mm × 210mm)
- Margins: 20 points
- Orientation: Landscape to fit all columns

**Structure:**

1. **Header Section:**
   - Center-aligned, bold: "Aum Polish"
   - Center-aligned: "Daily Ledger Report"
   - Center-aligned: Date range (e.g., "05-May-2026 to 05-May-2026")
   - Horizontal line separator

2. **Data Table:**
   - Bordered table with all columns
   - Column headers: Bold, 9pt font
   - Data rows: Regular, 8pt font
   - Right-align numeric columns
   - Left-align text columns

3. **Totals Row:**
   - Bold font
   - "TOTAL" label in first column
   - Sum values in numeric columns

4. **Footer:**
   - Small text (7pt)
   - Generated timestamp (e.g., "Generated on 05-May-2026 at 15:30")

**Column Widths (Approximate):**
- Job Number: 60pt
- Customer ID: 45pt
- Customer Name: 80pt
- Aavak Vajan: 50pt
- Javak Vajan: 50pt
- Bag Vajan: 50pt
- Customer Bag Weight: 70pt
- Ghat: 40pt
- Fine: 50pt

**Long Names Handling:**
- Truncate with ellipsis if name exceeds column width
- Example: "Harsh Patel Long Name..." fits in 80pt

### Backend Validation

**Required Parameters:**
- `start_date` must be provided
- Return 400 if missing: `{ "error": "start_date is required" }`

**Date Format Validation:**
- Must be valid ISO date (YYYY-MM-DD)
- Return 400 if invalid: `{ "error": "Invalid date format. Use YYYY-MM-DD" }`

**Date Range Validation:**
- `end_date` must be >= `start_date`
- Return 400 if violated: `{ "error": "end_date must be >= start_date" }`

**Format Parameter Validation:**
- Must be one of: "json", "csv", "pdf"
- Return 400 if invalid: `{ "error": "format must be json, csv, or pdf" }`

**No Data Handling:**
- Return 200 with empty results (not 404)
- Example:
  ```json
  {
    "start_date": "2026-05-05",
    "end_date": "2026-05-05",
    "jobs": [],
    "totals": {
      "aavak_vajan": 0,
      "javak_vajan": 0,
      "bag_vajan": 0,
      "customer_bag_weight": 0,
      "ghat": 0,
      "fine": 0
    }
  }
  ```

## Frontend UI Design

### Tab Structure

Update `App.js` to add third tab:

```
┌──────────────────────────────────────────────┐
│ [ Create Job ] [ Complete Job ] [ Daily Ledger ] │
└──────────────────────────────────────────────┘
```

**Implementation:**
- Simple state-based tab switching
- Tab 1: "Create Job" - existing InitialBill component
- Tab 2: "Complete Job" - existing CompleteJob component
- Tab 3: "Daily Ledger" - new DailyLedger component

### DailyLedger Component

**File:** `frontend/src/components/DailyLedger.js`

**Component State:**
```javascript
{
  startDate: 'YYYY-MM-DD',           // Selected start date
  endDate: 'YYYY-MM-DD',             // Selected end date
  ledgerData: null,                  // API response (jobs + totals)
  visibleColumns: {                  // Column visibility state
    job_number: true,
    customer_id: true,
    customer_name: true,
    aavak_vajan: true,
    javak_vajan: true,
    bag_vajan: true,
    customer_bag_weight: true,
    ghat: true,
    fine: true
  },
  loading: false,                    // API call in progress
  error: null                        // Error message if any
}
```

### UI Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Daily Ledger                                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 📅 Date Selection                                           │
│                                                             │
│ Quick Options:                                              │
│ [ Today ] [ Yesterday ] [ Last 7 Days ]                     │
│                                                             │
│ Custom Date Range:                                          │
│ From: [05/05/2026] To: [05/05/2026] [ Show Ledger ]        │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ 👁️ Column Visibility                                        │
│ ☑ Job Number  ☑ Customer ID  ☑ Customer Name               │
│ ☑ Aavak Vajan ☑ Javak Vajan ☑ Bag Vajan                    │
│ ☑ Customer Bag Weight ☑ Ghat ☑ Fine                        │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ 📊 Ledger for 05-May-2026 to 05-May-2026                   │
│                                                             │
│ Job#     | Cust | Name      | Aavak  | Javak  | Bag  |...  │
│          | ID   |           | (g)    | (g)    | (g)  |...  │
│----------|------|-----------|--------|--------|------|---- │
│ ABC0001  | ABC  | Harsh P.  | 1000   | 1200   | 50   |...  │
│ DEF0023  | DEF  | Patel K.  | 2000   | 2250   | 60   |...  │
│----------|------|-----------|--------|--------|------|---- │
│ TOTAL    |      |           | 3000   | 3450   | 110  |...  │
│                                                             │
│ [ Download CSV ] [ Download PDF ]                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Component Behavior

#### 1. On Component Mount
- Set `startDate` and `endDate` to today's date
- Automatically fetch ledger data for today
- Display results in table

#### 2. Quick Date Selection
**"Today" Button:**
- Set both dates to current date
- Fetch ledger data

**"Yesterday" Button:**
- Set both dates to yesterday's date
- Fetch ledger data

**"Last 7 Days" Button:**
- Set `startDate` to 7 days ago
- Set `endDate` to today
- Fetch ledger data

#### 3. Custom Date Selection
- Two date input fields (HTML5 date inputs)
- "Show Ledger" button triggers fetch with custom range
- Validation: end_date >= start_date (show error if violated)

#### 4. Column Visibility
- Checkboxes for each column
- Clicking checkbox toggles visibility in table
- Hidden columns excluded from view and exports
- State persists during session (lost on page refresh)

#### 5. Table Display
**Normal State:**
- Show all jobs in rows
- Show only visible columns
- Totals row always at bottom

**Loading State:**
- Show loading spinner: "Loading ledger data..."
- Disable buttons during load

**Empty State:**
- No jobs found: "No completed jobs found for this date range"
- Display empty table with headers and zero totals

**Error State:**
- API error: "Failed to load ledger. Please try again."
- Keep previous data visible if any

#### 6. Download Buttons
**CSV Download:**
- Trigger: `GET /api/ledger?start_date=X&end_date=Y&format=csv&columns=...`
- Include only visible columns in `columns` parameter
- Browser automatically downloads file
- Filename: `ledger_YYYY-MM-DD.csv` or `ledger_YYYY-MM-DD_to_YYYY-MM-DD.csv`

**PDF Download:**
- Trigger: `GET /api/ledger?start_date=X&end_date=Y&format=pdf&columns=...`
- Include only visible columns in `columns` parameter
- Browser automatically downloads file
- Filename: `ledger_YYYY-MM-DD.pdf` or `ledger_YYYY-MM-DD_to_YYYY-MM-DD.pdf`

**Validation:**
- If all columns hidden: Show error "Please select at least one column to export"
- Disable download buttons if no data loaded

### Table Structure

**Columns:**

| Column Name | Header | Data Type | Alignment | Example |
|-------------|--------|-----------|-----------|---------|
| job_number | Job Number | Text | Left | ABC0001 |
| customer_id | Customer ID | Text | Left | ABC |
| customer_name | Customer Name | Text | Left | Harsh Patel |
| aavak_vajan | Aavak Vajan (g) | Number | Right | 1000 |
| javak_vajan | Javak Vajan (g) | Number | Right | 1200 |
| bag_vajan | Bag Vajan (g) | Number | Right | 50 |
| customer_bag_weight | Customer Bag Weight (g) | Number | Right | 0 |
| ghat | Ghat (g) | Number | Right | 0 |
| fine | Fine (g) | Number | Right | 150 |

**Totals Row:**
- First column shows "TOTAL" label (bold)
- Other text columns empty
- Numeric columns show sum of all jobs
- Always visible at bottom of table

**Styling:**
- Responsive table (horizontal scroll on small screens)
- Alternating row colors for readability
- Bold header row
- Bold totals row
- Right-align numeric columns
- Left-align text columns

## Error Handling & Edge Cases

### Backend Error Handling

1. **Missing start_date:**
   - Return: `400 Bad Request`
   - Body: `{ "error": "start_date is required" }`

2. **Invalid date format:**
   - Return: `400 Bad Request`
   - Body: `{ "error": "Invalid date format. Use YYYY-MM-DD" }`

3. **end_date < start_date:**
   - Return: `400 Bad Request`
   - Body: `{ "error": "end_date must be >= start_date" }`

4. **Invalid format parameter:**
   - Return: `400 Bad Request`
   - Body: `{ "error": "format must be json, csv, or pdf" }`

5. **Database error:**
   - Return: `500 Internal Server Error`
   - Body: `{ "error": "Database error occurred" }`
   - Log error to console for debugging

6. **No data found:**
   - Return: `200 OK`
   - Body: Empty jobs array with zero totals (see JSON format above)

### Frontend Error Handling

1. **API Call Failure:**
   - Display error message: "Failed to load ledger. Please try again."
   - Keep previous data visible if any
   - Log error to console

2. **No Jobs Found:**
   - Display message: "No completed jobs found for this date range"
   - Show empty table with headers
   - Display zero totals

3. **Invalid Date Range:**
   - Client-side validation before API call
   - Show error: "End date must be on or after start date"
   - Don't make API call until fixed

4. **Download Failures:**
   - CSV/PDF download fails: Show error "Failed to download. Please try again."
   - Check browser console for details

5. **Large Date Range Warning:**
   - If range > 90 days: Show warning "Large date range may take time to load"
   - Still allow the request (don't block)

6. **All Columns Hidden:**
   - Show error when trying to export: "Please select at least one column to export"
   - Disable download buttons when no columns visible

### Edge Cases

#### 1. Jobs with NULL fine_amount
**Scenario:** Old jobs completed before fine calculation was implemented

**Handling:**
- Backend: Return `null` or `0` for fine_amount
- Frontend: Display as "0" in table
- Totals: Treat as 0 in sum calculation

#### 2. Negative Fine Values
**Scenario:** Silver lost during polishing (javak < aavak)

**Handling:**
- Display as-is: "-50" (negative number)
- Include in totals (sum can be negative)
- Formatting: Use red color or parentheses to highlight negatives

#### 3. Empty Customer Name
**Scenario:** Customer has no name in database (shouldn't happen but defensive)

**Handling:**
- Display customer_id only
- CSV/PDF: Show customer_id in name column

#### 4. Long Customer Names
**Scenario:** Name exceeds column width

**Handling:**
- Table: Truncate with ellipsis, show full name on hover (tooltip)
- CSV: No truncation (expand column width)
- PDF: Truncate with ellipsis to fit column

#### 5. Timezone Handling
**Context:** Database stores IST timestamps

**Handling:**
- Backend: Use `DATE(delivered_at)` to extract date portion
- Assumes server timezone is IST (as per existing implementation)
- All dates displayed and filtered in IST

#### 6. Browser Refresh
**Scenario:** User refreshes page while viewing ledger

**Handling:**
- State is lost (not persisted)
- Component remounts and loads today's data by default
- User must re-select date range if needed
- This is acceptable behavior

#### 7. Concurrent Data Updates
**Scenario:** Jobs completed while viewing ledger

**Handling:**
- Ledger shows snapshot at time of fetch
- User must click "Show Ledger" again to refresh
- No auto-refresh (keeps it simple)

#### 8. Column Filtering Parameter
**Scenario:** User hides some columns then downloads

**Handling:**
- Frontend sends `columns` parameter with visible column names
- Backend includes only those columns in CSV/PDF
- If parameter missing: Include all columns (default)

## Data Migration

**No database changes required.**

This feature reads existing data from:
- `jobs` table (all completion fields already exist)
- `customers` table (for customer names)

## Testing Strategy

### Backend API Tests

1. **Valid Requests:**
   - Single date, JSON format
   - Date range, JSON format
   - CSV download with all columns
   - PDF download with all columns
   - CSV download with filtered columns
   - PDF download with filtered columns

2. **Validation Tests:**
   - Missing start_date (expect 400)
   - Invalid date format (expect 400)
   - end_date < start_date (expect 400)
   - Invalid format parameter (expect 400)

3. **Data Tests:**
   - No jobs in range (expect empty results)
   - Single job in range
   - Multiple jobs in range
   - Jobs with negative fine
   - Jobs with NULL fine_amount

4. **Totals Calculation:**
   - Verify sums are correct
   - Verify negative fines included in sum
   - Verify NULL values treated as 0

### Frontend Component Tests

1. **Initial Load:**
   - Component loads today's date
   - Automatically fetches ledger
   - Displays results

2. **Quick Date Buttons:**
   - "Today" sets correct date
   - "Yesterday" sets correct date
   - "Last 7 Days" sets correct range

3. **Custom Date Selection:**
   - Can select custom range
   - "Show Ledger" fetches data
   - Error shown if end < start

4. **Column Visibility:**
   - Toggling checkbox hides/shows column
   - Hidden columns not in table
   - All columns can be toggled

5. **Downloads:**
   - CSV download triggers correct URL
   - PDF download triggers correct URL
   - Disabled when no data
   - Error shown when all columns hidden

6. **Error States:**
   - API error displays message
   - Empty data shows friendly message
   - Loading state displays spinner

### Manual Testing Checklist

- [ ] Load ledger tab, see today's data
- [ ] Click "Today" button
- [ ] Click "Yesterday" button
- [ ] Click "Last 7 Days" button
- [ ] Select custom date range and show ledger
- [ ] Try invalid range (end < start), see error
- [ ] Toggle column visibility checkboxes
- [ ] Verify totals row shows correct sums
- [ ] Download CSV with all columns
- [ ] Download CSV with some columns hidden
- [ ] Download PDF with all columns
- [ ] Download PDF with some columns hidden
- [ ] Try date with no jobs (see empty state)
- [ ] Verify negative fines display correctly
- [ ] Test with large date range (e.g., 1 year)

## Implementation Notes

### Technology Stack (Unchanged)
- Backend: Node.js + Express + SQLite3
- Frontend: React 19
- PDF Generation: PDFKit (already used for receipts)
- CSV Generation: Simple string concatenation or csv-stringify

### New Dependencies (Backend)
- None required (PDFKit already installed)
- Optional: `csv-stringify` for cleaner CSV generation (or use string concat)

### File Changes

**Backend:**
- `backend/server.js` - Add new `/api/ledger` endpoint with format handling

**Frontend:**
- `frontend/src/App.js` - Add third tab
- `frontend/src/components/DailyLedger.js` - New component
- `frontend/src/components/DailyLedger.css` - New styles

**No Database Changes Required**

### Reusable Patterns

**From Existing Code:**
- PDF generation pattern from `generateReceipt()` and `generateCompletionReceipt()`
- API error handling from existing endpoints
- Date handling in IST (already implemented)
- React component patterns from InitialBill and CompleteJob

## Future Considerations

**Not in Scope:**
- Auto-refresh/real-time updates
- Export to Excel (XLSX) format
- Email ledger reports
- Scheduled reports
- Charts/graphs
- Mobile app support
- Print preview before download

**Potential Future Enhancements:**
- Save/restore column visibility preferences
- Sort table by clicking column headers
- Search/filter within loaded data
- Comparison between date ranges
- Monthly/yearly summary views

## Success Criteria

Feature is complete when:

1. ✅ User can view ledger for today (auto-loaded on tab open)
2. ✅ Quick date buttons work (Today, Yesterday, Last 7 Days)
3. ✅ Custom date range selection works
4. ✅ All 9 columns display correctly
5. ✅ Column visibility checkboxes work
6. ✅ Totals row shows correct sums
7. ✅ CSV download works with all columns
8. ✅ CSV download respects hidden columns
9. ✅ PDF download works with all columns
10. ✅ PDF download respects hidden columns
11. ✅ Empty state handled gracefully
12. ✅ Errors handled gracefully
13. ✅ Negative fines display correctly
14. ✅ All weights displayed in grams

## Appendix: Example Scenarios

### Scenario 1: View Today's Ledger

**User Action:**
1. Click "Daily Ledger" tab

**System Behavior:**
- Loads today's date
- Fetches `/api/ledger?start_date=2026-05-05`
- Displays 3 completed jobs
- Shows totals: Fine = 450g

**Result:**
User sees all jobs completed today with detailed breakdown

---

### Scenario 2: Download Last 7 Days CSV

**User Action:**
1. Click "Last 7 Days" button
2. Hide "Customer ID" and "Ghat" columns
3. Click "Download CSV"

**System Behavior:**
- Sets date range: 2026-04-29 to 2026-05-05
- Fetches ledger data for 7 days
- Generates CSV URL: `/api/ledger?start_date=2026-04-29&end_date=2026-05-05&format=csv&columns=job_number,customer_name,aavak_vajan,javak_vajan,bag_vajan,customer_bag_weight,fine`
- Browser downloads: `ledger_2026-04-29_to_2026-05-05.csv`

**Result:**
CSV file contains 15 jobs with 7 visible columns (Customer ID and Ghat excluded)

---

### Scenario 3: No Jobs Found

**User Action:**
1. Select date: 2026-01-01 (future date with no jobs)
2. Click "Show Ledger"

**System Behavior:**
- Fetches `/api/ledger?start_date=2026-01-01`
- Receives empty jobs array
- Displays message: "No completed jobs found for this date range"
- Shows table headers with zero totals

**Result:**
User understands no jobs exist for that date, can try different date

---

### Scenario 4: Export All Columns as PDF

**User Action:**
1. View today's ledger
2. All columns visible
3. Click "Download PDF"

**System Behavior:**
- Generates PDF URL: `/api/ledger?start_date=2026-05-05&format=pdf`
- Server creates A4 landscape PDF with bordered table
- All 9 columns included
- Totals row at bottom
- Browser downloads: `ledger_2026-05-05.pdf`

**Result:**
Professional PDF report ready for printing or archiving

---

**End of Design Document**
