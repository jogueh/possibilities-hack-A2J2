// W3-OWNED endpoint: POST /api/node/talking-points → { tip }. See plan.md
import { NextResponse } from "next/server";
import {
  generateTalkingPoint,
  type TalkingPointRequest,
} from "./logic";

export async function POST(request: Request) {
  let body: Partial<TalkingPointRequest>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const req: TalkingPointRequest = {
    goalRaw: body.goalRaw ?? "",
    viewerSummary: body.viewerSummary ?? "",
    targetSummary: body.targetSummary ?? "",
    sharedContext: body.sharedContext ?? [],
  };

  const result = await generateTalkingPoint(req);
  return NextResponse.json(result);
}
