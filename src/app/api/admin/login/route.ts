import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { password } = await request.json();
  
  const adminPassword = process.env.ADMIN_PASSWORD;
  
  if (!adminPassword) {
    return NextResponse.json(
      { error: "Admin password not configured" },
      { status: 500 }
    );
  }
  
  if (password === adminPassword) {
    const cookieStore = await cookies();
    cookieStore.set("admin_session", "true", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 1 week
    });
    
    return NextResponse.json({ success: true });
  }
  
  return NextResponse.json(
    { error: "Invalid password" },
    { status: 401 }
  );
}
