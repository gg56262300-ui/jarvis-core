# Calendar create diagnosis - 2026-04-09

Result:
- READ: OK
- DIRECT CALENDAR CREATE: OK
- VOICE API CREATE: OK
- CHAT UI CREATE: FAIL/HANG

Conclusion:
- Google Calendar integration works
- backend create path works
- voice API create works
- failure is in chat/UI layer, not in Google Calendar write path

Next repair branch:
- inspect ChatGPT/Jarvis chat-side create request/response handling
