import { NextRequest, NextResponse } from "next/server";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  return NextResponse.json({
    status: "not_implemented",
    route: `POST /api/documents/${slug}/ops`,
  });
}
