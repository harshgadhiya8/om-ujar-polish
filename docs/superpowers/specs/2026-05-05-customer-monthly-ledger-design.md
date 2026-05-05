# Customer Monthly Ledger - Design Specification

**Date:** 2026-05-05
**Status:** Approved
**Component:** Customer Monthly Ledger System

## Overview

Create a customer-centric monthly ledger view that allows users to search for a specific customer and view all their completed jobs for a given month. This complements the existing daily ledger by providing a customer-focused perspective with month-based filtering.

## Background

Current system has:
- Daily Ledger: Date-based view showing all completed jobs across all customers for a date range
- Customer database with job history

User requirement: View a specific customer's job history month-by-month for accounting and customer service purposes.

## User Requirements Summary

1. **Fourth tab** in main app for Customer Ledger
2. **Search** by customer name or customer ID
3. **Month selection** with quick buttons (This Month, Last Month) + custom month/year dropdowns
4. **Customer list view** initially showing all customers with job counts
5. **Job table** with individual rows + monthly totals
6. **Preset views**: Summary (5 columns) vs Detailed (9 columns)
7. **CSV and PDF downloads** respecting current view mode
8. **Same column structure** as daily ledger for consistency

## Architecture Overview

### System Components

**1. Backend API Endpoint:** `/api/customer-ledger`
- Mode 1 (List): Returns all customers with job counts
- Mode 2 (Detail): Returns specific customer's jobs for a month with totals
- Formats: JSON (default), CSV, PDF

**2. Frontend Component:** `CustomerLedger.js` (new fourth tab)
- Customer list/search view (initial state)
- Month selection controls (after customer selected)
- Job table with preset view toggles
- Download buttons (CSV/PDF)

**3. Shared Utilities:**
- Reuse date formatting helpers from daily ledger
- Create new CSV/PDF generators specific to customer view

### Navigation Flow

```
Main App → Fourth Tab "👤 Customer Ledger" → CustomerLedger component
```

### Data Flow

1. Component mounts → fetch all customers with counts
2. User searches/selects customer → update state, show month controls
3. User selects month → fetch jobs for that customer+month
4. Display table → toggle between summary/detailed views
5. Download → trigger CSV/PDF with current view settings

## Backend API Design

### Endpoint

`GET /api/customer-ledger`

### Mode 1: Customer List (No Parameters)

**Request:**
```
GET /api/customer-ledger
```

**Response:**
```json
{
  "customers": [
    {
      "customer_id": "ABC",
      "name": "Rajesh Kumar",
      "phone": "9876543210",
      "total_jobs": 5,
      "completed_jobs": 3
    },
    {
      "customer_id": "DEF",
      "name": "Priya Shah",
      "phone": "9123456789",
      "total_jobs": 8,
      "completed_jobs": 6
    }
  ]
}
```

**SQL Query:**
```sql
SELECT
  c.customer_id,
  c.name,
  c.phone,
  COUNT(j.id) as total_jobs,
  SUM(CASE WHEN j.status = 'completed' THEN 1 ELSE 0 END) as completed_jobs
FROM customers c
LEFT JOIN jobs j ON c.customer_id = j.customer_id
GROUP BY c.customer_id, c.name, c.phone
ORDER BY c.name ASC
```

### Mode 2: Customer Monthly Detail

**Request:**
```
GET /api/customer-ledger?customer_id=ABC&month=2026-05&format=json&view=detailed
```

**Query Parameters:**
- `customer_id` (required): Customer ID (e.g., "ABC")
- `month` (required): YYYY-MM format (e.g., "2026-05")
- `format` (optional): "json" | "csv" | "pdf" (default: "json")
- `view` (optional): "summary" | "detailed" (default: "detailed")

**Response (JSON):**
```json
{
  "customer_id": "ABC",
  "customer_name": "Rajesh Kumar",
  "month": "2026-05",
  "month_display": "May 2026",
  "view": "detailed",
  "jobs": [
    {
      "job_number": "ABC/P/050526",
      "delivered_at": "2026-05-05 14:30:00",
      "customer_id": "ABC",
      "customer_name": "Rajesh Kumar",
      "aavak_vajan": 1200,
      "javak_vajan": 1150,
      "bag_vajan": 2,
      "customer_bag_weight": 0,
      "ghat": 48,
      "fine": 50
    }
  ],
  "totals": {
    "total_jobs": 3,
    "aavak_vajan": 3500,
    "javak_vajan": 3400,
    "bag_vajan": 6,
    "customer_bag_weight": 0,
    "ghat": 94,
    "fine": 100
  }
}
```

