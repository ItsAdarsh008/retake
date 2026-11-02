import { NextResponse } from "next/server";
import { env } from "@/lib/server/env";
import { allowance } from "@/lib/server/budget";
import { visitorOf } from "@/lib/server/request";
import type { Status } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const status: Status = {
    openai: !!env.openaiKey,
    anthropic: !!env.anthropicKey,
    magicHour: !!env.magicHourKey,
    allowance: env.magicHourKey ? await allowance(visitorOf(req)) : null,
  };
  return NextResponse.json(status);
}
