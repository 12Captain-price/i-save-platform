// Office payout entries use Zimbabwe time explicitly, never the workstation's
// timezone. Africa/Harare is UTC+02:00 for the supported modern payment dates.
export function hararePayoutInstant(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) {
    throw new Error('Enter a valid payout date and time in Harare (UTC+02:00).');
  }
  const local = value.length === 16 ? `${value}:00` : value;
  const instant = new Date(`${local}+02:00`);
  if (!Number.isFinite(instant.getTime()) ||
      new Date(instant.getTime() + 2 * 60 * 60 * 1000).toISOString().slice(0, 19) !== local) {
    throw new Error('Enter a valid payout date and time in Harare (UTC+02:00).');
  }
  return instant.toISOString();
}
