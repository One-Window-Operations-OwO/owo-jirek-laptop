import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const npsn = searchParams.get("npsn");

  if (!npsn) {
    return NextResponse.json(
      { error: "NPSN parameter is required" },
      { status: 400 }
    );
  }

  try {
    const externalUrl = `https://jkt-dc01.taila6748c.ts.net/fetch-school-data?npsn=${npsn}`;
    const response = await fetch(externalUrl, {
      method: "POST",
      headers: {
        "accept": "application/json",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `External API error: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching school data:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
