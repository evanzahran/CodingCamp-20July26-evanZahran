// js/app.js - Expense & Budget Visualization application logic

/**
 * Generates a unique ID for a transaction.
 * Uses crypto.randomUUID() when available (modern browsers),
 * with a Date.now() + Math.random() fallback for older browsers.
 * @returns {string} A unique identifier string
 */
function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/**
 * Computes the sum of all valid transaction amounts in a list.
 * Only sums amounts that are finite numbers greater than zero.
 * Zeros, negatives, and non-numeric values are silently excluded.
 * @param {Array} list - Array of Transaction objects
 * @returns {number} The sum of all finite positive amounts
 */
function computeTotal(list) {
  return list.reduce((sum, t) => {
    const n = parseFloat(t.amount);
    return sum + (isFinite(n) && n > 0 ? n : 0);
  }, 0);
}

/**
 * Computes the total amount spent per category across a transaction list.
 * Only accumulates amounts that are finite numbers greater than zero.
 * Zeros, negatives, non-numeric values, and unknown categories are silently excluded.
 * @param {Array} list - Array of Transaction objects
 * @returns {CategoryTotals} An object with Food, Transport, and Fun totals
 */
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

/**
 * Formats a numeric amount as a currency string with a dollar sign
 * and exactly two decimal places.
 * Requirements: 2.1, 4.2
 * @param {number|string} amount - The amount to format
 * @returns {string} A string like '$12.34'
 */
function formatCurrency(amount) {
  return '$' + Number(amount).toFixed(2);
}

/**
 * StorageManager
 * Responsible for all reads and writes to localStorage.
 * All methods are synchronous and wrap operations in try/catch to surface
 * failures without crashing.
 * Requirements: 6.3, 6.4, 6.5, 6.6
 */
const StorageManager = {
  STORAGE_KEY: 'ebv_transactions',

  /**
   * Reads and returns the stored transaction array from localStorage.
   * Returns an empty array if storage is empty or the key does not exist.
   * Throws a StorageError plain object if localStorage is inaccessible
   * or if the stored value cannot be parsed as JSON.
   *
   * @returns {Transaction[]} Parsed array of transactions, or [] when empty.
   * @throws {{ type: 'StorageError', message: string }} On parse failure or inaccessible storage.
   *
   * Requirements: 6.3, 6.4, 6.5
   */
  load() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);

      // Empty storage — requirement 6.4: initialize with empty state
      if (raw === null || raw === '') {
        return [];
      }

      // Attempt to parse; throws SyntaxError on malformed JSON
      const parsed = JSON.parse(raw);

      // Guard against non-array stored values
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      // Covers both JSON.parse failures (SyntaxError) and localStorage
      // access being blocked (SecurityError in private browsing, etc.)
      throw {
        type: 'StorageError',
        message: 'Failed to load transactions from storage: ' + (err.message || String(err)),
      };
    }
  },

  /**
   * Serializes the transaction list to JSON and writes it to localStorage.
   * Always writes before the caller mutates in-memory state or updates the UI,
   * fulfilling the storage write-before-update pattern.
   *
   * Throws a StorageError plain object if the write fails for any reason:
   *   - DOMException (QuotaExceededError) when storage quota is exceeded
   *   - SecurityError when localStorage is blocked (e.g., private browsing)
   *   - Any other unexpected error during serialization or writing
   *
   * @param {Transaction[]} list - The full, up-to-date transaction array to persist.
   * @throws {{ type: 'StorageError', message: string }} On any write failure.
   *
   * Requirements: 6.1, 6.2, 6.5
   */
  save(list) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list));
    } catch (err) {
      throw {
        type: 'StorageError',
        message: 'Failed to save transactions to storage: ' + (err.message || String(err)),
      };
    }
  },
};

/**
 * Validator
 * Pure validation logic with no DOM or storage side effects.
 * Requirements: 1.1, 1.4, 1.5
 */
