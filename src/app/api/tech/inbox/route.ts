import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { getTechs } from '@/app/api/techs/route';
import { getTodos } from '@/lib/todos';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedEmail = searchParams.get('email')?.toLowerCase();

    let email = requestedEmail;
    if (!email) {
      const { userId } = await auth();
      if (userId) {
        const client = await clerkClient();
        const user = await client.users.getUser(userId);
        email = user.primaryEmailAddress?.emailAddress?.toLowerCase();
      }
    }

    const techs = getTechs();
    const tech = email ? techs.find((t) => (t.email || '').toLowerCase() === email) : null;

    if (!tech) {
      return NextResponse.json({
        todos: [],
        unresolved: true,
        reason: email ? `No team member found for ${email}` : 'No signed-in user email found',
      });
    }

    const todos = getTodos({ assignedTo: tech.id });
    return NextResponse.json({
      tech: { id: tech.id, name: tech.name, email: tech.email },
      todos,
      total: todos.length,
      callbackCount: todos.filter((t) => /call back/i.test(t.title) || !!t.relatedCustomerPhone).length,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load tech inbox' }, { status: 500 });
  }
}
