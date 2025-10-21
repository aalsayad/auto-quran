import { NextRequest, NextResponse } from "next/server";

// Cache for access token
let cachedToken: { token: string; expiresAt: number } | null = null;

// Get OAuth2 Access Token
async function getAccessToken(): Promise<string> {
  // Check if we have a valid cached token
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    console.log("✅ Using cached Quran.com API token");
    return cachedToken.token;
  }

  console.log("🔑 Requesting new Quran.com API access token...");

  const clientId = process.env.NEXT_PUBLIC_QURAN_CLIENT_ID;
  const clientSecret = process.env.NEXT_PUBLIC_QURAN_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Quran.com API credentials not found in environment variables"
    );
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64"
  );

  try {
    const response = await fetch(
      "https://oauth2.quran.foundation/oauth2/token",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials&scope=content",
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to get access token: ${response.status} - ${errorText}`
      );
    }

    const data = await response.json();

    // Cache the token (expires in 1 hour, cache for 55 minutes to be safe)
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + 55 * 60 * 1000,
    };

    console.log("✅ Access token obtained successfully");
    return data.access_token;
  } catch (error) {
    console.error("❌ Error getting access token:", error);
    throw error;
  }
}

// API Route Handler
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const pageNumber = searchParams.get("page");

    if (!pageNumber) {
      return NextResponse.json(
        { error: "Page number is required" },
        { status: 400 }
      );
    }

    console.log(`📖 [API] Fetching Mushaf page ${pageNumber}...`);

    // Get access token
    const token = await getAccessToken();
    const clientId = process.env.NEXT_PUBLIC_QURAN_CLIENT_ID!;

    // Fetch verses from Quran.com API
    // Request all word fields including code_v1 which contains verse end markers
    const response = await fetch(
      `https://apis.quran.foundation/content/api/v4/verses/by_page/${pageNumber}?words=true&word_fields=text_uthmani,line_number,page_number,position,code_v1,verse_key`,
      {
        headers: {
          "x-auth-token": token,
          "x-client-id": clientId,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `❌ [API] Failed to fetch page ${pageNumber}: ${response.status} - ${errorText}`
      );
      return NextResponse.json(
        {
          error: `Failed to fetch page ${pageNumber}`,
          details: errorText,
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log(
      `✅ [API] Page ${pageNumber} fetched successfully (${
        data.verses?.length || 0
      } verses)`
    );

    // Log first verse to see the structure - especially the last word
    if (data.verses?.[0]?.words) {
      console.log(
        "📝 [API] First verse - first 3 words:",
        JSON.stringify(data.verses[0].words.slice(0, 3), null, 2)
      );
      console.log(
        "📝 [API] First verse - LAST word:",
        JSON.stringify(data.verses[0].words.slice(-1), null, 2)
      );
      console.log(
        "📝 [API] Total words in first verse:",
        data.verses[0].words.length
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("❌ [API] Error in verses-by-page route:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
