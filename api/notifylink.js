const express = require("express");
const { MongoClient } = require("mongodb");

const router = express.Router();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const DB_NAME = "notifylink_db";
const COLLECTION_NAME = "device_status";

const OFFLINE_WINDOW_MS = Number(process.env.OFFLINE_WINDOW_MS || 30000);
const HEARTBEAT_GRACE_MS = Number(process.env.HEARTBEAT_GRACE_MS || 15000);
const MAX_CLIENT_CLOCK_SKEW_MS = Number(process.env.MAX_CLIENT_CLOCK_SKEW_MS || 10 * 60 * 1000);

let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) return cachedDb;
  const client = await MongoClient.connect(MONGO_URI);
  const db = client.db(DB_NAME);
  cachedDb = db;
  return db;
}

router.use(async (req, res, next) => {
  try {
    req.db = await connectToDatabase();
    next();
  } catch (err) {
    res.status(500).json({ ok: false, error: "Database connection failed" });
  }
});

function resolveEffectiveOfflineWindowMs(deviceRecord) {
  const reportedHeartbeatInterval = Number(deviceRecord.last_status?.heartbeat_interval_ms || 0);
  if (!Number.isFinite(reportedHeartbeatInterval) || reportedHeartbeatInterval <= 0) {
    return OFFLINE_WINDOW_MS;
  }
  return Math.max(OFFLINE_WINDOW_MS, (reportedHeartbeatInterval * 2) + HEARTBEAT_GRACE_MS);
}

function resolveLastSeenMillis(sentAtMillis, receivedAtMillis) {
  const sentAt = Number(sentAtMillis);
  if (!Number.isFinite(sentAt) || sentAt <= 0) return receivedAtMillis;
  const clockSkew = Math.abs(receivedAtMillis - sentAt);
  if (clockSkew > MAX_CLIENT_CLOCK_SKEW_MS) return receivedAtMillis;
  return sentAt;
}

function buildDeviceResponse(deviceRecord) {
  const now = Date.now();
  const referenceMillis = deviceRecord.last_seen_server_millis || deviceRecord.last_seen_millis || 0;
  const ageMs = now - referenceMillis;
  const effectiveOfflineWindowMs = resolveEffectiveOfflineWindowMs(deviceRecord);
  const stale = ageMs > effectiveOfflineWindowMs;
  const internetActive = !!deviceRecord.last_status?.internet_active;

  return {
    ...deviceRecord,
    computed_status: {
      status_source: "heartbeat",
      online: !stale && internetActive,
      internet_active_last_report: internetActive,
      stale,
      age_ms: ageMs,
      offline_window_ms: effectiveOfflineWindowMs,
      configured_offline_window_ms: OFFLINE_WINDOW_MS
    }
  };
}

router.get("/health", (req, res) => {
  res.json({ ok: true, service: "notifylink-device-status-api", now: Date.now() });
});

router.post("/status", async (req, res) => {
  const body = req.body || {};
  const deviceId = body.device?.device_id;

  if (!deviceId) return res.status(400).json({ ok: false, error: "device.device_id is required" });

  const receivedAt = Date.now();
  const lastSeen = resolveLastSeenMillis(body.sent_at_millis, receivedAt);

  const updateDoc = {
    device_id: deviceId,
    source: body.source || "NotifyLink",
    reason: body.reason || "unknown",
    device: body.device || {},
    last_status: body.status || {},
    last_seen_millis: lastSeen,
    last_seen_server_millis: receivedAt,
    last_seen_iso: new Date(lastSeen).toISOString(),
    last_seen_server_iso: new Date(receivedAt).toISOString(),
    updated_at_iso: new Date().toISOString()
  };

  try {
    await req.db.collection(COLLECTION_NAME).updateOne(
      { device_id: deviceId },
      { $set: updateDoc },
      { upsert: true }
    );
    return res.json({ ok: true, device_id: deviceId, stored_at: Date.now() });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

router.get("/:deviceId/status", async (req, res) => {
  try {
    const record = await req.db.collection(COLLECTION_NAME).findOne({ device_id: req.params.deviceId });
    if (!record) return res.status(404).json({ ok: false, error: "device not found" });
    return res.json({ ok: true, data: buildDeviceResponse(record) });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const devices = await req.db.collection(COLLECTION_NAME).find({}).toArray();
    const items = devices.map(buildDeviceResponse);
    res.json({ ok: true, total: items.length, data: items });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
