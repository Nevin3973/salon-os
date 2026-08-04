import { defineConfig } from "vitest/config";
import path from "node:path";
import "dotenv/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Child processes rather than worker threads: the thread pool intermittently
    // dies with ERR_IPC_CHANNEL_CLOSED on Windows when a suite opens native
    // Prisma handles. Forks are marginally slower but run reliably everywhere.
    pool: "forks",
  },
});
