/**
 * GitHub API Service for fetching content from private system-design-mastery repo
 * Supports fetching directory listings and file contents
 */

const GITHUB_TOKEN = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
const REPO_OWNER = 'himanshkukreja';
const REPO_NAME = 'system-design-mastery';
const BRANCH = 'main';
const BASE_PATH = 'resources';

export type GitHubFile = {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: 'file' | 'dir';
  download_url: string | null;
};

export type Course = {
  id: string;
  title: string;
  description: string;
  repo: string;
  resourceCount: number;
  weeksCount: number;
};

export type LearningResource = {
  slug: string;
  title: string;
  course: string; // course ID
  week: string;
  day?: string;
  path: string;
  type: 'week-preview' | 'day-content' | 'capstone' | 'foundations' | 'overview';
  order: number;
};

/**
 * Fetch file or directory contents from GitHub
 */
export async function fetchGitHubContent(path: string): Promise<GitHubFile[]> {
  if (!GITHUB_TOKEN) {
    throw new Error('GITHUB_PERSONAL_ACCESS_TOKEN is not configured');
  }

  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${BRANCH}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    next: { revalidate: 3600 } // Cache for 1 hour
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data : [data];
}

/**
 * Fetch raw markdown content from GitHub
 */
export async function fetchMarkdownContent(path: string): Promise<string> {
  if (!GITHUB_TOKEN) {
    throw new Error('GITHUB_PERSONAL_ACCESS_TOKEN is not configured');
  }

  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${BRANCH}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3.raw',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    next: { revalidate: 3600 } // Cache for 1 hour
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch markdown (${response.status}): ${errorText}`);
  }

  return response.text();
}

/**
 * Get all available courses
 */
export async function getAllCourses(): Promise<Course[]> {
  // For now, we have one course - System Design Mastery
  // In the future, this could fetch from multiple repos or a config file
  const resources = await getAllLearningResources();
  const weeks = await getAllWeeks();

  return [
    {
      id: 'system-design-mastery',
      title: 'System Design Mastery',
      description: '10-week intensive learning path for backend engineers moving from intermediate to advanced',
      repo: 'system-design-mastery',
      resourceCount: resources.length,
      weeksCount: weeks.length,
    },
  ];
}

/**
 * Get all weeks from the resources directory
 */
export async function getAllWeeks(): Promise<string[]> {
  const contents = await fetchGitHubContent(BASE_PATH);

  return contents
    .filter(item => item.type === 'dir' && item.name.startsWith('week-'))
    .map(item => item.name)
    .sort();
}

/**
 * Get all learning resources organized by week
 */
export async function getAllLearningResources(): Promise<LearningResource[]> {
  const weeks = await getAllWeeks();
  const resources: LearningResource[] = [];

  // Add the main learning plan
  try {
    const planExists = await fetchGitHubContent(`${BASE_PATH}/system-design-learning-plan.md`);
    if (planExists.length > 0) {
      resources.push({
        slug: 'plan',
        title: 'System Design Mastery: 10-Week Plan',
        course: 'system-design-mastery',
        week: 'overview',
        path: `${BASE_PATH}/system-design-learning-plan.md`,
        type: 'overview',
        order: 0,
      });
    }
  } catch {
    // File doesn't exist, skip
  }

  // Process each week
  for (const week of weeks) {
    const weekFiles = await fetchGitHubContent(`${BASE_PATH}/${week}`);

    for (const file of weekFiles) {
      if (file.type === 'file' && file.name.endsWith('.md')) {
        const resource = parseFileToResource(file, week);
        if (resource) {
          resources.push(resource);
        }
      }
    }
  }

  return resources.sort((a, b) => a.order - b.order);
}

/**
 * Parse GitHub file metadata to LearningResource
 */
function parseFileToResource(file: GitHubFile, week: string): LearningResource | null {
  const fileName = file.name.replace('.md', '');

  // Determine type based on filename pattern
  let type: LearningResource['type'] = 'day-content';
  let title = fileName;
  let day: string | undefined;
  let order = 1000; // Default order

  if (fileName.includes('preview')) {
    type = 'week-preview';
    title = `${week.toUpperCase()} Preview`;
    order = getWeekOrder(week) * 100;
  } else if (fileName.includes('capstone')) {
    type = 'capstone';
    title = extractTitle(fileName);
    order = getWeekOrder(week) * 100 + 99;
  } else if (fileName.includes('foundations')) {
    type = 'foundations';
    title = extractTitle(fileName);
    const partNum = fileName.match(/part-(\d+)/)?.[1];
    order = parseInt(partNum || '1');
  } else if (fileName.startsWith('day-')) {
    type = 'day-content';
    const dayMatch = fileName.match(/day-(\d+)/);
    if (dayMatch) {
      day = `day-${dayMatch[1]}`;
      order = getWeekOrder(week) * 100 + parseInt(dayMatch[1]);
    }
    title = extractTitle(fileName);
  }

  return {
    slug: fileName,
    title,
    course: 'system-design-mastery',
    week: week,
    day,
    path: file.path,
    type,
    order,
  };
}

/**
 * Extract human-readable title from filename
 */
function extractTitle(fileName: string): string {
  // Remove day-XX- or week-XX- prefix
  let title = fileName.replace(/^(day-\d+-|week-\d+-|capstone-|foundations-)/, '');

  // Convert hyphens to spaces and capitalize
  title = title
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return title;
}

/**
 * Get numeric order for week (week-00 = 0, week-01 = 1, etc.)
 */
function getWeekOrder(week: string): number {
  const match = week.match(/week-(\d+)/);
  return match ? parseInt(match[1]) : 999;
}

/**
 * Get a specific learning resource by week and slug
 */
export async function getLearningResource(week: string, slug: string): Promise<{ resource: LearningResource; content: string } | null> {
  try {
    const allResources = await getAllLearningResources();
    const resource = allResources.find(r => r.week === week && r.slug === slug);

    if (!resource) {
      return null;
    }

    const content = await fetchMarkdownContent(resource.path);

    return {
      resource,
      content,
    };
  } catch (error) {
    console.error(`Error fetching resource ${week}/${slug}:`, error);
    return null;
  }
}

/**
 * Get resources for a specific week
 */
export async function getWeekResources(week: string): Promise<LearningResource[]> {
  const allResources = await getAllLearningResources();
  return allResources.filter(r => r.week === week);
}
