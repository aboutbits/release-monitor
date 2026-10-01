/** Converts an optional ISO timestamp from a forge to a Date for a database column. */
export function toDate(value: string | null): Date | null {
  return value ? new Date(value) : null
}
