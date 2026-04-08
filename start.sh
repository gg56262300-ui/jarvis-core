#!/bin/bash

PORT=3000

# kui port on kinni → tapa protsess
if lsof -i :$PORT -t >/dev/null ; then
  echo "⚠️ Port $PORT occupied → killing..."
  kill -9 $(lsof -t -i:$PORT)
  sleep 1
fi

echo "🚀 Starting server on port $PORT..."
PORT=$PORT npm run dev