const Validator = {
  /**
   * Checks whether a transaction name is valid.
   * Trims the input and returns true only if the result is non-empty
   * and at most 100 characters long.
   *
   * @param {string} name - Raw name input value
   * @returns {boolean} true if trimmed name is non-empty and ≤ 100 characters
   *
   * Requirements: 1.1, 1.4
   */
  isValidName(name) {
    const trimmed = String(name).trim();
    return trimmed.length > 0 && trimmed.length <= 100;
  },

  /**
   * Checks whether a transaction amount string is valid.
   * Parses the input to a float and returns true only if the result is a
   * finite number within the accepted range of 0.01 to 999,999,999.99
   * (inclusive on both ends).
   *
   * Non-numeric strings (e.g. 'abc', ''), Infinity, NaN, values below 0.01,
   * and values above 999999999.99 all return false.
   *
   * @param {string} amount - Raw amount input value
   * @returns {boolean} true if amount parses to a finite float in [0.01, 999999999.99]
   *
   * Requirements: 1.1, 1.5
   */
  isValidAmount(amount) {
    const parsed = parseFloat(amount);
    return isFinite(parsed) && parsed >= 0.01 && parsed <= 999999999.99;
  },

  /**
   * Checks whether a category value is one of the three accepted categories.
   * Returns true only for the exact strings 'Food', 'Transport', or 'Fun'.
   * All other values — including undefined, null, empty string, and
   * case variants like 'food' or 'FOOD' — return false.
   *
   * @param {string} cat - Category value to validate
   * @returns {boolean} true if cat is exactly 'Food', 'Transport', or 'Fun'
   *
   * Requirements: 1.1
   */
  isValidCategory(cat) {
    return cat === 'Food' || cat === 'Transport' || cat === 'Fun';
  },

  /**
   * Validates all three fields of a transaction form submission.
   * Calls isValidName, isValidAmount, and isValidCategory internally.
   * Returns { valid: true } if all fields pass, or { valid: false, errors: {...} }
   * where each key in errors is a field that failed, mapped to a descriptive message.
   *
   * @param {{ name: string, amount: string, category: string }} formData - Raw form values
   * @returns {ValidationResult} Result object with valid flag and optional errors map
   *
   * Requirements: 1.4, 1.5
   */
  validate(formData) {
    const errors = {};

    if (!this.isValidName(formData.name)) {
      errors.name = 'Name is required and must be 100 characters or fewer';
    }

    if (!this.isValidAmount(formData.amount)) {
      errors.amount = 'Amount must be a number between 0.01 and 999999999.99';
    }

    if (!this.isValidCategory(formData.category)) {
      errors.category = 'Category must be Food, Transport, or Fun';
    }

    if (Object.keys(errors).length === 0) {
      return { valid: true };
    }

    return { valid: false, errors };
  },
};

/**
 * TransactionManager
 * Manages the in-memory list of transactions and coordinates with StorageManager.
 * Acts as the single source of truth during a session.
 * Requirements: 6.3, 6.4
 */