**SQL Query:**
```sql
SELECT
  j.job_number,
  j.delivered_at,
  j.customer_id,
  c.name as customer_name,
  j.initial_weight as aavak_vajan,
  j.final_weight as javak_vajan,
  j.plastic_bag_weight as bag_vajan,
  j.customer_bag_weight,
  j.ghat,
  j.fine_amount as fine
FROM jobs j
JOIN customers c ON j.customer_id = c.customer_id
WHERE j.customer_id = ?
  AND j.status = 'completed'
  AND strftime('%Y-%m', j.delivered_at) = ?
ORDER BY j.delivered_at DESC
```

### Request Validation

**customer_id:**
- Must be provided for Mode 2
- Must exist in customers table
- If not found: HTTP 404, `{"error": "Customer ABC not found"}`

**month:**
- Must be provided for Mode 2
- Must match YYYY-MM pattern (regex: `^\d{4}-\d{2}$`)
- Month must be 01-12
- No restriction on future months (allow checking)
- If invalid: HTTP 400, `{"error": "Invalid month format. Use YYYY-MM (e.g., 2026-05)"}`

**format:**
- Optional, defaults to "json"
- Must be one of: "json", "csv", "pdf"
- If invalid: HTTP 400, `{"error": "Invalid format. Use json, csv, or pdf"}`

**view:**
- Optional, defaults to "detailed"
- Must be one of: "summary", "detailed"
- Controls which columns are included in response/export
- If invalid: HTTP 400, `{"error": "Invalid view. Use summary or detailed"}`

### Response Headers

**JSON format:**
```
Content-Type: application/json
```

**CSV format:**
```
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="customer_ledger_ABC_2026-05.csv"
Content-Length: <size>
```

**PDF format:**
```
Content-Type: application/pdf
Content-Disposition: attachment; filename="customer_ledger_ABC_2026-05.pdf"
Content-Length: <size>
```

## Frontend UI Design

### Component Structure

**File:** `frontend/src/components/CustomerLedger.js`
**Styles:** `frontend/src/components/CustomerLedger.css`

### State Management

```javascript
const [customers, setCustomers] = useState([]); // All customers list
const [selectedCustomer, setSelectedCustomer] = useState(null); // Selected customer object
const [searchQuery, setSearchQuery] = useState(''); // Search input
const [selectedMonth, setSelectedMonth] = useState(''); // Month name (e.g., "May")
const [selectedYear, setSelectedYear] = useState(''); // Year (e.g., "2026")
const [ledgerData, setLedgerData] = useState(null); // Jobs + totals
const [viewMode, setViewMode] = useState('detailed'); // 'summary' | 'detailed'
const [loading, setLoading] = useState(false);
const [error, setError] = useState(null);
```

### UI States

**State 1: Initial - Customer List**

Display when:
- Component first mounts
- No customer selected

Layout:
```
┌──────────────────────────────────────────┐
│ Customer Ledger                          │
├──────────────────────────────────────────┤
│ 🔍 Search customers...                   │
│ (search by name or customer ID)          │
├──────────────────────────────────────────┤
│ Customer List:                           │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ ABC - Rajesh Kumar                   │ │
│ │ 📞 9876543210                        │ │
│ │ Total: 5 jobs | Completed: 3 jobs   │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ DEF - Priya Shah                     │ │
│ │ 📞 9123456789                        │ │
│ │ Total: 8 jobs | Completed: 6 jobs   │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ ...                                      │
└──────────────────────────────────────────┘
```

Features:
- Search filters list in real-time (matches customer_id or name, case-insensitive)
- Click any customer card to select and move to State 2
- Show "No customers found" if search has no matches
- Show "No customers in the system" if database is empty

**State 2: Customer Selected - Month Selection**

Display when:
- Customer selected
- No month data loaded yet

