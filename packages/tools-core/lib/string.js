/**
 * Capitalizes the first letter of the given string.
 *
 * @param {string} str – The input string.
 * @returns {string} – The string with its first character uppercased.
 */
export function capitalizeFirstLetter(str) {
  if (typeof str !== 'string' || str.length === 0) {
    return '';
  }
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Shuffles the elements of the given array.
 * @param arr
 * @returns {*}
 */
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; --i) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Shuffles the characters of the given string.
 * @param str
 * @returns {string}
 */
export function shuffleString(str) {
  return shuffleArray(str.split('')).join('');
}

/**
 * Join an array of strings into a human-readable list.
 *
 * @param {string[]} items - The items to join.
 * @param {object}   [opts]
 * @param {string}   [opts.separator=', ']      - Separator between items (except last).
 * @param {string}   [opts.lastSeparator=' and '] - Text to insert before the last item.
 * @returns {string}
 */
export function joinWithAnd(
  items,
  { separator = ', ', lastSeparator = ' and ' } = {},
) {
  const len = items.length;
  if (len === 0) return '';
  if (len === 1) return items[0];
  if (len === 2) return items[0] + lastSeparator + items[1];
  return items
    .slice(0, -1)
    .reduce((acc, item, idx) => {
      return acc + (idx === 0 ? '' : separator) + item;
    }, '') + lastSeparator + items[len - 1];
}
