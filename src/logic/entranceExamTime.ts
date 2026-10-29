// Liberia uses UTC+00:00 year-round. Never parse date/time picker values in the browser timezone.
export const LIBERIA_TIME_ZONE = 'Africa/Monrovia';

export function liberiaExamInstant(date: string, time: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error('Choose a valid examination date and time.');
  }
  const parsed = new Date(date + 'T' + time + ':00Z');
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0,10) !== date) {
    throw new Error('Choose a valid examination date.');
  }
  return parsed.toISOString();
}

export function liberiaExamDate(instant: string): string {
  return new Date(instant).toISOString().slice(0,10);
}

export function liberiaExamTime(instant: string): string {
  return new Date(instant).toISOString().slice(11,16);
}

export const examTimeOptions = Array.from({ length: 96 }, (_, index) => {
  const hour = Math.floor(index / 4), minute = (index % 4) * 15;
  const value = String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0');
  const label = String(hour%12 || 12)+':'+String(minute).padStart(2,'0')+' '+(hour < 12 ? 'AM':'PM');
  return { value, label };
});
