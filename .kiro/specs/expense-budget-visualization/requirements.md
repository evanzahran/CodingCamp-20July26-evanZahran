# Requirements Document

## Introduction

The Expense & Budget Visualization app is a client-side web application built with HTML, CSS, and Vanilla JavaScript. It allows users to track personal expenses by adding transactions with a name, amount, and category. The app displays a running total balance, a scrollable transaction list with delete capability, and a live-updating pie chart showing spending distribution by category. All data is persisted in the browser's Local Storage — no backend or server is required.

## Glossary

- **App**: The Expense & Budget Visualization single-page web application.
- **Transaction**: A single expense record containing an item name, a monetary amount, and a category.
- **Category**: One of three fixed expense classifications: Food, Transport, or Fun.
- **Transaction_List**: The scrollable UI component that renders all stored transactions.
- **Input_Form**: The HTML form containing the Item Name, Amount, and Category fields used to create a new Transaction.
- **Balance_Display**: The UI element at the top of the page showing the current total of all transaction amounts.
- **Pie_Chart**: The visual chart component (powered by Chart.js or equivalent) that displays spending distribution by Category.
- **Storage**: The browser's Local Storage API used for client-side data persistence.
- **Validator**: The client-side logic that checks Input_Form fields before a transaction is saved.

---

## Requirements

### Requirement 1: Add a Transaction

**User Story:** As a user, I want to fill in an expense form and submit it, so that I can record a new transaction quickly.

#### Acceptance Criteria

1. THE Input_Form SHALL contain three fields: Item Name (text, max 100 characters), Amount (numeric, range 0.01–999,999,999.99), and Category (select with options Food, Transport, Fun).
2. WHEN the user submits the Input_Form with all fields filled and Amount greater than zero, THE App SHALL add the Transaction to the Transaction_List and persist it to Storage within 2 seconds.
3. WHEN the Transaction is successfully saved, THE Input_Form SHALL reset all fields to their default empty/placeholder state.
4. IF the user submits the Input_Form with one or more empty fields, THEN THE Validator SHALL display an inline error message adjacent to each empty field and SHALL NOT save the Transaction.
5. IF the user submits the Input_Form with an Amount outside the range 0.01–999,999,999.99 or a non-numeric value, THEN THE Validator SHALL display an error message indicating a valid positive number in the accepted range is required and SHALL NOT save the Transaction.
6. IF Storage is unavailable when the user submits the Input_Form, THEN THE App SHALL display an error message informing the user that the transaction could not be saved and SHALL NOT add it to the Transaction_List.

---

### Requirement 2: Display the Transaction List

**User Story:** As a user, I want to see all my recorded expenses in a list, so that I can review what I have spent.

#### Acceptance Criteria

1. THE Transaction_List SHALL render every stored Transaction, each showing the Item Name (up to 100 characters), Amount (formatted with 2 decimal places and a currency symbol), and Category.
2. WHILE the number of transactions exceeds the visible height of the Transaction_List container, THE Transaction_List SHALL be scrollable to reveal all entries.
3. WHEN the App loads in the browser, THE Transaction_List SHALL populate from Storage and display all previously saved transactions within 2 seconds.
4. WHEN no transactions are stored, THE Transaction_List SHALL display an empty-state message indicating no transactions have been recorded.
5. IF Storage is unavailable on load, THEN THE App SHALL display an error message and render an empty Transaction_List rather than crashing.

---

### Requirement 3: Delete a Transaction

**User Story:** As a user, I want to remove an individual transaction from the list, so that I can correct mistakes or remove outdated entries.

#### Acceptance Criteria

1. THE Transaction_List SHALL display a delete control (button or icon) for each Transaction entry.
2. WHEN the user activates the delete control for a Transaction, THE App SHALL display a confirmation prompt before deletion.
3. WHEN the user confirms deletion, THE App SHALL remove that Transaction from the Transaction_List, delete it from Storage, and update the Balance_Display and Pie_Chart within 1 second.
4. IF Storage deletion fails, THEN THE App SHALL retain the Transaction in the Transaction_List and display an error message indicating the deletion could not be completed.
5. WHEN the user cancels the confirmation prompt, THE Transaction_List SHALL remain unchanged and no data SHALL be deleted.

---

### Requirement 4: Display Total Balance

**User Story:** As a user, I want to see my total spending at a glance, so that I know how much I have spent overall.

#### Acceptance Criteria

