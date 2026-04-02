import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ status: "not_implemented", route: "GET /api/documents" });
}

export async function POST() {
  return NextResponse.json({ status: "not_implemented", route: "POST /api/documents" });
}
