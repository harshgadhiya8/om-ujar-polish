# Job Completion Endpoint Test Plan

## Endpoint
PUT /api/jobs/:jobNumber/complete

## Test Cases

### 1. Positive Case - Successful Completion (Silver Added)
```bash
curl -X PUT http://localhost:3001/api/jobs/ABC0001/complete \
  -H "Content-Type: application/json" \
  -d '{"final_weight": 1.250, "plastic_bag_weight": 0.050}'
```

**Expected Result:**
- Status: 200 OK
- Response contains:
  - `success: true`
  - `message: "Job ABC0001 completed successfully"`
  - `job` object with all details including `delivered_at` timestamp
  - `calculations` object with:
    - `actual_ornament_weight: 1.200` (1.250 - 0.050)
    - `fine_amount: 0.950` (1.200 - 0.250 initial)
    - `fine_based_charge: 475.00` (0.950 × 500)
    - `service_charge: 125.00` (0.250 × 500)

### 2. Negative Fine Case - Silver Lost During Polishing
```bash
curl -X PUT http://localhost:3001/api/jobs/ABC0002/complete \
  -H "Content-Type: application/json" \
  -d '{"final_weight": 0.220, "plastic_bag_weight": 0.050}'
```

**Assumptions:** ABC0002 has initial_weight = 0.18kg

**Expected Result:**
- Status: 200 OK
- Response contains:
  - `success: true`
  - `calculations.fine_amount: -0.010` (0.170 - 0.180)
  - `calculations.fine_based_charge: -5.00` (-0.010 × 500)
  - `warning: "Warning: Silver lost during polishing: 10g"`

### 3. Validation Error - Missing final_weight
```bash
curl -X PUT http://localhost:3001/api/jobs/ABC0001/complete \
  -H "Content-Type: application/json" \
  -d '{"plastic_bag_weight": 0.050}'
```

**Expected Result:**
- Status: 400 Bad Request
- Error: "Both final_weight and plastic_bag_weight are required"

### 4. Validation Error - Missing plastic_bag_weight
```bash
curl -X PUT http://localhost:3001/api/jobs/ABC0001/complete \
  -H "Content-Type: application/json" \
  -d '{"final_weight": 1.250}'
```

**Expected Result:**
- Status: 400 Bad Request
- Error: "Both final_weight and plastic_bag_weight are required"

### 5. Validation Error - Invalid final_weight (zero)
```bash
curl -X PUT http://localhost:3001/api/jobs/ABC0001/complete \
  -H "Content-Type: application/json" \
  -d '{"final_weight": 0, "plastic_bag_weight": 0.050}'
```

**Expected Result:**
- Status: 400 Bad Request
- Error: "Invalid final weight"

### 6. Validation Error - Invalid final_weight (negative)
```bash
curl -X PUT http://localhost:3001/api/jobs/ABC0001/complete \
  -H "Content-Type: application/json" \
  -d '{"final_weight": -1.5, "plastic_bag_weight": 0.050}'
```

**Expected Result:**
- Status: 400 Bad Request
- Error: "Invalid final weight"

### 7. Validation Error - Invalid plastic_bag_weight (negative)
```bash
curl -X PUT http://localhost:3001/api/jobs/ABC0001/complete \
  -H "Content-Type: application/json" \
  -d '{"final_weight": 1.250, "plastic_bag_weight": -0.050}'
```

**Expected Result:**
- Status: 400 Bad Request
- Error: "Invalid plastic bag weight"

### 8. Validation Error - Final weight less than bag weight
```bash
curl -X PUT http://localhost:3001/api/jobs/ABC0001/complete \
  -H "Content-Type: application/json" \
  -d '{"final_weight": 0.040, "plastic_bag_weight": 0.050}'
```

**Expected Result:**
- Status: 400 Bad Request
- Error: "Final weight must be greater than plastic bag weight"

### 9. Validation Error - Final weight equal to bag weight
```bash
curl -X PUT http://localhost:3001/api/jobs/ABC0001/complete \
  -H "Content-Type: application/json" \
  -d '{"final_weight": 0.050, "plastic_bag_weight": 0.050}'
```

**Expected Result:**
- Status: 400 Bad Request
- Error: "Final weight must be greater than plastic bag weight"

### 10. Error Case - Job not found
```bash
curl -X PUT http://localhost:3001/api/jobs/NOTEXIST/complete \
  -H "Content-Type: application/json" \
  -d '{"final_weight": 1.250, "plastic_bag_weight": 0.050}'
```

**Expected Result:**
- Status: 404 Not Found
- Error: "Job NOTEXIST not found"

### 11. Error Case - Job already completed
**Prerequisites:** First complete ABC0001 using test case #1

```bash
curl -X PUT http://localhost:3001/api/jobs/ABC0001/complete \
  -H "Content-Type: application/json" \
  -d '{"final_weight": 1.250, "plastic_bag_weight": 0.050}'
```

**Expected Result:**
- Status: 400 Bad Request
- Error: "Job ABC0001 was already completed on [timestamp]"

## Database Verification

After successful completion, verify database state:

```bash
sqlite3 /Users/harsh/personal-project/om-ujar-palish \
  "SELECT job_number, final_weight, plastic_bag_weight, fine_amount, fine_based_charge, delivered_at
   FROM jobs WHERE job_number='ABC0001';"
```

**Expected:**
- final_weight: 1.25
- plastic_bag_weight: 0.05
- fine_amount: 0.95
- fine_based_charge: 475.0
- delivered_at: [timestamp]

## Implementation Checklist

- [x] Endpoint accepts PUT /api/jobs/:jobNumber/complete
- [x] Validates both final_weight and plastic_bag_weight are provided
- [x] Validates final_weight is positive number
- [x] Validates plastic_bag_weight is non-negative number
- [x] Validates final_weight > plastic_bag_weight
- [x] Checks if job exists (404 if not)
- [x] Checks if job already completed (400 if already completed)
- [x] Calculates actualOrnamentWeight = final_weight - plastic_bag_weight
- [x] Calculates fineAmount = actualOrnamentWeight - initial_weight
- [x] Calculates fineBasedCharge = fineAmount × service_rate_per_kg
- [x] Updates database with all completion data
- [x] Sets delivered_at timestamp
- [x] Returns complete job data with calculations
- [x] Includes warning message for negative fine
- [x] Comprehensive console logging throughout
- [x] Error handling for all database operations
