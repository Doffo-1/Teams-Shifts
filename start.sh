#!/bin/sh
if [ ! -f /app/data/shifts.db ]; then
  echo "Initializing new database..."
  cp /app/prisma/dev.db /app/data/shifts.db
fi

echo "Applying database schema updates..."
npx --yes prisma@5 db push --skip-generate --accept-data-loss

echo "Starting server..."
node server.js
