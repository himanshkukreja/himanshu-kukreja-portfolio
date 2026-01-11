/**
 * Calculate estimated reading time for content
 * For technical content, we use slower reading speed to account for:
 * - Complex concepts and terminology
 * - Code examples and diagrams
 * - Time to understand and absorb information
 * Average reading speed for technical content: ~120-150 words per minute
 */

export function calculateReadingTime(content: string): {
  minutes: number;
  words: number;
  text: string;
} {
  // Remove HTML tags and count words
  const text = content.replace(/<[^>]*>/g, ' ');
  const words = text.trim().split(/\s+/).length;

  // Technical content reading speed: 130 words per minute
  // This is slower than normal reading to account for comprehension time
  const wordsPerMinute = 130;
  let rawMinutes = words / wordsPerMinute;

  // Count code blocks (they take extra time to understand)
  const codeBlocks = (content.match(/```/g) || []).length / 2; // Each pair of ``` is one block
  const codeBlockTime = codeBlocks * 2; // Add 2 minutes per code block

  // Add time for code blocks and round up
  const totalMinutes = Math.ceil(rawMinutes + codeBlockTime);

  // Format text
  let text_display: string;
  if (totalMinutes < 1) {
    text_display = '< 1 min read';
  } else if (totalMinutes === 1) {
    text_display = '1 min read';
  } else {
    text_display = `${totalMinutes} min read`;
  }

  return {
    minutes: totalMinutes,
    words,
    text: text_display,
  };
}

/**
 * Format progress percentage to display text
 */
export function formatProgressText(percentage: number): string {
  if (percentage === 0) return 'Not started';
  if (percentage === 100) return 'Completed';
  return `${percentage}% complete`;
}

/**
 * Get progress color based on percentage
 */
export function getProgressColor(percentage: number): {
  bg: string;
  text: string;
  border: string;
} {
  if (percentage === 0) {
    return {
      bg: 'bg-gray-100 dark:bg-gray-800',
      text: 'text-gray-600 dark:text-gray-400',
      border: 'border-gray-300 dark:border-gray-700',
    };
  } else if (percentage < 50) {
    return {
      bg: 'bg-blue-100 dark:bg-blue-900/30',
      text: 'text-blue-600 dark:text-blue-400',
      border: 'border-blue-300 dark:border-blue-700',
    };
  } else if (percentage < 100) {
    return {
      bg: 'bg-yellow-100 dark:bg-yellow-900/30',
      text: 'text-yellow-600 dark:text-yellow-400',
      border: 'border-yellow-300 dark:border-yellow-700',
    };
  } else {
    return {
      bg: 'bg-green-100 dark:bg-green-900/30',
      text: 'text-green-600 dark:text-green-400',
      border: 'border-green-300 dark:border-green-700',
    };
  }
}