const TransactionManager = {
  /** @type {Transaction[]} In-memory transaction list */
  _list: [],

  /**
   * Sets the internal transaction list from an external source (e.g., loaded from
   * StorageManager on init). Stores a shallow copy so external mutations to the
   * passed-in array do not affect the internal state.
   *
   * Does NOT call StorageManager — this is intentional. `setList` is used during
   * initialization to restore state that was already read from storage.
   *
   * @param {Transaction[]} list - Array of Transaction objects to restore
   * @returns {void}
   *
   * Requirements: 6.3, 6.4
   */
  setList(list) {
    this._list = [...list];
  },

  /**
   * Returns a shallow copy of the current in-memory transaction list.
   * Callers receive their own array reference, so mutations to the returned
   * array do not affect the internal state.
   *
   * @returns {Transaction[]} Shallow copy of the current transaction list
   *
   * Requirements: 6.3, 6.4
   */
  getList() {
    return [...this._list];
  },

  /**
   * Validates the form data, creates a new Transaction, persists it to storage,
   * updates the in-memory list, and dispatches a 'transactions:changed' event.
   *
   * Follows the storage write-before-update pattern: StorageManager.save() is
   * called BEFORE mutating _list or dispatching the event. If save() throws,
   * _list is left unchanged and no event is fired.
   *
   * @param {{ name: string, amount: string, category: string }} formData - Raw form values
   * @returns {Transaction} The newly created Transaction object
   * @throws {ValidationResult} If formData fails validation ({ valid: false, errors: {...} })
   * @throws {{ type: 'StorageError', message: string }} If storage write fails
   *
   * Requirements: 1.2, 6.1
   */
  add(formData) {
    // Step 1: Validate — throw the full validation result on failure
    const validationResult = Validator.validate(formData);
    if (!validationResult.valid) {
      throw validationResult;
    }

    // Step 2: Build the new Transaction object
    const newTransaction = {
      id: generateId(),
      name: formData.name.trim(),
      amount: parseFloat(formData.amount),
      category: formData.category,
      createdAt: new Date().toISOString(),
    };

    // Step 3: Build the updated list
    const newList = [...this._list, newTransaction];

    // Step 4: Persist FIRST — throws StorageError on failure, leaving _list untouched
    StorageManager.save(newList);

    // Step 5: Commit the in-memory update only after a successful save
    this._list = newList;

    // Step 6: Notify listeners that the transaction list has changed
    document.dispatchEvent(new CustomEvent('transactions:changed'));

    return newTransaction;
  },

  /**
   * Removes a transaction from the list by its ID, persists the updated list
   * to storage, then updates the in-memory list and dispatches a
   * 'transactions:changed' event.
   *
   * Follows the storage write-before-update pattern: StorageManager.save() is
   * called BEFORE mutating _list or dispatching the event. If save() throws,
   * _list is left unchanged and no event is fired.
   *
   * If no transaction with the given ID exists, the method is a no-op —
   * it saves the unchanged list and dispatches the event normally.
   *
   * @param {string} id - The unique identifier of the transaction to remove
   * @returns {void}
   * @throws {{ type: 'StorageError', message: string }} If storage write fails
   *
   * Requirements: 3.3, 6.2
   */
  remove(id) {
    // Step 1: Build the filtered list excluding the target transaction
    const filteredList = this._list.filter(t => t.id !== id);

    // Step 2: Persist FIRST — throws StorageError on failure, leaving _list untouched
    StorageManager.save(filteredList);

    // Step 3: Commit the in-memory update only after a successful save
    this._list = filteredList;

    // Step 4: Notify listeners that the transaction list has changed
    document.dispatchEvent(new CustomEvent('transactions:changed'));
  },

  /**
   * Returns the sum of all valid (finite, positive) transaction amounts
   * in the current in-memory list.
   *
   * Delegates to the pure utility function computeTotal(), passing the
   * internal _list as the argument.
   *
   * @returns {number} Sum of all finite positive transaction amounts
   *
   * Requirements: 4.2
   */
  getTotal() {
    return computeTotal(this._list);
  },

  /**
   * Returns the total amount spent per category across the current
   * in-memory transaction list.
   *
   * Delegates to the pure utility function computeCategoryTotals(), passing
   * the internal _list as the argument. Only finite positive amounts are
   * counted; zeros, negatives, and non-numeric values are excluded.
   *
   * @returns {CategoryTotals} Object with Food, Transport, and Fun totals
   *
   * Requirements: 5.1
   */
  getCategoryTotals() {
    return computeCategoryTotals(this._list);
  },
};

/**
 * UIRenderer
 * All DOM manipulation lives here. Reads from the DOM only to reset forms.
 * Never reads from StorageManager directly.
 * Requirements: 2.1, 2.4, 3.1, 4.1, 4.2, 1.3, 1.4, 1.5, 1.6, 2.5, 3.2, 3.4, 3.5, 6.5
 */
