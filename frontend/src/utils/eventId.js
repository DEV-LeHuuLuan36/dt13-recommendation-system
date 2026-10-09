// Build a stable eventId for a single ProductDetail mount. The same productId
// in the same mount reuses the id; revisiting the page later creates a new one
// because the component remounts.

let counter = 0;

export function newEventId(prefix) {
  counter += 1;
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${stamp}_${counter}_${rand}`;
}
