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

type OptionLabel = MCQOption['label'];

// "# Part 1: Name", "## Part 1: Name (Questions 1-25)", "### Section 2 - Name"
const SECTION_HEADER = /^#{1,3}\s+((?:Part|Section)\b.*)$/i;
// "## Questions 1-15"
const RANGE_HEADER = /^#{1,3}\s+(Questions?\s+\d+\s*[-–]\s*\d+.*)$/i;
// "# Answer Key", "## Answer Key", "### Answers - Part 1", "### Part 1 Answers: ..."
const ANSWER_KEY_HEADER = /^#{1,3}\s+(?:answer\s+key\b|answers\s*[-–:]\s*part\b|part\s+\d+\s+answers\b)/i;
// Any H1 ends the answer key (e.g. "# Scoring Guide", "# Next Steps")
const H1 = /^#\s+/;
// "**Q1. text**", "Q1: text", "**1. text**" (bare numbers only when bold, so ordinary lists don't match)
const QUESTION = /^(?:\*\*Q|Q|\*\*(?=\d))(\d+)[.:)]\s*(?:\*\*)?\s*(.*)$/i;
// "A) text" / "A. text"
const OPTION = /^([A-D])[.)]\s+(.+)$/;
// "1. **B** - why", "**1. B** - why", "Q1. B - why", "**Q1.** B"; letter must stand alone
const ANSWER = /^\*{0,2}Q?(\d+)[.)]\*{0,2}\s+\*{0,2}([A-D])(?![A-Za-z])\*{0,2}(?:\s*[-–:]\s*(.+))?/;

/**
 * Parse markdown content to extract MCQ questions
 * Expects format like:
 *
 * # Part 1: Section Name          (or ## / ###)
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
  const answerKey: Record<number, { answer: OptionLabel; explanation?: string }> = {};

  // Push the in-flight question into the section it was read in.
  const flushQuestion = () => {
    if (currentQuestion && currentSection) {
      currentSection.questions.push(currentQuestion as MCQQuestion);
    }
    currentQuestion = null;
  };
  const flushSection = () => {
    flushQuestion();
    if (currentSection) assessment.sections.push(currentSection);
    currentSection = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines
    if (!line) continue;

    // Extract title (first h1)
    if (line.startsWith('# ') && !assessment.title) {
      assessment.title = line.replace('# ', '').trim();
      continue;
    }

    // Answer key section(s)
    if (ANSWER_KEY_HEADER.test(line)) {
      flushSection();
      inAnswerKey = true;
      continue;
    }

    if (inAnswerKey) {
      // A new top-level section (Scoring Guide, Next Steps...) ends the key, so numbered
      // lists there ("3. **Apply** ...") can't overwrite real answers.
      if (H1.test(line)) {
        inAnswerKey = false;
      } else {
        const answerMatch = line.match(ANSWER);
        if (answerMatch) {
          const questionNum = parseInt(answerMatch[1], 10);
          if (!answerKey[questionNum]) {
            answerKey[questionNum] = {
              answer: answerMatch[2] as OptionLabel,
              explanation: answerMatch[3]?.trim(),
            };
          }
        }
        continue;
      }
    }

    // Section headers: "# Part 1: ...", "## Part 1: ...", "### Part 1: ..."
    const sectionMatch = line.match(SECTION_HEADER);
    if (sectionMatch) {
      // Flush the previous question first so the last question of a part stays in that part.
      flushSection();
      const rawTitle = sectionMatch[1].trim();
      // Inline range: "Part 1: Name (Questions 1-25)"
      const inlineRange = rawTitle.match(/\((Questions?\s+\d+\s*[-–]\s*\d+)\)\s*$/i);
      currentSection = {
        title: inlineRange ? rawTitle.slice(0, inlineRange.index).trim() : rawTitle,
        questionRange: inlineRange ? inlineRange[1] : '',
        questions: [],
      };
      continue;
    }

    // Question range header (## Questions 1-15)
    const rangeMatch = line.match(RANGE_HEADER);
    if (rangeMatch) {
      if (currentSection) currentSection.questionRange = rangeMatch[1].trim();
      continue;
    }

    // Detect question start
    const questionMatch = line.match(QUESTION);
    if (questionMatch) {
      flushQuestion();
      currentQuestion = {
        number: parseInt(questionMatch[1], 10),
        text: questionMatch[2].replace(/\*\*/g, '').trim(),
        options: [],
        section: currentSection?.title,
      };
      continue;
    }

    // Parse options (A), B), C), D)
    const optionMatch = line.match(OPTION);
    if (optionMatch && currentQuestion) {
      (currentQuestion as Partial<MCQQuestion>).options?.push({
        label: optionMatch[1] as OptionLabel,
        text: optionMatch[2].trim(),
      });
      continue;
    }
  }

  // Save last question and section
  flushSection();

  // Attach correct answers and explanations from answer key
  assessment.sections.forEach(section => {
    section.questions.forEach(question => {
      if (answerKey[question.number]) {
        question.correctAnswer = answerKey[question.number].answer;
        question.explanation = answerKey[question.number].explanation;
      }
    });
  });

  // Label each section with the questions it actually holds. Source headers can be wrong
  // (Week 1 Part 5 says "Questions 81-100" but holds Q81-Q120).
  assessment.sections.forEach(section => {
    if (section.questions.length === 0) return;
    const nums = section.questions.map(q => q.number);
    const first = Math.min(...nums);
    const last = Math.max(...nums);
    section.questionRange = first === last ? `Question ${first}` : `Questions ${first}-${last}`;
  });

  // Calculate total questions
  assessment.totalQuestions = assessment.sections.reduce(
    (sum, section) => sum + section.questions.length,
    0
  );

  // Extract passing score if mentioned in description
  const passingScoreMatch = markdown.match(/passing.*?(\d+)%/i);
  if (passingScoreMatch) {
    assessment.passingScore = parseInt(passingScoreMatch[1], 10);
  }

  return assessment;
}

/**
 * Check if markdown content is an MCQ assessment
 * by looking for MCQ patterns
 */
export function isMCQDocument(markdown: string): boolean {
  const hasQuestionPattern = /^\s*(?:\*\*Q?|Q)\d+[.:]/im.test(markdown);
  // Support both "Answer Key" and "Answers - Part X" formats
  const hasAnswerKey = /(answer\s+key|answers\s*-\s*part)/i.test(markdown);
  const hasOptions = /^[A-D][.)]\s+/m.test(markdown);

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
