# Design Document: Expense & Budget Visualization

## Overview

The Expense & Budget Visualization app is a zero-dependency, client-side single-page application (SPA) that runs directly from `index.html`. Users can record personal expense transactions, view a running total balance, browse a scrollable list of entries, delete individual transactions, and see spending broken down by category in a live-updating pie chart. All data is stored in the browser's Local Storage; no server, build tool, or package manager is required.

The app is structured as a single HTML file, one CSS file (`css/style.css`), and one JavaScript file (`js/app.js`). Chart.js is loaded from a CDN. If the CDN is unreachable, a static fallback message is shown in place of the pie chart.

### Tech Stack

| Concern | Choice | Rationale |
|---|---|---|
| Markup | HTML5 (semantic elements) | Accessibility, keyboard nav, no framework |
| Styling | CSS3 (single file) | Simple layout, CSS custom properties for theming |
| Logic | Vanilla JavaScript (ES6+) | No framework constraint |
| Chart | Chart.js v4 via CDN | Lightweight, well-documented, pie chart support |
| Persistence | `window.localStorage` | No backend, browser-native, synchronous API |

---

## Architecture

The app follows a **layered module pattern** implemented inside a single JS file. Each module is an object literal (or IIFE) with a clear responsibility boundary. Modules communicate through a thin **event bus** (custom events on `document`) so that the UI layer never directly calls the storage layer and vice versa.

```
┌─────────────────────────────────────────────────┐
│                    index.html                   │
│  ┌──────────────────────────────────────────┐   │
│  │               js/app.js                  │   │
│  │                                          │   │
│  │  ┌────────────┐   ┌──────────────────┐   │   │
│  │  │  Validator  │   │  StorageManager  │   │   │
│  │  └─────┬──────┘   └────────┬─────────┘   │   │
│  │        │                   │             │   │
│  │  ┌─────▼───────────────────▼──────────┐  │   │
│  │  │         TransactionManager         │  │   │
│  │  └─────────────────┬──────────────────┘  │   │
│  │                    │ (custom events)      │   │
│  │  ┌─────────────────▼──────────────────┐  │   │
│  │  │            UIRenderer              │  │   │
│  │  └──────────────┬─────────────────────┘  │   │
│  │                 │                         │   │
│  │  ┌──────────────▼──────────────────────┐ │   │
│  │  │           ChartManager              │ │   │
│  │  └─────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### Data Flow: Add Transaction

```
User fills form → [submit event]
  → Validator.validate(formData)        // sync validation
      ↓ invalid → UIRenderer.showError()
      ↓ valid
  → TransactionManager.add(transaction) // creates Transaction object
      → StorageManager.save(list)       // write to LocalStorage first
          ↓ failure → UIRenderer.showStorageError(); abort
          ↓ success
      → dispatch 'transactions:changed'
  → UIRenderer.renderList(list)
  → UIRenderer.renderBalance(total)
  → ChartManager.update(categoryTotals)
  → UIRenderer.resetForm()
```

### Data Flow: Delete Transaction

```
User clicks delete → [click event] → UIRenderer shows confirm prompt
  → User cancels → nothing
  → User confirms
      → TransactionManager.remove(id)
          → StorageManager.save(updatedList)  // write first
              ↓ failure → UIRenderer.showStorageError(); abort
              ↓ success
          → dispatch 'transactions:changed'
      → UIRenderer.renderList(updatedList)
      → UIRenderer.renderBalance(newTotal)
      → ChartManager.update(newCategoryTotals)
```

### Data Flow: App Initialization

```
DOMContentLoaded
  → StorageManager.load()               // read from LocalStorage
      ↓ failure/empty → show error (if failure) or empty state
      ↓ success
  → TransactionManager.setList(list)
  → UIRenderer.renderList(list)
  → UIRenderer.renderBalance(total)
  → ChartManager.init(categoryTotals)   // load Chart.js, render or fallback
