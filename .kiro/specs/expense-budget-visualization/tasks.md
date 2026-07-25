# Implementation Plan: Expense & Budget Visualization

## Overview

Build a zero-dependency, client-side single-page application using HTML5, CSS3, and Vanilla JavaScript (ES6+). The implementation proceeds in layers: project scaffolding → core data utilities → module implementations (StorageManager, Validator, TransactionManager, UIRenderer, ChartManager) → HTML structure → CSS styling → event wiring → property-based and unit tests.

---

## Tasks

- [x] 1. Scaffold project file structure
  - Create `index.html` with HTML5 boilerplate, correct `<link>` to `css/style.css`, and `<script src="js/app.js" defer></script>`
  - Create `css/style.css` as an empty file with a header comment
  - Create `js/app.js` as an empty file with a header comment
  - _Requirements: 8.1, 8.2_

- [x] 2. Implement core utility functions in `js/app.js`
  - [x] 2.1 Implement `generateId()`
    - Use `crypto.randomUUID()` with a `Date.now().toString(36) + Math.random().toString(36).slice(2)` fallback
    - _Requirements: 8.1_

  - [x] 2.2 Implement `computeTotal(list)`
    - Sum only finite, positive `amount` values using `Array.reduce`; skip zeros, negatives, and non-numeric values
    - _Requirements: 4.2, 4.5_

  - [x] 2.3 Implement `computeCategoryTotals(list)`
    - Accumulate totals into `{ Food: 0, Transport: 0, Fun: 0 }` for finite positive amounts only
    - _Requirements: 5.1, 5.5_

  - [x] 2.4 Implement `formatCurrency(amount)`
    - Return `'$' + Number(amount).toFixed(2)`
    - _Requirements: 2.1, 4.2_

- [x] 3. Implement `StorageManager` in `js/app.js`
  - [x] 3.1 Implement `StorageManager.load()`
    - Read `ebv_transactions` key from `localStorage`; return parsed array or `[]` on empty; throw a `{ type: 'StorageError', message }` object on `JSON.parse` failure or inaccessible storage
    - _Requirements: 6.3, 6.4, 6.5_

  - [x] 3.2 Implement `StorageManager.save(list)`
    - Serialize `list` to JSON and write to `ebv_transactions`; throw `{ type: 'StorageError', message }` if `setItem` throws (quota exceeded, private browsing, etc.)
    - _Requirements: 6.1, 6.2, 6.5_

  - [ ]* 3.3 Write property test for serialization round-trip (Property 1)
    - **Property 1: Transaction serialization round-trip**
    - Generate random arrays of valid Transaction objects using fast-check; call `JSON.stringify` then `JSON.parse`; assert deep-equal to original for all fields (id, name, amount, category, createdAt)
    - Tag: `// Feature: expense-budget-visualization, Property 1: Transaction serialization round-trip`
    - Minimum 100 iterations
    - **Validates: Requirements 6.6**

- [x] 4. Implement `Validator` in `js/app.js`
  - [x] 4.1 Implement `Validator.isValidName(name)`
    - Return `true` if trimmed string is non-empty and ≤ 100 characters
    - _Requirements: 1.1, 1.4_

  - [x] 4.2 Implement `Validator.isValidAmount(amount)`
    - Return `true` if the value parses to a finite float in the range `0.01–999999999.99` (inclusive)
    - _Requirements: 1.1, 1.5_

  - [x] 4.3 Implement `Validator.isValidCategory(cat)`
    - Return `true` only for the strings `'Food'`, `'Transport'`, or `'Fun'`
    - _Requirements: 1.1_

  - [x] 4.4 Implement `Validator.validate(formData)`
    - Call all three field checks; return `{ valid: true }` or `{ valid: false, errors: { name?, amount?, category? } }` with a descriptive message per failed field
    - _Requirements: 1.4, 1.5_

  - [ ]* 4.5 Write property test for validator rejecting invalid inputs (Property 4)
    - **Property 4: Validator rejects all invalid inputs**
    - Use fast-check to generate: empty/whitespace-only names, amounts = 0 / negative / > 999999999.99 / non-numeric strings, categories not in the allowed set; assert `validate()` returns `{ valid: false }` with at least one error for all generated cases
    - Tag: `// Feature: expense-budget-visualization, Property 4: Validator rejects all invalid inputs`
    - Minimum 100 iterations
    - **Validates: Requirements 1.4, 1.5**