const UIRenderer = {
  /**
   * Renders the full transaction list into the #transaction-list element.
   *
   * Clears the container first, then:
   *   - If the list is empty, appends a single <li> with an empty-state message.
   *   - Otherwise, appends one <li> per transaction showing the item name,
   *     amount formatted with formatCurrency(), the category, and a delete
   *     button (<button class="btn-delete">) with a data-id attribute set to
   *     the transaction's id.
   *
   * @param {Transaction[]} list - Array of Transaction objects to render
   * @returns {void}
   *
   * Requirements: 2.1, 2.4, 3.1
   */
  renderList(list) {
    const container = document.getElementById('transaction-list');

    // Clear all existing content
    container.innerHTML = '';

    if (list.length === 0) {
      // Empty-state message — Requirement 2.4
      const emptyItem = document.createElement('li');
      emptyItem.className = 'empty-state';
      emptyItem.textContent = 'No transactions recorded.';
      container.appendChild(emptyItem);
      return;
    }

    // Render one <li> per transaction — Requirements 2.1, 3.1
    list.forEach(transaction => {
      const li = document.createElement('li');
      li.className = 'transaction-item';

      // Item name span
      const nameSpan = document.createElement('span');
      nameSpan.className = 'transaction-name';
      nameSpan.textContent = transaction.name;

      // Formatted amount span
      const amountSpan = document.createElement('span');
      amountSpan.className = 'transaction-amount';
      amountSpan.textContent = formatCurrency(transaction.amount);

      // Category span
      const categorySpan = document.createElement('span');
      categorySpan.className = 'transaction-category';
      categorySpan.textContent = transaction.category;

      // Delete button — Requirement 3.1
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn-delete';
      deleteBtn.type = 'button';
      deleteBtn.setAttribute('data-id', transaction.id);
      deleteBtn.setAttribute('aria-label', 'Delete ' + transaction.name);
      deleteBtn.textContent = '\u{1F5D1}'; // 🗑 trash icon

      li.appendChild(nameSpan);
      li.appendChild(amountSpan);
      li.appendChild(categorySpan);
      li.appendChild(deleteBtn);

      container.appendChild(li);
    });
  },

  /**
   * Updates the #balance-display element to show the formatted total.
   *
   * @param {number} total - The current balance total
   * @returns {void}
   *
   * Requirements: 4.1, 4.2, 4.4
   */
  renderBalance(total) {
    const display = document.getElementById('balance-display');
    display.textContent = formatCurrency(total);
  },

  /**
   * Resets all Input_Form fields to their default/empty state and clears
   * any inline field error messages.
   *
   * @returns {void}
   *
   * Requirements: 1.3
   */
  resetForm() {
    document.getElementById('transaction-form').reset();
    this.clearErrors();
  },

  /**
   * Displays an inline error message adjacent to the specified form field.
   * The message is written into the corresponding #error-{fieldId} span.
   *
   * @param {'name'|'amount'|'category'} fieldId - The field identifier
   * @param {string} message - The error message to display
   * @returns {void}
   *
   * Requirements: 1.4, 1.5
   */
  showFieldError(fieldId, message) {
    const errorSpan = document.getElementById('error-' + fieldId);
    if (errorSpan) {
      errorSpan.textContent = message;
    }
  },

  /**
   * Clears all inline field error messages by emptying every .field-error span.
   *
   * @returns {void}
   *
   * Requirements: 1.4, 1.5
   */
  clearErrors() {
    document.querySelectorAll('.field-error').forEach(span => {
      span.textContent = '';
    });
  },

  /**
   * Displays the error banner with the given message by setting the message
   * text and removing the hidden attribute.
   *
   * @param {string} message - The error message to show in the banner
   * @returns {void}
   *
   * Requirements: 1.6, 2.5, 3.4, 6.5
   */
  showErrorBanner(message) {
    const banner = document.getElementById('error-banner');
    const bannerMessage = document.getElementById('error-banner-message');
    if (bannerMessage) {
      bannerMessage.textContent = message;
    }
    banner.removeAttribute('hidden');
  },

  /**
   * Hides the error banner by adding the hidden attribute back.
   *
   * @returns {void}
   *
   * Requirements: 1.6, 2.5, 3.4, 6.5
   */
  hideErrorBanner() {
    const banner = document.getElementById('error-banner');
    banner.setAttribute('hidden', '');
  },

  /**
   * Shows the native browser confirm dialog with a message that includes
   * the transaction name. Returns true if the user confirms, false if they
   * cancel.
   *
   * @param {string} transactionName - The name of the transaction to confirm deletion for
   * @returns {boolean} true if confirmed, false if cancelled
   *
   * Requirements: 3.2, 3.5
   */
  confirmDelete(transactionName) {
    return window.confirm('Are you sure you want to delete "' + transactionName + '"?');
  },
};