```

---

## Components and Interfaces

### StorageManager

Responsible for all reads and writes to `localStorage`. All methods are synchronous and wrap operations in `try/catch` to surface failures without crashing.

```js
StorageManager = {
  STORAGE_KEY: 'ebv_transactions',

  // Returns parsed array of transactions, or [] on empty/failure.
  // Throws StorageError if JSON.parse fails or localStorage is inaccessible.
  load(): Transaction[],

  // Serializes list to JSON and writes to localStorage.
  // Throws StorageError if write fails (e.g., quota exceeded, private browsing).
  save(list: Transaction[]): void,
}
```

**Error type**: A plain object `{ type: 'StorageError', message: string }` is thrown and caught by the calling layer.

---

### Validator

Pure validation logic with no DOM or storage side effects.

```js
Validator = {
  // Returns { valid: true } or { valid: false, errors: { name?, amount?, category? } }
  validate(formData: { name: string, amount: string, category: string }): ValidationResult,

  // Individual field checks (used internally and in tests)
  isValidName(name: string): boolean,       // non-empty, ≤100 chars
  isValidAmount(amount: string): boolean,   // parseable, 0.01–999999999.99
  isValidCategory(cat: string): boolean,    // 'Food' | 'Transport' | 'Fun'
}
```

---

### TransactionManager

Manages the in-memory list of transactions and coordinates with StorageManager. Acts as the single source of truth during a session.

```js
TransactionManager = {
  _list: Transaction[],  // in-memory state

  // Called on init. Sets internal list without calling StorageManager.
  setList(list: Transaction[]): void,

  // Validates, creates a Transaction, persists it, then dispatches 'transactions:changed'.
  // Throws if storage fails.
  add(formData: RawFormData): Transaction,

  // Finds transaction by id, removes it, persists, then dispatches 'transactions:changed'.
  // Throws if storage fails.
  remove(id: string): void,

  // Returns a shallow copy of the current list.
  getList(): Transaction[],

  // Returns the sum of all valid transaction amounts.
  getTotal(): number,

  // Returns { Food: number, Transport: number, Fun: number } with totals per category.
  getCategoryTotals(): CategoryTotals,
}
```

---

### UIRenderer

All DOM manipulation lives here. Reads from the DOM only to reset forms. Never reads from StorageManager directly.

```js
UIRenderer = {
  // Renders the full transaction list. Clears container first.
  renderList(list: Transaction[]): void,

  // Updates the balance display element.
  renderBalance(total: number): void,

  // Resets all Input_Form fields to default/empty state.
  resetForm(): void,

  // Shows an inline error message next to a specific field.
  // fieldId: 'name' | 'amount' | 'category'
  showFieldError(fieldId: string, message: string): void,

  // Clears all field error messages.
  clearErrors(): void,

  // Displays a dismissible top-level error banner (storage failures, etc.).
  showErrorBanner(message: string): void,

  // Hides the error banner.
  hideErrorBanner(): void,

  // Shows the native browser confirm dialog. Returns true if confirmed.
  confirmDelete(transactionName: string): boolean,
}
```

---

### ChartManager

Encapsulates all Chart.js interaction. Manages CDN availability detection and fallback rendering.

```js
ChartManager = {
  _chart: Chart | null,
  _canvas: HTMLCanvasElement,
  _fallbackContainer: HTMLElement,

  // Called once on DOMContentLoaded. Checks if Chart is defined.
  // If Chart.js loaded: renders pie chart with categoryTotals.
  // If Chart.js missing: shows text fallback.
  init(categoryTotals: CategoryTotals): void,

  // Updates existing chart data or re-renders.
  // If no transactions: shows placeholder state (empty chart message).
  // If Chart.js missing: updates fallback text.
  update(categoryTotals: CategoryTotals): void,

  // Returns true if Chart.js is available (window.Chart is defined).
  isAvailable(): boolean,

  // Renders a static text breakdown in the fallback container.
  _renderFallback(categoryTotals: CategoryTotals): void,
}
```

---

## Data Models

### Transaction

The core domain object. Immutable once created (create a new object to represent any change).

```js
/**
 * @typedef {Object} Transaction
 * @property {string}  id        - UUID-like string, generated at creation time (crypto.randomUUID or Date.now() fallback)
 * @property {string}  name      - Item name, 1–100 characters
 * @property {number}  amount    - Monetary value, 0.01–999999999.99, stored as a JS number
 * @property {string}  category  - 'Food' | 'Transport' | 'Fun'
 * @property {string}  createdAt - ISO 8601 timestamp string (new Date().toISOString())
 */
