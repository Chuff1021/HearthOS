import { NextResponse } from 'next/server';
import { getJobs } from '@/app/api/jobs/route';
import { getTechs } from '@/app/api/techs/route';

export interface ScheduleJob {
  id: string;
  title: string;
  customer: string;
  techId: string;
  day: number;
  startHour: number;
  duration: number;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  jobType: 'cleaning' | 'inspection' | 'repair' | 'installation' | 'service' | 'estimate';
}

export interface Tech {
  id: string;
  name: string;
  color: string;
  initials: string;
  active: boolean;
}

async function toScheduleJobs(): Promise<ScheduleJob[]> {
  const jobs = await getJobs();
  return jobs.flatMap((j) => {
    const startHour = Number((j.scheduledTimeStart || '09:00').split(':')[0] || 9);
    const endHour = Number((j.scheduledTimeEnd || '10:00').split(':')[0] || startHour + 1);
    const duration = Math.max(1, endHour - startHour);
    const day = new Date(j.scheduledDate).getDay();

    const mappedStatus: ScheduleJob['status'] = j.status === 'on_hold' ? 'scheduled' : (j.status as ScheduleJob['status']);
    if (!j.assignedTechs?.length) {
      return [{
        id: `${j.id}-unassigned`,
        title: j.title,
        customer: j.customerName,
        techId: 'unassigned',
        day,
        startHour,
        duration,
        status: mappedStatus,
        jobType: j.jobType,
      } as ScheduleJob];
    }

    return j.assignedTechs.map((t) => ({
      id: `${j.id}-${t.id}`,
      title: j.title,
      customer: j.customerName,
      techId: t.id,
      day,
      startHour,
      duration,
      status: mappedStatus,
      jobType: j.jobType,
    }));
  });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const techId = searchParams.get('techId');

    let jobs = await toScheduleJobs();
    if (techId) jobs = jobs.filter((j) => j.techId === techId);

    const technicians: Tech[] = getTechs().map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      initials: t.initials,
      active: t.active,
    }));

    return NextResponse.json({ jobs, technicians });
  } catch (err) {
    console.error('Failed to get schedule:', err);
    return NextResponse.json({ error: 'Failed to get schedule' }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json({ error: 'Create jobs via /api/jobs' }, { status: 405 });
}

export async function PUT() {
  return NextResponse.json({ error: 'Update jobs via /api/jobs' }, { status: 405 });
}
