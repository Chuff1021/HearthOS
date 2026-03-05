import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { getTodos } from '@/lib/todos';
import { getTechDirectory } from '@/lib/tech-directory';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedEmail = searchParams.get('email')?.toLowerCase();

    let email = requestedEmail;
    let linkedTechId: string | undefined;
    let userName = '';

    const { userId } = await auth();
    if (userId) {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      email = email || user.primaryEmailAddress?.emailAddress?.toLowerCase();
      linkedTechId = user.unsafeMetadata?.techId as string | undefined;
      userName = user.fullName || user.firstName || '';
    }

    const techs = await getTechDirectory();
    let tech = linkedTechId ? techs.find((t) => t.id === linkedTechId) : null;

    if (!tech && email) {
      tech = techs.find((t) => (t.email || '').toLowerCase() === email) || null;
    }

    if (!tech && userName) {
      const nameLower = userName.toLowerCase();
      tech = techs.find((t) => {
        const tName = String(t.name || '').toLowerCase();
        return tName === nameLower || nameLower.includes(tName.split(' ')[0] || '');
      }) || null;
    }

    if (!tech) {
      return NextResponse.json({
        todos: [],
        unresolved: true,
        reason: email ? `No team member found for ${email}` : 'No signed-in user mapping found',
      });
    }

    const todosById = await getTodos({ assignedTo: tech.id });
    const all = await getTodos();
    const todosByEmail = email ? all.filter((t: any) => String(t.assignedToEmail || '').toLowerCase() === String(email).toLowerCase()) : [];
    const todosByName = all.filter((t) =>
      !!t.assignedToName && t.assignedToName.toLowerCase() === String(tech!.name || '').toLowerCase()
    );
    const seen = new Set<string>();
    const todos = [...todosById, ...todosByEmail, ...todosByName].filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
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