// ---------------------------------------------------------------------------
// ChartManager
// ---------------------------------------------------------------------------

/**
 * ChartManager
 * Encapsulates all Chart.js interaction. Manages CDN availability detection
 * and fallback rendering.
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 8.4, 8.5
 */
const ChartManager = {
  /** @type {Chart|null} The active Chart.js instance, or null if not yet created */
  _chart: null,

  /** @type {HTMLCanvasElement|null} The canvas element for the chart */
  _canvas: null,

  /** @type {HTMLElement|null} The fallback container element */
  _fallbackContainer: null,

  /**
   * Returns true if Chart.js is available in the global scope.
   * Checks for the presence of window.Chart, which is set by the Chart.js
   * CDN script tag. If the CDN is unreachable, window.Chart will be
   * undefined and this method returns false.
   *
   * @returns {boolean} true if Chart.js is loaded and available, false otherwise
   *
   * Requirements: 8.5
   */
  isAvailable() {
    return typeof window.Chart !== 'undefined';
  },

  /**
   * Renders a static text breakdown of category totals in the fallback container.
   * Called when Chart.js is unavailable.
   *
   * @param {CategoryTotals} categoryTotals - Object with Food, Transport, Fun totals
   * @returns {void}
   *
   * Requirements: 8.5
   */
  _renderFallback(categoryTotals) {
    if (!this._fallbackContainer) {
      this._fallbackContainer = document.getElementById('chart-fallback');
    }

    // Show the fallback container
    this._fallbackContainer.removeAttribute('hidden');

    // Build a text breakdown for each category
    this._fallbackContainer.innerHTML =
      '<p><strong>Food:</strong> ' + formatCurrency(categoryTotals.Food) + '</p>' +
      '<p><strong>Transport:</strong> ' + formatCurrency(categoryTotals.Transport) + '</p>' +
      '<p><strong>Fun:</strong> ' + formatCurrency(categoryTotals.Fun) + '</p>';
  },

  /**
   * Called once on DOMContentLoaded. Checks if Chart.js is available.
   * If available: renders a pie chart with categoryTotals.
   * If not available: shows the text fallback.
   *
   * Zero-total categories are excluded from labels and data (Req 5.1).
   * Tooltip callbacks show each segment's percentage of total spending
   * rounded to one decimal place (Req 5.4).
   * When no categories have a positive total the chart renders with an
   * empty dataset, producing a placeholder state (Req 5.3).
   *
   * @param {CategoryTotals} categoryTotals - Object with Food, Transport, Fun totals
   * @returns {void}
   *
   * Requirements: 5.1, 5.3, 5.4, 8.4, 8.5
   */
  init(categoryTotals) {
    if (this.isAvailable()) {
      // Hide the fallback container — Chart.js is loaded (Req 8.5)
      if (!this._fallbackContainer) {
        this._fallbackContainer = document.getElementById('chart-fallback');
      }
      this._fallbackContainer.setAttribute('hidden', '');

      // Resolve the canvas element (Req 8.4)
      this._canvas = document.getElementById('chart-canvas');

      // Filter out zero-total categories (Req 5.1, 5.3)
      const allCategories = Object.keys(categoryTotals);
      const activeCategories = allCategories.filter(cat => categoryTotals[cat] > 0);
      const labels = activeCategories;
      const data = activeCategories.map(cat => categoryTotals[cat]);

      // Pre-compute the grand total for percentage calculations (Req 5.4)
      const grandTotal = data.reduce((sum, val) => sum + val, 0);

      // Create the Chart.js pie chart instance (Req 5.1, 5.4, 8.4)
      this._chart = new window.Chart(this._canvas, {
        type: 'pie',
        data: {
          labels: labels,
          datasets: [
            {
              data: data,
              backgroundColor: [
                '#4e79a7', // Food
                '#f28e2b', // Transport
                '#59a14f', // Fun
              ],
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            tooltip: {
              callbacks: {
                /**
                 * Tooltip label callback — shows "Category: $XX.XX (YY.Y%)" (Req 5.4)
                 * @param {import('chart.js').TooltipItem} context
                 * @returns {string}
                 */
                label(context) {
                  const value = context.parsed;
                  const pct = grandTotal > 0
                    ? ((value / grandTotal) * 100).toFixed(1)
                    : '0.0';
                  return context.label + ': ' + formatCurrency(value) + ' (' + pct + '%)';
                },
              },
            },
            legend: {
              display: true,
              position: 'bottom',
            },
          },
        },
      });
    } else {
      // Chart.js CDN unreachable — degrade gracefully to text fallback (Req 8.5)
      this._renderFallback(categoryTotals);
    }
  },

  /**
   * Updates the existing chart data or re-renders.
   *
   * Steps:
   *  1. Filter categoryTotals to only categories with a positive total (> 0),
   *     satisfying Requirements 5.1 and 5.5 (exclude zero/negative amounts).
   *  2. If Chart.js is available AND _chart exists:
   *       a. If there are no positive-total categories (all transactions deleted),
   *          clear the chart data and render an empty-placeholder message on the
   *          canvas context, satisfying Requirement 5.3.
   *       b. Otherwise update _chart.data.labels and _chart.data.datasets[0].data
   *          with the filtered names and values, then call _chart.update() to
   *          re-render without a page reload, satisfying Requirements 5.2, 5.1.
   *  3. If Chart.js is not available: call _renderFallback() to refresh the text
   *     breakdown, satisfying Requirement 8.5.
   *
   * @param {CategoryTotals} categoryTotals - Object with Food, Transport, Fun totals
   * @returns {void}
   *
   * Requirements: 5.1, 5.2, 5.3, 5.5
   */
  update(categoryTotals) {
    // Step 1: Filter to categories with a positive total only (Req 5.1, 5.5)
    const activeCategories = Object.keys(categoryTotals).filter(
      cat => categoryTotals[cat] > 0
    );
    const activeLabels = activeCategories;
    const activeData = activeCategories.map(cat => categoryTotals[cat]);

    if (this.isAvailable() && this._chart) {
      if (activeCategories.length === 0) {
        // Step 2a: No positive-total categories — all transactions deleted (Req 5.3)
        // Clear the chart datasets so no segments are rendered
        this._chart.data.labels = [];
        this._chart.data.datasets[0].data = [];
        this._chart.update();

        // Draw a "no data" placeholder message on the canvas
        const ctx = this._canvas.getContext('2d');
        // Use a post-update draw so dimensions are current
        const width = this._canvas.width;
        const height = this._canvas.height;
        ctx.save();
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#888888';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('No transactions to display', width / 2, height / 2);
        ctx.restore();
      } else {
        // Step 2b: Update chart with current positive-total categories (Req 5.1, 5.2)
        this._chart.data.labels = activeLabels;
        this._chart.data.datasets[0].data = activeData;
        this._chart.update();
      }
    } else if (!this.isAvailable()) {
      // Step 3: Chart.js unavailable — refresh fallback text (Req 8.5)
      this._renderFallback(categoryTotals);
    }
  },
};

// ---------------------------------------------------------------------------
// App Initialization
// ---------------------------------------------------------------------------

/**
 * App initialization handler.
 *
 * On DOMContentLoaded:
 *  1. Wires the error-banner dismiss button (Requirement 8.6 / UIRenderer task).
 *  2. Loads persisted transactions from StorageManager and bootstraps all UI
 *     modules (TransactionManager, UIRenderer, ChartManager).
 *
 * Happy path (Requirements 2.3, 6.3, 6.4):
 *   StorageManager.load() succeeds → set the in-memory list, render the
 *   transaction list, update the balance display, and initialise the pie chart.
 *
 * Error path (Requirement 6.5):
 *   StorageManager.load() throws a StorageError → show the error banner so
 *   the user is informed, then fall through to the same empty-state
 *   initialisation so the app is still usable for the current session.
 *
 * Requirements: 2.3, 6.3, 6.4, 6.5, 1.6, 2.5, 3.4
 */
document.addEventListener('DOMContentLoaded', function () {
  // ── 1. Wire the dismiss button inside #error-banner ──────────────────────
  const errorBanner = document.getElementById('error-banner');
  if (errorBanner) {
    const dismissBtn = errorBanner.querySelector('button');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', function () {
        UIRenderer.hideErrorBanner();
      });
    }
  }

  // ── 2. Load persisted data and initialise all UI modules ─────────────────
  let list;

  try {
    // Attempt to read the stored transaction list (Requirements 2.3, 6.3, 6.4)
    list = StorageManager.load();
  } catch (err) {
    // StorageManager.load() threw a StorageError — inform the user and
    // fall back to an empty list so the app remains functional (Req 6.5)
    if (err && err.type === 'StorageError') {
      UIRenderer.showErrorBanner(err.message);
    }
    list = [];
  }

  // Restore in-memory state (Req 6.3, 6.4)
  TransactionManager.setList(list);

  // Render the transaction list (Req 2.3, 6.4)
  UIRenderer.renderList(list);

  // Render the balance display (Req 4.4 when empty, Req 4.2 otherwise)
  UIRenderer.renderBalance(TransactionManager.getTotal());

  // Initialise the pie chart (Req 5.1, 5.3, 8.4, 8.5)
  ChartManager.init(TransactionManager.getCategoryTotals());

  // ── 3. Form submit handler for #transaction-form ──────────────────────────
  /**
   * Handles the form submit event.
   *
   * Steps:
   *  1. Prevent the default browser form submission / page reload.
   *  2. Read raw values from the three input fields.
   *  3. Run Validator.validate() on the collected form data.
   *  4. Invalid path — show inline field errors and do NOT save (Req 1.4, 1.5).
   *  5. Valid path — clear all field errors, then attempt to add the transaction.
   *       On success the 'transactions:changed' event fired by TransactionManager
   *       handles all UI updates (list, balance, chart, form reset).
   *       On StorageError — show the error banner and leave the form intact so
   *       the user can try again (Req 1.6).
   *
   * Requirements: 1.2, 1.4, 1.5, 1.6
   */
  const transactionForm = document.getElementById('transaction-form');
  if (transactionForm) {
    transactionForm.addEventListener('submit', function (event) {
      // Step 1: Prevent default browser form submission (Req 1.2)
      event.preventDefault();

      // Step 2: Read raw input values from the three form fields
      const name     = document.getElementById('input-name').value;
      const amount   = document.getElementById('input-amount').value;
      const category = document.getElementById('input-category').value;

      const formData = { name, amount, category };

      // Step 3: Validate all fields
      const result = Validator.validate(formData);

      if (!result.valid) {
        // Step 4: Show an inline error for each invalid field (Req 1.4, 1.5)
        // Does NOT save the transaction.
        Object.keys(result.errors).forEach(function (field) {
          UIRenderer.showFieldError(field, result.errors[field]);
        });
        return;
      }

      // Step 5: All fields valid — clear any stale errors and persist (Req 1.2)
      UIRenderer.clearErrors();

      try {
        TransactionManager.add(formData);
        // On success, 'transactions:changed' event drives all subsequent UI
        // updates (renderList, renderBalance, ChartManager.update, resetForm)
        // via the listener wired in task 10.3.
      } catch (err) {
        // StorageError — inform the user; do NOT add transaction (Req 1.6)
        if (err && err.type === 'StorageError') {
          UIRenderer.showErrorBanner(err.message);
        }
      }
    });
  }

  // ── 4. transactions:changed event listener ────────────────────────────────
  /**
   * Handles the custom 'transactions:changed' event dispatched by
   * TransactionManager.add() and TransactionManager.remove() after a
   * successful storage write.
   *
   * Responsibilities:
   *  - Re-renders the full transaction list with the latest in-memory data.
   *  - Updates the balance display to reflect the new total.
   *  - Refreshes the pie chart with the updated category totals.
   *  - Resets the input form to its default empty state.
   *  - Hides any currently visible error banner from a prior operation.
   *
   * This single listener is the sole place where post-mutation UI sync
   * happens, ensuring that both add and delete operations produce a
   * consistent, up-to-date view without duplicating update logic.
   *
   * Requirements: 1.3, 3.3, 4.3, 5.2
   */
  document.addEventListener('transactions:changed', function () {
    // Re-render the transaction list with the current in-memory data (Req 3.3)
    UIRenderer.renderList(TransactionManager.getList());

    // Update the balance display to the new total (Req 4.3)
    UIRenderer.renderBalance(TransactionManager.getTotal());

    // Refresh the pie chart with updated category totals (Req 5.2)
    ChartManager.update(TransactionManager.getCategoryTotals());

    // Reset the input form to its empty/default state (Req 1.3)
    UIRenderer.resetForm();

    // Clear any error banner left over from a previous operation
    UIRenderer.hideErrorBanner();
  });

  // ── 5. Delete click handler on #transaction-list (event delegation) ───────
  /**
   * Handles delete button clicks using event delegation on the transaction list
   * container. Rather than attaching a listener to every delete button, a single
   * listener on #transaction-list inspects each click to see whether it originated
   * from (or within) a .btn-delete element.
   *
   * Flow (Requirements 3.2, 3.3, 3.4, 3.5):
   *  1. Ignore clicks that did not land on a .btn-delete element (Req 3.5).
   *  2. Read the transaction id from the button's data-id attribute.
   *  3. Look up the transaction name from the in-memory list so the confirm
   *     dialog can reference it by name.
   *  4. Show a confirmation prompt via UIRenderer.confirmDelete() (Req 3.2).
   *       - User cancels → exit early; list remains unchanged (Req 3.5).
   *       - User confirms → proceed with deletion.
   *  5. Call TransactionManager.remove(id).
   *       - Success → 'transactions:changed' event drives all UI updates (Req 3.3).
   *       - StorageError thrown → retain the transaction in the list and show an
   *         error banner explaining the failure (Req 3.4).
   *
   * Requirements: 3.2, 3.3, 3.4, 3.5
   */
  const transactionList = document.getElementById('transaction-list');
  if (transactionList) {
    transactionList.addEventListener('click', function (event) {
      // Step 1: Check if the click target is (or is inside) a .btn-delete element
      const deleteBtn = event.target.closest('.btn-delete');
      if (!deleteBtn) {
        return; // Click was not on a delete button — ignore it (Req 3.5)
      }

      // Step 2: Read the transaction id from the delete button's data-id attribute
      const id = deleteBtn.getAttribute('data-id');

      // Step 3: Look up the transaction name for the confirmation dialog
      const transaction = TransactionManager.getList().find(t => t.id === id);
      const transactionName = transaction ? transaction.name : 'this transaction';

      // Step 4: Show confirmation prompt — returns true if confirmed (Req 3.2)
      const confirmed = UIRenderer.confirmDelete(transactionName);
      if (!confirmed) {
        return; // User cancelled — leave the list unchanged (Req 3.5)
      }

      // Step 5: Attempt to remove the transaction (Req 3.3)
      try {
        TransactionManager.remove(id);
        // On success, 'transactions:changed' event drives all UI updates
        // (renderList, renderBalance, ChartManager.update) via listener in step 4.
      } catch (err) {
        // StorageError — retain transaction in list and inform user (Req 3.4)
        if (err && err.type === 'StorageError') {
          UIRenderer.showErrorBanner(err.message);
        }
      }
    });
  }
});
