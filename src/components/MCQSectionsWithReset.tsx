'use client';

import { useCallback, useState } from 'react';
import { MCQSection } from '@/lib/mcq-parser';
import MCQSections from './MCQSections';
import ConfirmDialog from './ConfirmDialog';
import Toast from './Toast';
import { SimpleMCQAssessmentHandle } from './SimpleMCQAssessment';

interface MCQSectionsWithResetProps {
  sections: MCQSection[];
  courseId: string;
  week: string;
  lessonSlug: string;
  assessmentRef?: React.RefObject<SimpleMCQAssessmentHandle | null>;
  /** Answers currently held by the assessment (saved + unsaved), reported by its parent. */
  answeredCount?: number;
}

export default function MCQSectionsWithReset({
  sections,
  assessmentRef,
  answeredCount = 0,
}: MCQSectionsWithResetProps) {
  const [isResetting, setIsResetting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const closeToast = useCallback(() => setToast(null), []);

  const hasAnswers = answeredCount > 0;

  // The assessment owns the answers (and their autosave), so reset goes through it: no page
  // reload and no polling the database for a count it already knows.
  const handleConfirmReset = async () => {
    setConfirmOpen(false);
    const assessment = assessmentRef?.current;
    if (!assessment) return;

    setIsResetting(true);
    const ok = await assessment.resetAll();
    setIsResetting(false);
    setToast(ok ? { message: 'All answers cleared', type: 'success' } : { message: 'Could not reset answers. Please try again.', type: 'error' });
  };

  return (
    <>
      <MCQSections
        sections={sections}
        onResetAll={() => setConfirmOpen(true)}
        isResetting={isResetting}
        hasAnswers={hasAnswers}
      />
      <ConfirmDialog
        isOpen={confirmOpen}
        title="Reset all answers?"
        message="This clears every answer on this assessment. It cannot be undone."
        confirmText="Reset answers"
        onConfirm={handleConfirmReset}
        onCancel={() => setConfirmOpen(false)}
      />
      {toast && <Toast message={toast.message} type={toast.type} onClose={closeToast} />}
    </>
  );
}
