/* Print a rendered document one family per console message. A
 * console message crosses a 256 KiB ring from the V8 jail to the
 * daemon and one that does not fit is dropped without a word; a whole
 * /proc walk rendered as one string is past that on a busy host,
 * while a family never is. The console lane writes one line per
 * message, so the scrape reads the same text, families separated by
 * a newline instead of a blank line, which the exposition format
 * allows.
 */
export const emit = (text) => {
  for (const family of text.split("\n\n")) {
    const line = family.trimEnd();
    if (line) console.log(line);
  }
};
