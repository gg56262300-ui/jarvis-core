export class TimeService {
  getToday() {
    const now = new Date();

    const dateText = new Intl.DateTimeFormat('et-EE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(now);

    return {
      iso: now.toISOString(),
      dateText,
      responseText: `Täna on ${dateText}.`,
    };
  }

  getNow() {
    const now = new Date();

    const timeText = new Intl.DateTimeFormat('et-EE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(now);

    const dateText = new Intl.DateTimeFormat('et-EE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(now);

    return {
      iso: now.toISOString(),
      dateText,
      timeText,
      responseText: `Praegu on kell ${timeText}. Täna on ${dateText}.`,
    };
  }
}
