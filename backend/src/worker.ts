/**
 * Worker entry point — runs as a separate process inside the backend container.
 *
 * Started by the container's start command (`node dist/worker.js` alongside
 * `node dist/server.js`). Two queues:
 *
 *   organic-publish — publishes a scheduled post to its targets (IG, FB Page,
 *                     Threads, TikTok, LinkedIn). One job per post.
 *   meta-sync       — hourly pull of already-published posts + insights from
 *                     Meta/Threads so Analytics has something to show. The
 *                     worker handles both the repeatable sweep job AND
 *                     on-demand single-account jobs scheduled from the API
 *                     (e.g. "Load older history").
 *
 * The ad-launch, audit, and Comment Guard queues live in the ads app (Vass),
 * not here.
 */
import {
  createOrganicPublishWorker,
  getRedisConnection,
} from './services/queue';
import { runPublish as runOrganicPublish } from './services/organic-publish-runner';
import { startMetaSyncWorker, scheduleHourlySync } from './services/meta-sync-runner';
import { closePool } from './db/pool';

async function main() {
  console.log('[worker] starting…');

  const organicPublishWorker = createOrganicPublishWorker(async (data) => {
    await runOrganicPublish(data.postId);
  });

  // Hourly Meta sync. We register the repeatable job once on startup;
  // BullMQ dedupes by job id.
  const metaSyncWorker = startMetaSyncWorker();
  await scheduleHourlySync().catch((err) => {
    console.error('[meta-sync] Failed to schedule hourly sweep:', err);
  });

  organicPublishWorker.on('failed', (job, err) => {
    console.warn(`[organic-publish] job ${job?.id} failed: ${err.message}`);
  });
  organicPublishWorker.on('error', (err) => {
    console.error('[organic-publish] error:', err.message);
  });
  metaSyncWorker.on('failed', (job, err) => {
    console.warn(`[meta-sync] job ${job?.id} failed: ${err.message}`);
  });
  metaSyncWorker.on('error', (err) => {
    console.error('[meta-sync] error:', err.message);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[worker] shutting down…');
    await organicPublishWorker.close();
    await metaSyncWorker.close();
    const conn = getRedisConnection();
    await conn.quit();
    await closePool();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log('[worker] ready, waiting for jobs (organic-publish + meta-sync)');
}

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