```

**Serialization**: The `Transaction[]` array is stored as a JSON string under the key `ebv_transactions`. Round-trip fidelity: all fields survive `JSON.stringify` / `JSON.parse` without loss because `number` precision is within JSON safe range and all other fields are strings.

### RawFormData

```js
/**
 * @typedef {Object} RawFormData
 * @property {string} name     - Raw text input value (trimmed before validation)
 * @property {string} amount   - Raw text input value (parsed to float after validation)
 * @property {string} category - Selected option value
 */
```

### ValidationResult

```js
/**
 * @typedef {Object} ValidationResult
 * @property {boolean}  valid   - True if all fields pass; false otherwise
 * @property {Object}   [errors]
 * @property {string}   [errors.name]     - Error message for name field
 * @property {string}   [errors.amount]   - Error message for amount field
 * @property {string}   [errors.category] - Error message for category field
 */
```

### CategoryTotals

```js
/**
 * @typedef {Object} CategoryTotals
 * @property {number} Food      - Sum of Food transaction amounts (>0 only)
 * @property {number} Transport - Sum of Transport transaction amounts (>0 only)
 * @property {number} Fun       - Sum of Fun transaction amounts (>0 only)
 */
```

### StorageError

```js
/**
 * @typedef {Object} StorageError
 * @property {'StorageError'} type
 * @property {string}         message
 */
```

---

## Layout Structure

```
┌────────────────────────────────────────────┐
│  Balance_Display  ($XXX.XX)                │  ← always visible, top
├────────────────────────────────────────────┤
│  Input_Form                                │
│  [Item Name] [Amount] [Category ▼] [Add]   │
│  (inline error messages per field)         │
├────────────────────────────────────────────┤
│  Transaction_List (scrollable)             │
│  ┌──────────────────────────────────────┐  │
│  │ Name         $XX.XX  Category  [🗑]  │  │
│  │ ...                                  │  │
│  └──────────────────────────────────────┘  │
├────────────────────────────────────────────┤
│  Pie_Chart  (Chart.js canvas)              │
│  or fallback text if CDN unreachable       │
└────────────────────────────────────────────┘
```

### HTML IDs / ARIA roles (key elements)

| Element | ID | Role / Tag |
|---|---|---|
| Balance display | `balance-display` | `<output>` or `<p aria-live="polite">` |
| Input form | `transaction-form` | `<form>` |
| Name input | `input-name` | `<input type="text">` |
| Amount input | `input-amount` | `<input type="number">` |
| Category select | `input-category` | `<select>` |
| Submit button | `btn-add` | `<button type="submit">` |
| Transaction list | `transaction-list` | `<ul>` |
| Chart canvas | `chart-canvas` | `<canvas>` |
| Chart fallback | `chart-fallback` | `<div aria-live="polite">` |
| Error banner | `error-banner` | `<div role="alert">` |

---

## Key Algorithms

### ID Generation

```js
function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
```

### Balance Calculation

```js
function computeTotal(list) {
  return list.reduce((sum, t) => {
    const n = parseFloat(t.amount);
    return sum + (isFinite(n) && n > 0 ? n : 0);
  }, 0);
}
```

### Category Totals Calculation

```js
function computeCategoryTotals(list) {
  const totals = { Food: 0, Transport: 0, Fun: 0 };
  list.forEach(t => {
    const n = parseFloat(t.amount);
    if (totals.hasOwnProperty(t.category) && isFinite(n) && n > 0) {
      totals[t.category] += n;
    }
  });
  return totals;
}
```

### Currency Formatting

```js
function formatCurrency(amount) {
  return '$' + Number(amount).toFixed(2);
}
```

### Pie Chart Segment Percentage

Each segment label shows the category's share of total:

```
percentage = (categoryTotal / sumOfAllCategoryTotals) * 100
```

Rounded to one decimal place (`toFixed(1)`). Categories with zero total are excluded entirely (no segment rendered).

### Storage Write-Before-Update Pattern

To ensure UI and storage stay consistent, storage is always written _before_ DOM updates are applied. If the write throws, the DOM update is aborted:

```js
function addTransaction(formData) {
  const tx = createTransaction(formData);
  const newList = [...TransactionManager._list, tx];
  StorageManager.save(newList);     // throws on failure → caught upstream
  TransactionManager._list = newList;
  document.dispatchEvent(new CustomEvent('transactions:changed'));
}
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Transaction serialization round-trip

