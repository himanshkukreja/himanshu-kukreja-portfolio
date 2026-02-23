/**
 * MCQ Parser Utility
 * Parses markdown MCQ format into structured data
 */

export type MCQOption = {
  label: 'A' | 'B' | 'C' | 'D';
  text: string;
};

export type MCQQuestion = {
  number: number;
  text: string;
  options: MCQOption[];
  correctAnswer: 'A' | 'B' | 'C' | 'D';
  explanation?: string; // Explanation for the correct answer
  section?: string; // Part 1, Part 2, etc.
};

export type MCQAssessment = {
  title: string;
  description: string;
  sections: MCQSection[];
  totalQuestions: number;
  passingScore?: number;
};

export type MCQSection = {
  title: string;
  questionRange: string; // e.g., "Q1-Q15" or "Questions 1-15"
  questions: MCQQuestion[];
};

/**
 * Parse markdown content to extract MCQ questions
 * Expects format like:
 * 
 * # Part 1: Section Name
 * ## Questions 1-15
 * **Q1. Question text?**
 * A) Option A
 * B) Option B
 * C) Option C
 * D) Option D
 */
export function parseMCQMarkdown(markdown: string): MCQAssessment {
  const lines = markdown.split('\n');
  const assessment: MCQAssessment = {
    title: '',
    description: '',
    sections: [],
    totalQuestions: 0,
  };

  let currentSection: MCQSection | null = null;
  let currentQuestion: Partial<MCQQuestion> | null = null;
  let inAnswerKey = false;
  const answerKey: Record<number, { answer: 'A' | 'B' | 'C' | 'D'; explanation?: string }> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines
    if (!line) continue;

    // Extract title (first h1)
    if (line.startsWith('# ') && !assessment.title) {
      assessment.title = line.replace('# ', '').trim();
      continue;
    }

    // Check if we're in the Answer Key section
    // Support both "# Answer Key" and "### Answers - Part X" formats
    if (line.match(/(answer\s+key|###\s+answers\s*-\s*part)/i)) {
      inAnswerKey = true;
      continue;
    }

    // Parse answer key
    if (inAnswerKey) {
      // Match patterns like "1. B - Explanation" or "1. **B** - Explanation" or "Q1. B - Explanation" or "**Q1.** B - Explanation"
      const answerMatch = line.match(/\*?\*?Q?(\d+)[\.)\.]\*?\*?\s+\*?\*?([A-D])\*?\*?(?:\s*-\s*(.+))?/i);
      if (answerMatch) {
        const questionNum = parseInt(answerMatch[1]);
        const answer = answerMatch[2].toUpperCase() as 'A' | 'B' | 'C' | 'D';
        const explanation = answerMatch[3]?.trim();
        answerKey[questionNum] = { answer, explanation };
      }
      continue;
    }

    // Detect section headers (# Part 1: ...)
    if (line.startsWith('# Part') || line.startsWith('# Section')) {
      if (currentSection) {
        assessment.sections.push(currentSection);
      }
      currentSection = {
        title: line.replace('# ', '').trim(),
        questionRange: '',
        questions: [],
      };
      continue;
    }

    // Detect question range (## Questions 1-15)
    if (line.startsWith('## Questions') && currentSection) {
      currentSection.questionRange = line.replace('## ', '').trim();
      continue;
    }

    // Detect question start
    // Matches: **Q1. text?** or **Q1: text?** or Q1. text?
    const questionMatch = line.match(/^\*?\*?Q(\d+)[\.\:\)]?\s+(.*)/i);
    if (questionMatch) {
      // Save previous question if exists
      if (currentQuestion && currentSection) {
        currentSection.questions.push(currentQuestion as MCQQuestion);
      }

      const questionNum = parseInt(questionMatch[1]);
      const questionText = questionMatch[2]
        .replace(/\*\*/g, '') // Remove bold markers
        .trim();

      currentQuestion = {
        number: questionNum,
        text: questionText,
        options: [],
        section: currentSection?.title,
      };
      continue;
    }

    // Parse options (A), B), C), D)
    const optionMatch = line.match(/^([A-D])[\.\)]\s+(.+)/i);
    if (optionMatch && currentQuestion) {
      const label = optionMatch[1].toUpperCase() as 'A' | 'B' | 'C' | 'D';
      const text = optionMatch[2].trim();
      currentQuestion.options?.push({ label, text });
      continue;
    }
  }

  // Save last question and section
  if (currentQuestion && currentSection) {
    currentSection.questions.push(currentQuestion as MCQQuestion);
  }
  if (currentSection) {
    assessment.sections.push(currentSection);
  }

  // Attach correct answers and explanations from answer key
  assessment.sections.forEach(section => {
    section.questions.forEach(question => {
      if (answerKey[question.number]) {
        question.correctAnswer = answerKey[question.number].answer;
        question.explanation = answerKey[question.number].explanation;
      }
    });
  });

  // Calculate total questions
  assessment.totalQuestions = assessment.sections.reduce(
    (sum, section) => sum + section.questions.length,
    0
  );

  // Extract passing score if mentioned in description
  const passingScoreMatch = markdown.match(/passing.*?(\d+)%/i);
  if (passingScoreMatch) {
    assessment.passingScore = parseInt(passingScoreMatch[1]);
  }

  return assessment;
}

/**
 * Check if markdown content is an MCQ assessment
 * by looking for MCQ patterns
 */
export function isMCQDocument(markdown: string): boolean {
  const hasQuestionPattern = /\*?\*?Q\d+[\.\:]/.test(markdown);
  // Support both "Answer Key" and "Answers - Part X" formats
  const hasAnswerKey = /(answer\s+key|answers\s*-\s*part)/i.test(markdown);
  const hasOptions = /^[A-D][\.\)]\s+/m.test(markdown);
  
  return hasQuestionPattern && hasAnswerKey && hasOptions;
}

/**
 * Extract assessment metadata from markdown frontmatter or content
 */
export function extractAssessmentMetadata(markdown: string) {
  const titleMatch = markdown.match(/^#\s+(.+)/m);
  const descriptionMatch = markdown.match(/^>\s*(.+)/m);
  const timeMatch = markdown.match(/time.*?(\d+)\s*(min|minutes)/i);
  const passingMatch = markdown.match(/passing.*?(\d+)%/i);

  return {
    title: titleMatch ? titleMatch[1].trim() : 'MCQ Assessment',
    description: descriptionMatch ? descriptionMatch[1].trim() : '',
    timeLimit: timeMatch ? parseInt(timeMatch[1]) * 60 : null, // convert to seconds
    passingScore: passingMatch ? parseInt(passingMatch[1]) : null,
  };
}
