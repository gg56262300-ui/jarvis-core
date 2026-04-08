import { listUpcomingEvents } from "../modules/calendar/services/googleCalendar.service.js";

async function main() {
  const events = await listUpcomingEvents(10);

  if (events.length === 0) {
    console.log("No upcoming events found.");
    return;
  }

  console.log("Upcoming events:");
  for (const event of events) {
    console.log(`- ${event.start} | ${event.summary}`);
  }
}

main().catch((error) => {
  console.error("Calendar test failed:");
  console.error(error);
  process.exit(1);
});