*For any* valid Transaction object (name 1–100 chars, amount in range 0.01–999999999.99, category in {Food, Transport, Fun}), serializing the transaction list to JSON and then deserializing it SHALL produce a list containing an equivalent Transaction with all fields (id, name, amount, category, createdAt) identical to the original.

**Validates: Requirements 6.6**

---

### Property 2: Adding a transaction grows the list by exactly one

*For any* transaction list and any valid form data (non-empty name, amount in 0.01–999999999.99, valid category), calling `add()` SHALL increase the list length by exactly one, and the new entry's fields SHALL match the submitted form data.

**Validates: Requirements 1.2**

---

### Property 3: Balance sums only finite positive amounts

*For any* transaction list (including lists with zero, negative, or non-numeric amounts), the balance computed by `computeTotal()` SHALL equal the sum of only the amounts that are finite numbers greater than zero, excluding all others.

**Validates: Requirements 4.2, 4.5**

---

### Property 4: Validator rejects all invalid inputs

*For any* form submission where the name field is empty or composed entirely of whitespace, OR the amount is outside the range 0.01–999999999.99, is zero, negative, or non-numeric, OR the category is not one of {Food, Transport, Fun}, the `Validator.validate()` function SHALL return `{ valid: false }` with at least one field error populated.

**Validates: Requirements 1.4, 1.5**

---

### Property 5: Delete removes exactly the targeted transaction

*For any* transaction list containing at least one transaction, calling `remove(id)` with a valid id SHALL produce a list of length `n − 1` that contains no transaction whose `id` matches the removed id, while all other transactions remain in the list unchanged.

**Validates: Requirements 3.3**

---

### Property 6: Balance is consistent with list state after any mutation

*For any* sequence of add and delete operations, the value returned by `TransactionManager.getTotal()` immediately after the operation SHALL equal `computeTotal(TransactionManager.getList())`, confirming no stale state between the list and the displayed balance.

**Validates: Requirements 4.3**

---

### Property 7: Pie chart segments exactly match categories with positive totals

*For any* transaction list, the set of category keys with a positive total in `computeCategoryTotals()` SHALL exactly equal the set of segments rendered by ChartManager — no segment for a zero-total category, and no missing segment for a positive-total category.

**Validates: Requirements 5.1, 5.3, 5.5**

---

### Property 8: Chart segment percentages sum to 100% and are correctly rounded

*For any* set of category totals where at least one category has a positive value, each segment's displayed percentage SHALL equal `(categoryTotal / sumOfAllPositiveTotals) × 100` rounded to one decimal place, and the sum of all displayed percentages SHALL be within 0.1% of 100% (accounting for rounding).

**Validates: Requirements 5.4**

---

### Property 9: Rendered transaction list is complete and includes delete controls

*For any* transaction list of length `n`, `UIRenderer.renderList()` SHALL produce exactly `n` list items in the DOM, each containing the transaction's name, formatted amount, category, and a delete control element.

**Validates: Requirements 2.1, 3.1**

---

## Error Handling