- [ ] 5. Implement `TransactionManager` in `js/app.js`
  - [~] 5.1 Implement `TransactionManager.setList(list)` and `TransactionManager.getList()`
    - Store a copy in `_list`; `getList()` returns a shallow copy
    - _Requirements: 6.3, 6.4_

  - [~] 5.2 Implement `TransactionManager.add(formData)`
    - Call `Validator.validate(formData)`; if invalid throw validation error; otherwise create a Transaction object (all fields including generated id and ISO createdAt); call `StorageManager.save(newList)` first (throw on failure); set `_list = newList`; dispatch `new CustomEvent('transactions:changed')` on `document`
    - _Requirements: 1.2, 6.1_

  - [ ]* 5.3 Write property test for add grows list by exactly one (Property 2)
    - **Property 2: Adding a transaction grows the list by exactly one**
    - Use fast-check to generate arbitrary transaction lists and valid form data; call `TransactionManager.add()`; assert `getList().length === originalLength + 1` and new entry's name/amount/category match input
    - Tag: `// Feature: expense-budget-visualization, Property 2: Adding a transaction grows the list by exactly one`
    - Minimum 100 iterations
    - **Validates: Requirements 1.2**

  - [~] 5.4 Implement `TransactionManager.remove(id)`
    - Find the transaction with matching `id`; call `StorageManager.save(filteredList)` first (throw on failure); set `_list = filteredList`; dispatch `'transactions:changed'`
    - _Requirements: 3.3, 6.2_

  - [ ]* 5.5 Write property test for delete removes exactly the targeted transaction (Property 5)
    - **Property 5: Delete removes exactly the targeted transaction**
    - Use fast-check to generate lists with ≥ 1 transaction; call `remove(id)` with a randomly chosen id; assert result length is `n − 1`, the removed id is absent, and all other transactions are unchanged
    - Tag: `// Feature: expense-budget-visualization, Property 5: Delete removes exactly the targeted transaction`
    - Minimum 100 iterations
    - **Validates: Requirements 3.3**

  - [~] 5.6 Implement `TransactionManager.getTotal()` and `TransactionManager.getCategoryTotals()`
    - Delegate to `computeTotal(_list)` and `computeCategoryTotals(_list)` respectively
    - _Requirements: 4.2, 5.1_

  - [ ]* 5.7 Write property test for balance sums only finite positive amounts (Property 3)
    - **Property 3: Balance sums only finite positive amounts**
    - Use fast-check to generate lists containing mixed positive, zero, negative, and NaN amounts; assert `computeTotal()` equals the sum of only values where `isFinite(n) && n > 0`
    - Tag: `// Feature: expense-budget-visualization, Property 3: Balance sums only finite positive amounts`
    - Minimum 100 iterations
    - **Validates: Requirements 4.2, 4.5**

  - [ ]* 5.8 Write property test for balance consistency after mutation (Property 6)
    - **Property 6: Balance is consistent with list state after any mutation**
    - Use fast-check to generate a list and a random sequence of add/remove operations; after each operation assert `TransactionManager.getTotal() === computeTotal(TransactionManager.getList())`
    - Tag: `// Feature: expense-budget-visualization, Property 6: Balance is consistent with list state after any mutation`
    - Minimum 100 iterations
    - **Validates: Requirements 4.3**

- [ ] 6. Checkpoint — Ensure all core logic tests pass
  - Run all property and unit tests for utility functions, StorageManager, Validator, and TransactionManager. Ask the user if any questions arise before continuing.

