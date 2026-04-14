import { schedule, type ScheduledTask } from "node-cron";
import { logger } from "./logger.js";
import { ask } from "./agent.js";
import { loadCrons, type CronJob } from "./tools/builtin/cron.js";

const activeTasks = new Map<string, ScheduledTask>();

function scheduleCron(job: CronJob): void {
  if (activeTasks.has(job.id)) {
    activeTasks.get(job.id)!.stop();
  }

  const task = schedule(job.schedule, async () => {
    logger.info({ id: job.id, name: job.name, prompt: job.prompt.slice(0, 100) }, "cron triggered");
    try {
      const response = await ask(job.prompt);
      logger.info({ id: job.id, result: response.text.slice(0, 200) }, "cron result");
      // TODO: 之後接 Discord 時，把結果送到指定 channel
      console.log(`[cron:${job.name}] ${response.text}`);
    } catch (err) {
      logger.error({ id: job.id, err }, "cron execution failed");
    }
  });

  activeTasks.set(job.id, task);
}

function loadAndScheduleAll(): void {
  // 先停掉所有現有排程
  for (const task of activeTasks.values()) task.stop();
  activeTasks.clear();

  const jobs = loadCrons();
  let count = 0;
  for (const job of jobs) {
    if (!job.enabled) continue;
    try {
      scheduleCron(job);
      count++;
    } catch (err) {
      logger.error({ id: job.id, schedule: job.schedule, err }, "invalid cron schedule");
    }
  }
  logger.info({ count, total: jobs.length }, "crons loaded");
  console.log(`Loaded ${count} cron jobs (${jobs.length} total)`);
}

// 定期重新載入 crons.json（每 30 秒），這樣 CLI 建的新排程會被撿起來
function startWatcher(): void {
  setInterval(() => {
    loadAndScheduleAll();
  }, 30000);
}

// --- Start ---
console.log("Furet Gateway starting...");
logger.info("gateway start");

loadAndScheduleAll();
startWatcher();

console.log("Furet Gateway running. Press Ctrl+C to stop.");

// 保持 process 不退出
process.on("SIGINT", () => {
  console.log("\nGateway stopped.");
  logger.info("gateway stop");
  process.exit(0);
});
