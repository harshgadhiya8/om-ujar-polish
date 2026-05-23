# Thermal Printer Integration Design

**Date:** 2026-05-23
**Status:** Approved

## Overview

Automatically print a physical receipt on the Scale+'s built-in thermal printer when a job is created (initial bill) or completed (completion receipt). If printing fails, the job still succeeds and the frontend shows a warning banner with a Reprint button. ESC/POS commands are sent via the existing RS-232 serial connection (`/dev/cu.usbserial-140`).

## Architecture

A `printReceipt(jobData, type)` function is added to `backend/server.js`. It writes ESC/POS bytes to the open `scalePort` serial connection. It is called inside the existing job create and job complete endpoints after the DB write succeeds. The print result is returned alongside the job data.

A new `POST /api/jobs/:jobNumber/reprint` endpoint allows the frontend Reprint button to retry printing.

The `scalePort` serial connection is bidirectional — the same open port used to read weight data also accepts write commands. No second connection needed.

## Data Flow

```
POST /api/jobs/initial
  → save job to DB
  → printReceipt(jobData, 'initial')   ← awaited, errors caught
  → return { job, printError: null | "error message" }

PUT /api/jobs/:jobNumber/complete
  → update job in DB
  → printReceipt(jobData, 'completion')
  → return { job, printError: null | "error message" }

POST /api/jobs/:jobNumber/reprint
  → fetch job from DB
  → detect type: if job.delivered_at is set → 'completion', else → 'initial'
  → printReceipt(jobData, type)
  → return { success: true } or { success: false, error: "message" }
```

## ESC/POS Receipt Content

### Initial Bill Receipt

| Element | Content |
|---|---|
| Header | "Aum Polish" (bold, centered) |
| Date/Time | IST date and time (right-aligned) |
| Separator | Dashed line |
| Job Number | Label + value |
| Customer | Name + ID |
| Aavak Vajan | `Math.floor(initial_weight)` g |
| Separator | Dashed line |
| Barcode | Code 128 of `job_number` |
| Paper cut | Full cut |

### Completion Receipt

| Element | Content |
|---|---|
| Header | "Aum Polish" (bold, centered) |
| Date/Time | IST date and time (right-aligned) |
| Separator | Dashed line |
| Customer | Name + ID |
| Javak Vajan | `Math.floor(final_weight)` g |
| Aavak Vajan | `Math.floor(initial_weight)` g |
| Bag Vajan | `Math.floor(plastic_bag_weight)` g |
| Ghat | `Math.floor(ghat)` g |
| Fine | `Math.floor(fine_amount)` g |
| Cust. Bag | `Math.floor(customer_bag_weight \|\| 0)` g |
| Separator | Dashed line |
| Barcode | Code 128 of `job_number` |
| Paper cut | Full cut |

## ESC/POS Key Commands

```
Initialize:       \x1B\x40
Bold on:          \x1B\x45\x01
Bold off:         \x1B\x45\x00
Center align:     \x1B\x61\x01
Right align:      \x1B\x61\x02
Left align:       \x1B\x61\x00
Code 128 barcode: \x1D\x6B\x49 + length byte + data bytes
Paper cut:        \x1D\x56\x42\x00
```

Printer width assumed: 58mm (32 characters per line at standard font).

## Backend Changes

| What | Where |
|---|---|
| `printReceipt(jobData, type)` function | `backend/server.js` (after serial port block) |
| Call `printReceipt` after DB write | `POST /api/jobs/initial` and `PUT /api/jobs/:jobNumber/complete` |
| `POST /api/jobs/:jobNumber/reprint` endpoint | `backend/server.js` |
| Return `printError` in job create/complete responses | Both endpoints |

## Frontend Changes

| What | Where |
|---|---|
| Read `printError` from response, show yellow warning banner | `InitialBill.js` |
| Reprint button calling `POST /api/jobs/:jobNumber/reprint` | `InitialBill.js` |
| Same warning banner + Reprint button | `CompleteJob.js` |

## Error Handling

- If `scalePort` is null or not open: print fails silently, `printError` set to `"Printer not connected"`
- If serial write times out or errors: caught, `printError` set to error message
- Job creation/completion always succeeds regardless of print outcome
- Reprint endpoint returns `{ success: false, error }` — frontend shows inline error

## Out of Scope

- Configurable printer width or ESC/POS font size
- Print queue / retry logic (one attempt per trigger, manual reprint via button)
- Any changes to the existing PDF download feature
