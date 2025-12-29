import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Revalidate course pages on-demand
 * Usage: POST /api/revalidate-courses with Authorization header
 *
 * This allows you to manually refresh course content immediately
 * after updating your GitHub repository, without waiting for cache expiry.
 */
export async function POST(request: NextRequest) {
  try {
    // Check authorization
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.ANALYTICS_ADMIN_TOKEN; // Reuse existing token

    if (!authHeader || !expectedToken) {
      return NextResponse.json(
        { error: 'Unauthorized - Missing authentication' },
        { status: 401 }
      );
    }

    const token = authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : authHeader;

    if (token !== expectedToken) {
      return NextResponse.json(
        { error: 'Unauthorized - Invalid token' },
        { status: 401 }
      );
    }

    // Revalidate all course-related paths
    revalidatePath('/learn', 'layout');
    revalidatePath('/learn/[course]', 'page');
    revalidatePath('/learn/[course]/[week]/[slug]', 'page');

    console.log('[Revalidate] Successfully revalidated course pages');

    return NextResponse.json({
      success: true,
      message: 'Course pages revalidated successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[Revalidate] Error:', error);
    return NextResponse.json(
      { error: 'Failed to revalidate', details: error.message },
      { status: 500 }
    );
  }
}
