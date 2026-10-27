import { NextResponse } from "next/server";
import { status } from "@/lib/server/env";

export const dynamic = "force-dynamic";
export const GET = () => NextResponse.json(status());