Layout:
```
┌──────────────────────────────────────────┐
│ Customer Ledger: Rajesh Kumar (ABC)      │
│ [← Back to customer list]                │
├──────────────────────────────────────────┤
│ 📅 Select Month                          │
│                                          │
│ Quick Selection:                         │
│ [This Month] [Last Month]                │
│                                          │
│ Custom Selection:                        │
│ Month: [May        ▼]                    │
│ Year:  [2026       ▼]                    │
│ [Show Ledger]                            │
└──────────────────────────────────────────┘
```

Features:
- "Back" button returns to customer list (clears selection)
- "This Month" button auto-fetches current month
- "Last Month" button auto-fetches previous month
- Month dropdown: January through December
- Year dropdown: 2024 through current year only (prevent future)
- "Show Ledger" button triggers fetch with selected month/year

**State 3: Data Loaded - Job Table**

Display when:
- Customer selected
- Month data loaded

Layout:
```
┌──────────────────────────────────────────────────────────┐
│ Customer Ledger: Rajesh Kumar (ABC) - May 2026           │
│ [← Back] [📅 Change Month]                               │
├──────────────────────────────────────────────────────────┤
│ View Mode: [Summary] [Detailed ✓]                        │
├──────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────┐   │
│ │ Job Number │ Date  │ Aavak │ Javak │ ... │ Fine  │   │
│ ├────────────────────────────────────────────────────┤   │
│ │ ABC/P/0505 │ 5/5   │ 1200  │ 1150  │ ... │ 50    │   │
│ │ ABC/P/1205 │ 5/12  │ 1500  │ 1450  │ ... │ 30    │   │
│ │ ABC/P/2005 │ 5/20  │ 800   │ 800   │ ... │ 20    │   │
│ ├────────────────────────────────────────────────────┤   │
│ │ TOTAL      │       │ 3500  │ 3400  │ ... │ 100   │   │
│ └────────────────────────────────────────────────────┘   │
│                                                          │
│ [Download CSV] [Download PDF]                            │
└──────────────────────────────────────────────────────────┘
```

Features:
- "Back" button returns to customer list
- "Change Month" button returns to month selection (State 2)
- View mode toggle switches between summary/detailed columns
- Table shows all jobs sorted by delivered_at DESC (latest first)
- Totals row at bottom (bold, gray background)
- Download buttons respect current view mode
- Empty state if no jobs: "No completed jobs for this customer in May 2026"

### Column Definitions

**Summary View (5 columns):**
1. Job Number
2. Date (formatted from delivered_at as "M/D")
3. Aavak Vajan (g)
4. Javak Vajan (g)
5. Fine (g)

**Detailed View (10 columns):**
1. Date (formatted from delivered_at)
2. Job Number
3. Customer ID
4. Customer Name
5. Aavak Vajan (g)
6. Javak Vajan (g)
7. Bag Vajan (g)
8. Customer Bag Weight (g)
9. Ghat (g)
10. Fine (g)

Note: Date column added (not in daily ledger) because monthly view needs to show which day of the month each job was completed.

### Helper Functions

**getTodayMonth():** Returns current month in YYYY-MM format
**getLastMonth():** Returns previous month in YYYY-MM format (handles year boundary)
**formatDateForDisplay(isoString):** Converts "2026-05-05 14:30:00" to "5/5"
**formatMonthDisplay(yearMonthStr):** Converts "2026-05" to "May 2026"
**filterCustomers(customers, query):** Filters by customer_id or name (case-insensitive)

## CSV Export Design

### Format Structure

```
Customer Monthly Ledger
Customer: Rajesh Kumar (ABC)
Month: May 2026

[Column Headers]
[Data Rows]
[Totals Row]
```

### Column Headers (Based on View Mode)

**Summary View:**
```
Job Number,Date,Aavak Vajan (g),Javak Vajan (g),Fine (g)
```

**Detailed View:**
```
Date,Job Number,Customer ID,Customer Name,Aavak Vajan (g),Javak Vajan (g),Bag Vajan (g),Customer Bag Weight (g),Ghat (g),Fine (g)
```

### Data Row Example (Summary)

```
ABC/P/050526,2026-05-05,1200,1150,50
ABC/P/120526,2026-05-12,1500,1450,30
```

### Totals Row (Summary)

```
TOTAL,,3500,3400,100
```

Note: Empty cells for non-numeric columns

### CSV Security (RFC 4180 + Injection Prevention)

