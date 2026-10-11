import { handleRunRecovery } from "./route-handler";

/**
 * Next.js App Router POST handler for recovery orchestration.
 */
export async function POST(request: Request) {
  return handleRunRecovery(request);
}
