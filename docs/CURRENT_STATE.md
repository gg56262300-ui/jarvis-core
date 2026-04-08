# Current State

## Backend
- Node.js + TypeScript + Express
- SQLite initialized
- Redis/BullMQ ready
- Port 3000 in use by active Jarvis runtime

## Runtime
- Use `npm run dev:hard-clean` for clean start
- Use `npm run dev:status` for verification
- Use `npm run dev:stop` to stop runtime
- Use `npm run smoke` for end-to-end quick validation

## Working features
- Health endpoint
- Jobs status endpoint
- Time route
- Calculator route
- Weather route
- Date route
- Voice formatter with displayText / speechText split

## Known practical rule
- One server window
- One command/test window
- Avoid multiple parallel dev launches