**Field Escaping Rules:**
1. If value starts with `=`, `+`, `-`, or `@`: prefix with single quote (`'`)
2. If value contains comma, double quote, newline, or carriage return: wrap in double quotes
3. Double quotes within values: escape by doubling (`""`)

**Example:**
- Customer name: `Kumar, Rajesh` → `"Kumar, Rajesh"`
- Formula injection attempt: `=1+1` → `'=1+1`
- Quote in name: `O"Brien` → `"O""Brien"`

**Encoding:**
- UTF-8 with BOM (`\uFEFF`) for Excel compatibility
- CRLF line endings (`\r\n`)

### Filename Format

```
customer_ledger_{customer_id}_{YYYY-MM}.csv
```

Examples:
- `customer_ledger_ABC_2026-05.csv`
- `customer_ledger_DEF_2026-04.csv`

### Backend Implementation

**Function:** `generateCustomerLedgerCSV(customerData, jobs, totals, view, res)`

**Parameters:**
- `customerData`: Object with customer_id, customer_name
- `jobs`: Array of job objects
- `totals`: Object with summed values
- `view`: "summary" | "detailed"
- `res`: Express response object

**Process:**
1. Build CSV header (UTF-8 BOM + title rows)
2. Determine columns based on view mode
3. Add column headers row
4. For each job: format and escape fields, add row
5. Add totals row with "TOTAL" label
6. Set response headers (Content-Type, Content-Disposition, Content-Length)
7. Send CSV buffer

**Error Handling:**
- Catch any errors during generation
- Log error server-side
- Return HTTP 500 with `{"error": "Failed to generate CSV"}`

## PDF Export Design

### Document Settings

**Page Size:** A4 Landscape (842 x 595 points)
**Margins:** 20 points all sides
**Font:** Helvetica (regular and bold)

### Header Section

```
─────────────────────────────────────────────────
Aum Polish
Customer Monthly Ledger

Customer: Rajesh Kumar (ABC)
Month: May 2026
─────────────────────────────────────────────────
```

**Styling:**
- "Aum Polish": 16pt bold, centered
- "Customer Monthly Ledger": 12pt regular, centered
- Customer info: 10pt regular, left-aligned
- Horizontal line: 0.5pt thickness

### Table Section

**Structure:** Bordered table with header row, data rows, totals row

**Columns:** Based on view mode (summary: 5 cols, detailed: 9 cols)