1. THE Balance_Display SHALL be visible at the top of the App at all times.
2. THE Balance_Display SHALL show the sum of all Transaction amounts, formatted with 2 decimal places and a currency symbol.
3. WHEN a Transaction is added or deleted, THE Balance_Display SHALL update to reflect the new total within the same render cycle, requiring no page reload.
4. WHEN no transactions are stored, THE Balance_Display SHALL show a formatted value of zero (e.g., $0.00).
5. IF a Transaction has an invalid or non-numeric amount, THEN THE Balance_Display SHALL exclude that Transaction from the total calculation.

---

### Requirement 5: Visualize Spending by Category (Pie Chart)

**User Story:** As a user, I want to see a pie chart of my spending broken down by category, so that I can understand where my money is going.

#### Acceptance Criteria

1. THE Pie_Chart SHALL display one segment per Category that has at least one Transaction with an amount greater than 0, sized proportionally to that Category's total relative to the sum of all category totals.
2. WHEN a Transaction is added or deleted, THE Pie_Chart SHALL re-render to reflect the updated spending distribution without requiring a page reload.
3. WHEN all transactions are deleted and no transactions remain, THE Pie_Chart SHALL display a placeholder state with no segments rendered.
4. THE Pie_Chart SHALL label each segment with its Category name and the percentage of total spending it represents, rounded to one decimal place.
5. IF a Transaction has a negative or zero amount, THEN THE Pie_Chart SHALL exclude that Transaction from all segment size and percentage calculations.

---

### Requirement 6: Data Persistence Across Sessions

**User Story:** As a user, I want my transactions to be saved between browser sessions, so that I do not lose my data when I close and reopen the app.

#### Acceptance Criteria

1. WHEN the user adds a Transaction, THE Storage SHALL write the updated transaction dataset to Local Storage before the UI updates to confirm the save.
2. WHEN the user deletes a Transaction, THE Storage SHALL write the updated transaction dataset to Local Storage before the UI removes the entry from the Transaction_List.
3. WHEN the App initializes, THE App SHALL read all transactions from Local Storage and restore the Transaction_List, Balance_Display, and Pie_Chart within 500ms.
4. IF Local Storage is empty or contains no valid transaction data, THEN THE App SHALL initialize with an empty Transaction_List, a Balance_Display showing zero, and an empty Pie_Chart state.
5. IF a Local Storage read or write operation fails, THEN THE App SHALL display an error message to the user and continue operating with in-memory state for the current session.
6. WHEN a Transaction is written to and read from Local Storage, ALL fields (Item Name, Amount, Category) SHALL be preserved with identical values, confirming correct serialization and deserialization.

---

### Requirement 7: Responsive and Accessible UI

**User Story:** As a user, I want the app to be readable and functional across modern desktop browsers, so that I can use it on any device without issues.

#### Acceptance Criteria

1. THE App SHALL render correctly in the current stable versions of Chrome, Firefox, Edge, and Safari — meaning all UI elements are visible, interactive controls are clickable, all styles are applied, and no content is overlapping or clipped — without JavaScript errors or layout breakage.
2. THE App SHALL use a single CSS file located at `css/` and a single JavaScript file located at `js/` for all styling and logic respectively.
3. THE App SHALL apply a minimum font size of 16px, a line height of at least 1.5, and a text-to-background contrast ratio of at least 4.5:1 for all body text.
4. WHEN the page is loaded on a 25 Mbps connection, THE App SHALL be fully interactive (all form fields focusable, buttons clickable, and chart rendered) within 2 seconds.
5. THE App SHALL be operable using a keyboard alone, with all interactive controls reachable via Tab key and activatable via Enter or Space, using semantic HTML elements where appropriate.

---

### Requirement 8: No-Framework, No-Backend Constraint

**User Story:** As a developer, I want the app to use only HTML, CSS, and Vanilla JavaScript with Local Storage, so that it has zero dependencies beyond an optional charting library and runs without a server.

#### Acceptance Criteria

1. THE App SHALL be implemented using only HTML, CSS, and Vanilla JavaScript — no JavaScript UI frameworks (React, Vue, Angular, Svelte, etc.) SHALL be used.
2. THE App SHALL require no backend server, build tool, or package manager to run; opening `index.html` in a browser SHALL be sufficient to launch the App.
3. THE App SHALL use only the browser's built-in Local Storage API for all client-side data persistence — no IndexedDB, cookies, or third-party storage libraries SHALL be used.
4. WHERE a chart library is used, THE App SHALL load it via a CDN `<script>` tag and SHALL NOT require a local install or bundling step.
5. IF the CDN hosting the chart library is unreachable, THEN THE App SHALL degrade gracefully by displaying a text-based or static fallback in place of the Pie_Chart and SHALL NOT throw an uncaught JavaScript error.
