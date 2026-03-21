#!/bin/sh
set -eu

INTERVAL_SECONDS="${IOT_SYNC_INTERVAL_SECONDS:-10800}"

echo "[iot-sync-worker] Start at $(date -Iseconds), interval=${INTERVAL_SECONDS}s"

while true; do
  echo "[iot-sync-worker] Trigger sync at $(date -Iseconds)"

  node -e '
    const svc = require("./src/services/iotSyncService");
    svc.syncAllStations()
      .then((r) => {
        console.log("[iot-sync-worker] Sync completed", JSON.stringify({
          totalStations: r.totalStations,
          successful: r.successful,
          failed: r.failed,
          totalInserted: r.totalInserted,
          totalUpdated: r.totalUpdated,
        }));
        process.exit(0);
      })
      .catch((err) => {
        console.error("[iot-sync-worker] Sync failed", err && err.message ? err.message : err);
        process.exit(1);
      });
  ' || true

  echo "[iot-sync-worker] Sleep ${INTERVAL_SECONDS}s"
  sleep "${INTERVAL_SECONDS}"
done
