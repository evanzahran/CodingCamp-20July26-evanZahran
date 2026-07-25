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
