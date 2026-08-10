/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Safely formats a value as a currency string.
 *
 * This function handles cases where the input value might be null, undefined,
 * a non-numeric string, or NaN. It ensures that a valid currency format
 * is always returned.
 *
 * @param value - The value to format. Can be a number, string, null, or undefined.
 * @param decimals - The number of decimal places to show.
 * @returns A formatted currency string (e.g., "$12.34"). Returns "$0.00" for invalid inputs.
 */
export function formatCurrency(value: any, decimals = 2): string {
  // 1. Handle null, undefined, or non-coercible types
  if (value === null || value === undefined) {
    return `$${(0).toFixed(decimals)}`;
  }

  // 2. Coerce to a number
  const numericValue = Number(value);

  // 3. Check if the result is a valid number
  if (isNaN(numericValue)) {
    return `$${(0).toFixed(decimals)}`;
  }

  // 4. Format the valid number
  return `$${numericValue.toFixed(decimals)}`;
}
