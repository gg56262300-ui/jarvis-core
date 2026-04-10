import {
  clearLastCalendarAction,
  readLastCalendarAction,
  type CalendarLastAction,
} from './calendarActionJournal.js';
import {
  createCalendarEvent,
  deleteCalendarEventById,
  updateCalendarEventById,
} from '../modules/calendar/services/googleCalendar.service.js';

type UndoResult =
  | {
      status: 'nothing_to_undo';
      responseText: string;
    }
  | {
      status: 'undone';
      responseText: string;
      undoneActionType: CalendarLastAction['type'];
    };

export async function undoLastCalendarAction(): Promise<UndoResult> {
  const lastAction = await readLastCalendarAction();

  if (!lastAction) {
    return {
      status: 'nothing_to_undo',
      responseText: 'Viimast kalendritoimingut ei leitud.',
    };
  }

  if (lastAction.type === 'create') {
    await deleteCalendarEventById(lastAction.event.id);
    await clearLastCalendarAction();

    return {
      status: 'undone',
      responseText: `Viimane kalendrisse lisamine tühistati: ${lastAction.event.summary}.`,
      undoneActionType: lastAction.type,
    };
  }

  if (lastAction.type === 'update') {
    await updateCalendarEventById({
      eventId: lastAction.after.id,
      start: lastAction.before.start,
      end: lastAction.before.end,
    });
    await clearLastCalendarAction();

    return {
      status: 'undone',
      responseText: `Viimane kalendrimuudatus tühistati: ${lastAction.after.summary}.`,
      undoneActionType: lastAction.type,
    };
  }

  await createCalendarEvent({
    title: lastAction.event.summary,
    start: lastAction.event.start,
    end: lastAction.event.end,
  });
  await clearLastCalendarAction();

  return {
    status: 'undone',
    responseText: `Viimane kalendrikustutus taastati: ${lastAction.event.summary}.`,
    undoneActionType: lastAction.type,
  };
}
