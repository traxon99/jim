export interface SessionListEntry {
  id: string;
  name: string | null;
  startedAt: Date;
  endedAt: Date | null;
  totalVolume: number;
  setCount: number;
  prCount: number;
}