**Header Row:**
- Background: Blue (#007bff)
- Text: White, 9pt bold
- Borders: 0.5pt black lines
- Padding: 8pt vertical, 6pt horizontal
- Alignment: Numeric columns right-aligned, text columns left-aligned

**Data Rows:**
- Background: Alternating white / light gray (#f9f9f9)
- Text: Black, 8pt regular
- Borders: 0.5pt gray lines (#ddd)
- Padding: 6pt vertical, 6pt horizontal
- Alignment: Numeric right, text left
- Numeric values: Floor to integer (no decimals)

**Totals Row:**
- Background: Gray (#e9ecef)
- Text: Black, 8pt bold
- Borders: 0.5pt black lines (thicker than data rows)
- "TOTAL" label in first column
- Sums in numeric columns, empty for text columns

**Column Widths (Summary View):**
- Job Number: 25%
- Date: 15%
- Aavak Vajan: 20%
- Javak Vajan: 20%
- Fine: 20%

**Column Widths (Detailed View):**
- Auto-calculated to fit all 10 columns within page width
- Approximate: ~10% each, adjusted for content (Date column slightly narrower)

**Pagination:**
- If table exceeds one page, repeat headers on each page
- Footer on each page with page number

### Footer Section

```
─────────────────────────────────────────────────
Generated: 2026-05-05 15:30:45 IST
Total Jobs: 3
─────────────────────────────────────────────────
```

**Styling:**
- 8pt regular, centered
- Generated timestamp in IST timezone
- Total job count

### Filename Format

```
customer_ledger_{customer_id}_{YYYY-MM}.pdf
```

Examples:
- `customer_ledger_ABC_2026-05.pdf`
- `customer_ledger_DEF_2026-04.pdf`

### Backend Implementation

**Function:** `generateCustomerLedgerPDF(customerData, jobs, totals, view, res)`

**Parameters:**
- `customerData`: Object with customer_id, customer_name, month, month_display
- `jobs`: Array of job objects
- `totals`: Object with summed values
- `view`: "summary" | "detailed"
- `res`: Express response object

**Process:**
1. Create PDFDocument with A4 landscape settings
2. Set up stream handling (collect chunks, send on 'end' event)
3. Draw header section (title, customer info, line)
4. Build bordered table (headers, data rows, totals)
5. Draw footer section (timestamp, job count)
6. Finalize document with doc.end()
7. On 'end' event: set response headers and send PDF buffer

**Error Handling:**
- Try-catch around document creation
- Stream error handler (log only, cannot send response after stream starts)
- Outer catch: return HTTP 500 if error before stream starts

## Error Handling and Edge Cases

### Backend Validation Errors

**1. Invalid customer_id:**
- Check: Query customers table, verify customer exists
- Error: HTTP 404
- Response: `{"error": "Customer ABC not found"}`

**2. Invalid month format:**
- Check: Regex match `^\d{4}-\d{2}$`, month 01-12
- Error: HTTP 400
- Response: `{"error": "Invalid month format. Use YYYY-MM (e.g., 2026-05)"}`

**3. Invalid format parameter:**
- Check: Must be "json", "csv", or "pdf"
- Error: HTTP 400
- Response: `{"error": "Invalid format. Use json, csv, or pdf"}`

**4. Invalid view parameter:**
- Check: Must be "summary" or "detailed"
- Error: HTTP 400
- Response: `{"error": "Invalid view. Use summary or detailed"}`

**5. Database query error:**
- Check: Catch SQL errors
- Log error server-side with full stack trace
- Error: HTTP 500
- Response: `{"error": "Failed to fetch customer ledger"}`

**6. CSV generation error:**
- Check: Catch errors during CSV building
- Log error server-side
- Error: HTTP 500
- Response: `{"error": "Failed to generate CSV ledger"}`

**7. PDF generation error:**
- Check: Try-catch around PDFDocument creation
- Log error server-side
- Error: HTTP 500 (if before stream starts)
- Note: Cannot send error response after stream starts, only log

### Frontend Error Handling

**1. Network errors:**
- Display: "Failed to load data. Please try again."
- Keep existing data visible if any
- Clear error on next successful fetch

**2. API error responses:**
- Parse error message from response JSON
- Display: "Error: {message from API}"
- Example: "Error: Customer ABC not found"

**3. Empty customer list:**
- Display: "No customers found in the system"
- Hide search box
- Show message in center of view

**4. Search with no results:**
- Display: "No customers match your search"
- Show in place of customer list
- Keep search box visible

**5. Customer with no completed jobs:**
- Display: "No completed jobs for Rajesh Kumar (ABC) in May 2026"
- Hide job table
- Hide download buttons
- Show in empty state area

**6. Month selection before customer:**
- This shouldn't happen (UI prevents it)
- If it does: show error "Please select a customer first"

### Edge Cases

**1. Customer name/ID with special characters:**
- Search: Handle case-insensitive partial matching with `.toLowerCase()` and `.includes()`
- CSV: Escape special characters per RFC 4180
- PDF: PDFKit handles UTF-8 natively

**2. Very long customer names:**
- Customer list cards: Truncate with ellipsis after 40 characters
- Ledger header: Show full name (no truncation)
- CSV: Full name, properly escaped
- PDF: Full name, text wrapping if needed

**3. Many jobs in one month (50+ jobs):**
- No pagination - show all jobs in table
- Make table scrollable (CSS: `overflow-y: auto; max-height: 600px;`)
- CSV/PDF: Include all jobs (no limit)

**4. Download with no jobs:**
- Disable download buttons when `ledgerData.jobs.length === 0`
- Buttons grayed out with `cursor: not-allowed`

**5. Rapid month changes:**
- Cancel previous fetch if new month selected before response
- Show loading state during fetch
- Only update state with latest fetch result

**6. Customer deleted but has jobs:**
- Jobs table includes customer_name from join
- If customer somehow missing: show customer_id as fallback
- This shouldn't happen in practice (no customer deletion feature)

**7. Timezone considerations:**
- delivered_at already stored in IST (UTC+5:30)
- Display dates as-is from database
- Month filtering uses SQLite's `strftime('%Y-%m', delivered_at)` which works on stored values

**8. Future months:**
- Backend: Allow queries for future months (no restriction)
- Frontend: Limit year dropdown to current year and earlier
- But allow manual URL access to future months (edge case, harmless)

**9. Month with year boundary (December → January):**
- "Last Month" button must handle year decrement when current month is January
- JavaScript: `new Date(year, month - 1, 1)` handles this automatically

**10. Very large totals (10000+ grams):**
- Display: `Math.floor()` to integer, no thousands separator
- CSV/PDF: Same formatting, no special handling needed
- Example: 15234 g (not 15,234 g)

## Testing Considerations

### Backend API Tests

**Mode 1 (Customer List):**
1. No parameters → returns all customers with counts
2. Empty database → returns empty array
3. Customers with no jobs → total_jobs: 0, completed_jobs: 0

**Mode 2 (Customer Monthly Detail):**
1. Valid customer + valid month → returns jobs and totals
2. Valid customer + month with no jobs → empty jobs array, zero totals
3. Invalid customer ID → 404 error
4. Invalid month format → 400 error
5. Future month → empty jobs array (valid request)
6. CSV format → downloads CSV file with correct headers
7. PDF format → downloads PDF file with correct headers
8. Summary view → includes only 5 columns
9. Detailed view → includes all 9 columns

**Edge Cases:**
1. Customer name with commas → CSV escapes correctly
2. Customer ID with special chars → JSON response handles correctly
3. Month at year boundary (2026-12) → SQL query works correctly
4. Very large dataset (100+ jobs) → CSV/PDF generate successfully

### Frontend Component Tests

**Customer List View:**
1. Component mount → fetches all customers
2. Search typing → filters list in real-time
3. Search with no match → shows "No customers match"
4. Empty database → shows "No customers found"
5. Click customer card → transitions to month selection

**Month Selection View:**
1. "This Month" button → fetches current month
2. "Last Month" button → fetches previous month (handles year boundary)
3. Custom month/year → builds correct month string (YYYY-MM)
4. "Back" button → returns to customer list

**Job Table View:**
1. Data loads → displays table with all jobs
2. Toggle Summary → shows 5 columns
3. Toggle Detailed → shows 9 columns
4. No jobs → shows empty state
5. Totals row → sums are correct
6. Download CSV → triggers download with correct filename
7. Download PDF → triggers download with correct filename
8. Download with Summary view → URL includes view=summary
9. Download with Detailed view → URL includes view=detailed

**Error States:**
1. Network error → displays error message
2. Invalid customer → displays API error message
3. Search during loading → doesn't crash

### Manual Testing Checklist

**Happy Path:**
1. Open Customer Ledger tab → see customer list
2. Search for "Rajesh" → see filtered results
3. Click customer → see month selection
4. Click "This Month" → see job table
5. Toggle Summary/Detailed → table updates
6. Download CSV → file downloads correctly
7. Download PDF → file downloads correctly
8. Click "Back" → returns to customer list

**Edge Cases:**
1. Search with no results → see "No customers match"
2. Customer with no jobs this month → see empty state
3. Download with no jobs → buttons disabled
4. Rapid month changes → only latest data displays
5. Very long customer name → truncates in list, full in header

## Success Criteria

1. ✅ Fourth tab "Customer Ledger" appears in main app
2. ✅ Customer list loads on mount with job counts
3. ✅ Search filters by name or ID (case-insensitive)
4. ✅ Month selection works with quick buttons and custom dropdowns
5. ✅ Job table displays all jobs for selected customer+month
6. ✅ Summary view shows 5 columns, Detailed shows 9 columns
7. ✅ Totals row displays correct sums
8. ✅ CSV download works with correct format and filename
9. ✅ PDF download works with professional layout
10. ✅ Downloads respect current view mode
11. ✅ All error states handled gracefully
12. ✅ UI is consistent with daily ledger styling

## Non-Goals

- Not adding customer deletion/editing features
- Not adding pagination (show all jobs for the month)
- Not adding date range filtering (month-only, not custom ranges)
- Not modifying existing daily ledger component
- Not adding job-level drill-down (just table view)
- Not adding multi-customer comparison views
- Not adding year-to-date summaries (month-only scope)

## Future Enhancements (Out of Scope)

- Export to Excel (.xlsx) format
- Email ledger to customer
- Print preview before download
- Customer-specific notes/annotations
- Year-over-year comparison views
- Graphical charts/visualizations
- Filtering by ornament type
- Sorting by different columns