- [ ] 7. Build `index.html` structure
  - [~] 7.1 Add `<head>` metadata, CDN script tag for Chart.js v4, and file references
    - Include `<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>` before `app.js`
    - Ensure `<meta charset="UTF-8">`, `<meta name="viewport" content="width=device-width, initial-scale=1.0">`, and `<link rel="stylesheet" href="css/style.css">`
    - _Requirements: 8.4, 8.5_

  - [~] 7.2 Add `<body>` semantic layout elements
    - Add `<div id="error-banner" role="alert" hidden>` with a dismiss button (`×`)
    - Add `<p id="balance-display" aria-live="polite">` inside a `<header>` or `<section>` element
    - Add `<form id="transaction-form">` containing: `<input id="input-name" type="text" maxlength="100">`, `<input id="input-amount" type="number" step="0.01" min="0.01" max="999999999.99">`, `<select id="input-category">` with `<option>` elements for Food/Transport/Fun, and `<button id="btn-add" type="submit">`
    - Add inline error containers adjacent to each field (e.g., `<span class="field-error" id="error-name">`)
    - Add `<ul id="transaction-list" aria-label="Transaction list">` for transaction entries
    - Add `<canvas id="chart-canvas">` and `<div id="chart-fallback" aria-live="polite" hidden>` inside a chart section
    - _Requirements: 2.1, 3.1, 4.1, 5.1, 7.5_

- [ ] 8. Implement `UIRenderer` in `js/app.js`
  - [~] 8.1 Implement `UIRenderer.renderList(list)`
    - Clear `#transaction-list`; if `list` is empty render an empty-state `<li>` with message; otherwise render one `<li>` per transaction showing name, `formatCurrency(amount)`, category, and a `<button class="btn-delete">` with a `data-id` attribute
    - _Requirements: 2.1, 2.4, 3.1_

  - [ ]* 8.2 Write property test for rendered transaction list completeness (Property 9)
    - **Property 9: Rendered transaction list is complete and includes delete controls**
    - Use fast-check with jsdom to generate transaction lists of length `n`; call `UIRenderer.renderList(list)`; assert `#transaction-list` contains exactly `n` `<li>` elements each with name text, formatted amount, category text, and a delete button
    - Tag: `// Feature: expense-budget-visualization, Property 9: Rendered transaction list is complete and includes delete controls`
    - Minimum 100 iterations
    - **Validates: Requirements 2.1, 3.1**

  - [~] 8.3 Implement `UIRenderer.renderBalance(total)`
    - Set the text content of `#balance-display` to `formatCurrency(total)`
    - _Requirements: 4.1, 4.2, 4.4_

  - [~] 8.4 Implement `UIRenderer.resetForm()`
    - Call `document.getElementById('transaction-form').reset()` and call `UIRenderer.clearErrors()`
    - _Requirements: 1.3_

  - [~] 8.5 Implement `UIRenderer.showFieldError(fieldId, message)` and `UIRenderer.clearErrors()`
    - `showFieldError`: populate the corresponding `#error-{fieldId}` span with `message`
    - `clearErrors`: empty all `.field-error` spans
    - _Requirements: 1.4, 1.5_

  - [~] 8.6 Implement `UIRenderer.showErrorBanner(message)` and `UIRenderer.hideErrorBanner()`
    - `showErrorBanner`: set text in `#error-banner`, remove `hidden` attribute
    - `hideErrorBanner`: add `hidden` attribute back
    - Also wire the dismiss button (`×`) to call `hideErrorBanner()` during app initialization
    - _Requirements: 1.6, 2.5, 3.4, 6.5_

  - [~] 8.7 Implement `UIRenderer.confirmDelete(transactionName)`
    - Call `window.confirm()` with a message including the transaction name; return the boolean result
    - _Requirements: 3.2, 3.5_

