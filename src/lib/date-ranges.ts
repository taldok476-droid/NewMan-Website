export const BUSINESS_TIME_ZONE = "Asia/Jerusalem";

export function getBusinessDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function monthRangeExclusive(month: string): { from: string; toExclusive: string } {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (!match) throw new Error("Invalid month");
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) throw new Error("Invalid month");
  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  return {
    from: `${year}-${String(monthNumber).padStart(2, "0")}-01`,
    toExclusive: `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`,
  };
}

export function nextDateExclusive(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

export function previousMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return monthNumber === 1 ? `${year - 1}-12` : `${year}-${String(monthNumber - 1).padStart(2, "0")}`;
}

export function nextMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return monthNumber === 12 ? `${year + 1}-01` : `${year}-${String(monthNumber + 1).padStart(2, "0")}`;
}

export function formatHebrewDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
