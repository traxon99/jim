/**
 * Client-generated UUIDv7 primary keys (see docs/ARCHITECTURE.md §3):
 * time-sortable, no server round-trip needed to obtain an id. Pass an
 * explicit timestamp to order ids generated within the same millisecond
 * (the random bits alone don't), e.g. a bulk import's outbox entries.
 */
export function uuidv7(timestampMs: number = Date.now()): string {
  const timestamp = BigInt(timestampMs);
  const mask = BigInt(0xff);

  const [a0 = 0, a1 = 0] = crypto.getRandomValues(new Uint8Array(2));
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
