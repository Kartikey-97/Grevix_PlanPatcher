import { NextResponse } from "next/server";
import { handleInterpretDisruption } from "./route-handler";
import type { InterpretationResult } from "../../../lib/ai/disruption-interpreter";

/**
 * Next.js App Router POST handler.
 */
export async function POST(request: Request): Promise<NextResponse<InterpretationResult>> {
  return handleInterpretDisruption(request);
}