| Scenario | Detection | Response |
|---|---|---|
| Empty or invalid form fields | `Validator.validate()` returns errors | Inline field error messages; form NOT submitted |
| Amount out of range / non-numeric | `Validator.isValidAmount()` returns false | Inline amount error; form NOT submitted |
| Storage write failure (add) | `StorageManager.save()` throws | Error banner shown; transaction NOT added to list |
| Storage write failure (delete) | `StorageManager.save()` throws | Error banner shown; transaction retained in list |
| Storage read failure (init) | `StorageManager.load()` throws | Error banner shown; app starts with empty in-memory state |
| Chart.js CDN unreachable | `typeof window.Chart === 'undefined'` at init | Static fallback text rendered; no uncaught error |
| Transaction with invalid amount in stored list | `isFinite(n) && n > 0` check in compute functions | Silently excluded from totals and chart; does not crash |

All error messages are displayed in dedicated DOM containers (`role="alert"` or `aria-live="polite"`) so screen readers announce them automatically.

Error banners are dismissible (×  button) and auto-cleared on the next successful operation.

---

## Testing Strategy

### Unit Tests (example-based)

Focus on concrete, deterministic scenarios:

- `Validator.validate()` with each invalid combination of inputs
- `computeTotal()` with mixed valid, zero, and negative amounts
- `computeCategoryTotals()` with transactions across all three categories
- `StorageManager.load()` with malformed JSON string in localStorage
- `StorageManager.save()` when `localStorage.setItem` throws `DOMException`
- `generateId()` uniqueness for a batch of calls
- `formatCurrency()` with representative values (0, 0.01, 1234.5, 999999999.99)
- `UIRenderer.renderList()` with empty list (empty-state message rendered)
- `ChartManager.init()` when `window.Chart` is undefined (fallback renders)

### Property-Based Tests

The app uses logic-heavy pure functions (validation, balance computation, serialization) that are ideal for property-based testing. The recommended library is **[fast-check](https://github.com/dubzzz/fast-check)** (JavaScript, no build tool required when loaded via CDN or in a Node.js test runner).

Each test is configured to run a minimum of **100 iterations**.

Tag format: `// Feature: expense-budget-visualization, Property N: <property_text>`

| Property | Test Description |
|---|---|
| P1: Serialization round-trip | Generate random valid Transaction arrays → `JSON.stringify` → `JSON.parse` → assert deep-equal to original |
| P2: Add grows list by exactly one | Generate random list + valid form data → `add()` → assert `length + 1` and new entry fields match input |
| P3: Balance sums only finite positive amounts | Generate lists with mixed positive/zero/negative/NaN amounts → assert `computeTotal()` equals sum of only `> 0` finite values |
| P4: Validator rejects all invalid inputs | Generate names that are empty/whitespace-only; amounts that are 0, negative, too large, or non-numeric → assert `validate()` returns `{ valid: false }` |
| P5: Delete removes exactly the targeted transaction | Generate list with ≥1 transaction → `remove(id)` → assert id absent in result and `length − 1` |
| P6: Balance consistency after mutation | Generate list, apply random add or remove → assert `getTotal()` equals `computeTotal(getList())` |
| P7: Chart segments match positive-total categories | Generate lists → `computeCategoryTotals()` → assert segment count and keys match categories with `total > 0` |
| P8: Chart percentages sum to ~100% | Generate random category totals (≥1 positive) → compute percentages → assert sum within 0.1% of 100 and each rounded to 1 decimal |
| P9: Rendered list completeness | Generate random transaction list of length n → `renderList()` → assert exactly n DOM list items each with name, amount, category, delete control |

### Integration / Smoke Tests

- Open `index.html` in Chrome/Firefox/Edge/Safari — verify no JS console errors on load
- Verify LocalStorage key `ebv_transactions` is written after form submit
- Verify app loads correctly after manually setting malformed JSON in LocalStorage
- Verify pie chart falls back gracefully by blocking the Chart.js CDN URL
- Verify keyboard navigation: Tab through all controls, Enter submits form, Space activates delete button