- [ ] 9. Implement `ChartManager` in `js/app.js`
  - [~] 9.1 Implement `ChartManager.isAvailable()`
    - Return `typeof window.Chart !== 'undefined'`
    - _Requirements: 8.5_

  - [~] 9.2 Implement `ChartManager._renderFallback(categoryTotals)`
    - Show `#chart-fallback`, set its innerHTML to a text breakdown of each category and its formatted total
    - _Requirements: 8.5_

  - [~] 9.3 Implement `ChartManager.init(categoryTotals)`
    - If `isAvailable()`: hide `#chart-fallback`, create a new `Chart` on `#chart-canvas` as a `'pie'` type with labels = category names, data = category totals (omit zero-total categories), and enable percentage labels in the tooltip/label callbacks
    - If not available: call `_renderFallback(categoryTotals)`
    - Store the Chart instance in `_chart`
    - _Requirements: 5.1, 5.3, 5.4, 8.4, 8.5_

  - [~] 9.4 Implement `ChartManager.update(categoryTotals)`
    - Filter to positive-total categories only; if `isAvailable()` and `_chart` exists: update `_chart.data.labels`, `_chart.data.datasets[0].data`, and call `_chart.update()`; if no transactions render an empty placeholder message on the canvas; if not available: call `_renderFallback(categoryTotals)`
    - _Requirements: 5.1, 5.2, 5.3, 5.5_

  - [ ]* 9.5 Write property test for pie chart segments matching positive-total categories (Property 7)
    - **Property 7: Pie chart segments exactly match categories with positive totals**
    - Use fast-check to generate transaction lists; compute `computeCategoryTotals()`; assert that the set of keys with `total > 0` equals the set of labels in the Chart data (or text keys in fallback), with no extra or missing segments
    - Tag: `// Feature: expense-budget-visualization, Property 7: Pie chart segments exactly match categories with positive totals`
    - Minimum 100 iterations
    - **Validates: Requirements 5.1, 5.3, 5.5**

  - [ ]* 9.6 Write property test for chart percentage calculations (Property 8)
    - **Property 8: Chart segment percentages sum to 100% and are correctly rounded**
    - Use fast-check to generate category total objects where at least one value is positive; compute each segment percentage as `(categoryTotal / sumOfAllPositiveTotals) * 100` rounded to one decimal; assert the sum is within 0.1% of 100
    - Tag: `// Feature: expense-budget-visualization, Property 8: Chart segment percentages sum to ~100%`
    - Minimum 100 iterations
    - **Validates: Requirements 5.4**

- [ ] 10. Wire app initialization and event handling in `js/app.js`
  - [~] 10.1 Implement `DOMContentLoaded` handler
    - Call `StorageManager.load()`; on success call `TransactionManager.setList(list)`, `UIRenderer.renderList(list)`, `UIRenderer.renderBalance(TransactionManager.getTotal())`, `ChartManager.init(TransactionManager.getCategoryTotals())`; on `StorageError` call `UIRenderer.showErrorBanner(message)` and initialize with empty state
    - _Requirements: 2.3, 6.3, 6.4, 6.5_

  - [~] 10.2 Implement form `submit` event handler on `#transaction-form`
    - Prevent default; read `input-name`, `input-amount`, `input-category` values; call `Validator.validate(formData)`; on invalid call `UIRenderer.showFieldError()` for each error; on valid call `UIRenderer.clearErrors()`, then `TransactionManager.add(formData)`; on `StorageError` call `UIRenderer.showErrorBanner(message)`
    - _Requirements: 1.2, 1.4, 1.5, 1.6_

  - [~] 10.3 Implement `transactions:changed` event listener on `document`
    - When fired: call `UIRenderer.renderList(TransactionManager.getList())`, `UIRenderer.renderBalance(TransactionManager.getTotal())`, `ChartManager.update(TransactionManager.getCategoryTotals())`, `UIRenderer.resetForm()`, and `UIRenderer.hideErrorBanner()`
    - _Requirements: 1.3, 3.3, 4.3, 5.2_

  - [~] 10.4 Implement delete click handler (event delegation on `#transaction-list`)
    - Listen for `click` on `#transaction-list`; check `event.target.closest('.btn-delete')`; read `data-id`; call `UIRenderer.confirmDelete(transactionName)`; if confirmed call `TransactionManager.remove(id)`; on `StorageError` call `UIRenderer.showErrorBanner(message)`
    - _Requirements: 3.2, 3.3, 3.4, 3.5_

