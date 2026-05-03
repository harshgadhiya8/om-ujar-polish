# Initial Job Slip - Thermal Receipt Format Design

**Date:** 2026-05-03
**Status:** Approved
**Component:** Initial Job Receipt PDF Generation

## Overview

Redesign the initial job slip to match a compact thermal receipt format with table-based layout. The goal is to reduce horizontal width from 8cm to thermal standard (5.8cm), implement a bordered table structure for data fields, and minimize white space while maintaining readability.

## Background

Current implementation (`backend/server.js::generateReceipt()`):
- Width: 8cm (227 points)
- Height: 6cm (170 points)
- Layout: Header row, then label/value pairs with horizontal lines
- Large margins (10 points)
- Barcode centered at bottom

User requirement: Match the structure of physical thermal receipts with:
- Narrower width suitable for thermal printers
- Table format with bordered cells (like reference image)
- Compact spacing, minimal white space
- Space for handwritten remarks

## Design Decisions

### Approach Selection

Three approaches were considered:
1. **Single-Column Table** (Selected) - Bordered table, one field per row, familiar structure
2. Hybrid Compact - Combined date/time, taller cells for readability
3. Ultra-Minimal - No borders, just divider lines

**Rationale:** Approach A matches the reference image structure most closely and provides clear visual separation between fields through bordered cells.

### Dimensions

**Page Size:**
- Width: 5.8cm (165 points at 72 DPI) - standard thermal receipt width
- Height: Auto-sized (~6.5-7.5cm / 185-213 points) - fits content compactly
- Margins: 5 points (reduced from 10) - tighter spacing for thermal format

**Font Sizes:**
- Header "Aum Polish": 10pt bold
- Date/Time: 7pt regular
- Table labels: 8pt bold
- Table values: 8pt regular

**Spacing:**
- Header section height: ~25 points
- Table cell padding: 3-4 points
- Table row height: ~15 points each
- Barcode gap: 5-8 points above barcode
- Border width: 0.5pt

### Layout Structure

#### 1. Header Section (Unchanged from Current)
- Left: "Aum Polish" (10pt bold)
- Right: Date (7pt) and Time (7pt) stacked
- Horizontal line separator below
- No changes to existing header logic

#### 2. Data Table (New - Bordered Cell Format)
Three rows with bordered cells:

| Label (40% width, bold) | Value (60% width, regular) |
|-------------------------|----------------------------|
| Job Number | ABC/P/412026 |
| Name | Customer Name (ID) |
| Aavak Vajan | XXX g |

**Table specifications:**
- Full width table (margin to margin)
- Label column: ~66 points (40%)
- Value column: ~99 points (60%)
- Cell borders: 0.5pt thin lines on all sides
- Cell padding: 3-4 points
- Row height: ~15 points per row

**Field Details:**
- **Job Number:** Display full job number (format: XXX/P/DDMMYY)
- **Name:** Display as `customer_name (customer_id)`
- **Aavak Vajan:** Display as `Math.floor(initial_weight) g`

#### 3. Barcode Section (Modified Layout)
- Barcode positioned left (~100pt width, 35pt height)
- Leaves ~50-60pt empty space on right side
- Purpose: Right space allows handwritten remarks on printed slip
- Small gap (5-8 points) above barcode for visual separation

## Technical Implementation

### Changes Required

**File:** `backend/server.js`
**Function:** `generateReceipt(jobData)`

**Modifications:**
1. Update PDFDocument size from `[227, 170]` to `[165, ~210]` (height auto-sized)
2. Reduce margin from 10 to 5
3. Keep existing header logic (lines 311-318)
4. Replace lines 320-349 (current label/value layout) with table generation
5. Update barcode positioning (lines 352-366) - left align instead of center

### Table Generation Logic

```javascript
// After header and line (around line 319)
const tableStartY = doc.y + 5;
const tableX = 5;
const tableWidth = 155; // 165 - (2 * 5 margin)
const labelWidth = 66; // 40% of table
const valueWidth = 99; // 60% of table
const rowHeight = 15;
const cellPadding = 3;

const rows = [
    { label: 'Job Number', value: jobData.job_number },
    { label: 'Name', value: `${jobData.customer_name} (${jobData.customer_id})` },
    { label: 'Aavak Vajan', value: `${Math.floor(jobData.initial_weight)} g` }
];

// Draw table
let currentY = tableStartY;
rows.forEach((row, index) => {
    // Draw cell borders
    doc.rect(tableX, currentY, labelWidth, rowHeight).stroke();
    doc.rect(tableX + labelWidth, currentY, valueWidth, rowHeight).stroke();

    // Draw label text (bold)
    doc.fontSize(8).font('Helvetica-Bold');
    doc.text(row.label, tableX + cellPadding, currentY + cellPadding, {
        width: labelWidth - (2 * cellPadding),
        height: rowHeight - (2 * cellPadding),
        align: 'left'
    });

    // Draw value text (regular)
    doc.font('Helvetica');
    doc.text(row.value, tableX + labelWidth + cellPadding, currentY + cellPadding, {
        width: valueWidth - (2 * cellPadding),
        height: rowHeight - (2 * cellPadding),
        align: 'left'
    });

    currentY += rowHeight;
});
```

### Barcode Positioning

```javascript
// Position barcode on left with space for remarks on right
const barcodeY = currentY + 8; // Small gap after table
const barcodeX = 10; // Left aligned
const barcodeWidth = 100; // Narrower to leave right space
const barcodeHeight = 35;

if (jobData.barcode) {
    const barcodeBuffer = Buffer.from(jobData.barcode, 'base64');
    doc.image(barcodeBuffer, barcodeX, barcodeY, {
        fit: [barcodeWidth, barcodeHeight]
    });
}
// Right side (from ~110pt to 160pt) left empty for handwritten remarks
```

## Data Flow

No changes to data flow - same input `jobData` object with fields:
- `job_number`
- `customer_name`
- `customer_id`
- `initial_weight`
- `barcode` (base64 encoded image)

## Error Handling

Maintain existing error handling:
- Barcode rendering errors caught and logged (continue without barcode)
- Promise-based PDF generation with reject on errors

## Testing Considerations

1. **Visual verification:** Print test receipt and verify:
   - Table borders render cleanly
   - Text fits within cells without overflow
   - Barcode is scannable
   - Right space is adequate for handwritten notes

2. **Edge cases:**
   - Long customer names (test 30+ character names)
   - Large weight values (test 4-5 digit weights)
   - Missing barcode data

3. **Print compatibility:**
   - Test on actual thermal printer
   - Verify 5.8cm width compatibility
   - Check that borders print clearly (not too thin)

## Non-Goals

- Not changing completion receipt format (separate function)
- Not modifying frontend InitialBill.js component
- Not changing API endpoints or data structures
- Not adding new fields or removing existing ones

## Success Criteria

1. Receipt width reduced from 8cm to 5.8cm
2. Data fields presented in bordered table format
3. Minimal white space with compact layout
4. Barcode positioned left with space for remarks on right
5. Receipt prints clearly on thermal printers
6. All existing functionality preserved (download, job creation flow)
