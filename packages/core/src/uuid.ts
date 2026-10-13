let lastMs = -1;
let counter = 0;

/**
 * The 12-bit rand_a field for a clock-stamped id: a counter that rises
 * within one millisecond (RFC 9562 §6.2 method 1), so ids made in the same
 * millisecond still sort in creation order. The outbox drains in id order,
 * so without it a set could reach the server before its session (#593).
 */
function nextCounter(): { ms: number; randA: number } {
  const now = Date.now();
  if (now > lastMs) {
    lastMs = now;
    // Start in the lower half so the counter has room to rise.
    counter = (crypto.getRandomValues(new Uint8Array(1))[0] ?? 0) & 0x7f;
  } else {
    counter++;
    if (counter > 0xfff) {
      // Counter exhausted: borrow the next millisecond.
      lastMs++;
      counter = 0;
    }
  }
  return { ms: lastMs, randA: counter };
}

/**
 * Client-generated UUIDv7 primary keys (see docs/ARCHITECTURE.md §3):
 * time-sortable, no server round-trip needed to obtain an id. Ids made
 * without a timestamp sort in creation order, even within one millisecond.
 * Pass an explicit timestamp to stamp an id with another time, e.g. a bulk
 * import's or a backdated weigh-in's.
 */
export function uuidv7(timestampMs?: number): string {
  let ms: number;
  let randA: number;
  if (timestampMs === undefined) {
    ({ ms, randA } = nextCounter());
  } else {
    const [r0 = 0, r1 = 0] = crypto.getRandomValues(new Uint8Array(2));
    ms = timestampMs;
    randA = ((r0 & 0x0f) << 8) | r1;
  }
  const timestamp = BigInt(ms);
  const mask = BigInt(0xff);

  const a0 = randA >> 8;
  const a1 = randA & 0xff;
  const [b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, b7 = 0] = crypto.getRandomValues(
    new Uint8Array(8),
  );

  const bytes = [
    Number((timestamp >> BigInt(40)) & mask),
    Number((timestamp >> BigInt(32)) & mask),
    Number((timestamp >> BigInt(24)) & mask),
    Number((timestamp >> BigInt(16)) & mask),
    Number((timestamp >> BigInt(8)) & mask),
    Number(timestamp & mask),
    0x70 | (a0 & 0x0f), // version 7
    a1,
    0x80 | (b0 & 0x3f), // variant 10
    b1,
    b2,
    b3,
    b4,
    b5,
    b6,
    b7,
  ];

  const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