- [ ] 11. Checkpoint — Verify end-to-end wiring works
  - Ensure all tests pass. Manually open `index.html` and confirm: add a transaction → list updates → balance updates → chart updates → reload → data persists. Ask the user if any questions arise.

- [ ] 12. Style the app in `css/style.css`
  - [~] 12.1 Define CSS custom properties and base styles
    - Declare `--color-primary`, `--color-bg`, `--color-text`, `--color-error` etc. in `:root`; set `font-size: 16px`, `line-height: 1.5` on `body`; ensure all text meets at least 4.5:1 contrast ratio against the background
    - _Requirements: 7.3_

  - [~] 12.2 Style the Balance_Display and error banner
    - Make `#balance-display` prominent (large font, centered or top-aligned); style `#error-banner` with a visible error color and a dismiss button that is keyboard-focusable
    - _Requirements: 4.1, 7.3, 7.5_

  - [~] 12.3 Style the Input_Form
    - Style all inputs, the select element, and the submit button; show `.field-error` spans in error color; ensure all interactive controls have a visible `:focus` outline
    - _Requirements: 1.1, 7.5_

  - [~] 12.4 Style the Transaction_List
    - Apply `max-height` and `overflow-y: auto` to `#transaction-list` so it scrolls when entries overflow; style each `<li>` to show name, amount, category, and delete button in a row
    - _Requirements: 2.1, 2.2_

  - [~] 12.5 Style the pie chart section
    - Constrain the `<canvas>` to a reasonable max-width; style `#chart-fallback` text for readability; handle the hidden/visible transition via the `hidden` attribute
    - _Requirements: 5.1, 8.5_

  - [~] 12.6 Apply responsive layout adjustments
    - Use a single-column layout by default; apply `@media` query for wider screens to adjust spacing; ensure no content is clipped or overlapping
    - _Requirements: 7.1_

- [ ] 13. Final checkpoint — Full integration and accessibility pass
  - Ensure all tests pass. Verify keyboard navigation (Tab through all controls, Enter submits form, Space activates delete), ARIA live regions announce balance/error changes, and no JS console errors appear on load. Ask the user if any questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP.
- Property-based tests require **fast-check**. Load via CDN in a test HTML harness or run in a Node.js test runner (e.g., `node --experimental-vm-modules` with Jest or Vitest). Each test runs a minimum of 100 iterations.
- DOM-dependent property tests (Property 9) require jsdom or a real browser environment.
- All correctness properties reference specific requirements clauses for traceability.
- The `storage write-before-update` pattern is critical: always call `StorageManager.save()` before mutating `_list` or dispatching events.
- Chart.js is loaded from CDN; if unavailable, the fallback text path in `ChartManager` must be tested separately.

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1", "2.2", "2.3", "2.4"] },
    { "id": 1, "tasks": ["3.1", "3.2", "4.1", "4.2", "4.3"] },
    { "id": 2, "tasks": ["3.3", "4.4"] },
    { "id": 3, "tasks": ["4.5", "5.1"] },
    { "id": 4, "tasks": ["5.2", "5.4", "5.6"] },
    { "id": 5, "tasks": ["5.3", "5.5", "5.7", "5.8", "7.1"] },
    { "id": 6, "tasks": ["7.2"] },
    { "id": 7, "tasks": ["8.1", "8.3", "8.4", "8.5", "8.6", "8.7"] },
    { "id": 8, "tasks": ["8.2", "9.1", "9.2"] },
    { "id": 9, "tasks": ["9.3", "9.4"] },
    { "id": 10, "tasks": ["9.5", "9.6", "10.1"] },
    { "id": 11, "tasks": ["10.2", "10.3", "10.4"] },
    { "id": 12, "tasks": ["12.1"] },
    { "id": 13, "tasks": ["12.2", "12.3", "12.4", "12.5"] },
    { "id": 14, "tasks": ["12.6"] }
  ]
}
```
