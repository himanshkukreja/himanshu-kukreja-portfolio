import { revalidatePath, revalidateTag } from 'next/cache';
import { COURSE_MAP_TAG } from '@/lib/learn/course';
import { SDM_CONTENT_TAG } from '@/lib/github';
import { invalidateContentSnapshot } from '@/lib/content-snapshot';
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getAdmin } from '@/lib/admin/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Revalidate course pages on-demand
 * Usage: POST /api/revalidate-courses with `Authorization: Bearer <admin session JWT | ANALYTICS_ADMIN_TOKEN>`
 *
 * This allows you to manually refresh course content immediately
 * after updating your GitHub repository, without waiting for cache expiry.
 */
function tokenMatches(given: string, expected: string | undefined) {
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function authorized(request: NextRequest) {
  const header = request.headers.get('authorization') || '';
  const token = (header.startsWith('Bearer ') ? header.slice(7) : header).trim();
  if (tokenMatches(token, process.env.ANALYTICS_ADMIN_TOKEN)) return true;
  return !!(await getAdmin(request));
}

export async function POST(request: NextRequest) {
  try {
    // Admin session (Bearer Supabase JWT) or the server-only ANALYTICS_ADMIN_TOKEN (cron / scripts).
    if (!(await authorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Revalidate all course-related paths
    invalidateContentSnapshot();
    revalidateTag(COURSE_MAP_TAG);
    revalidateTag(SDM_CONTENT_TAG); // the raw GitHub fetches behind every cached course page
    revalidatePath('/learn', 'layout');
    revalidatePath('/learn/[course]', 'page');
    revalidatePath('/learn/[course]/[week]/[slug]', 'page');
    // case files: same pages the CMS publish refreshes (for scripted fixes to published bodies)
    revalidatePath('/stories');
    revalidatePath('/stories/[slug]', 'page');
    revalidatePath('/');
    revalidatePath('/api/search'); // the search palette's index
    revalidatePath('/api/search/transcripts'); // its lecture/short transcript moments
    revalidatePath('/api/search/index/[part]', 'page'); // smart search's document index (/learn/chat)
    revalidatePath('/api/learn/faq/[week]/[slug]', 'page'); // lessons' "Questions learners ask"

    console.log('[Revalidate] Successfully revalidated course pages');

    return NextResponse.json({
      success: true,
      message: 'Course pages revalidated successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Revalidate] Error:', error);
    return NextResponse.json({ error: 'Failed to revalidate' }, { status: 500 });
  }
}
