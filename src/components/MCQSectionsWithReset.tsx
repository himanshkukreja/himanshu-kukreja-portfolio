'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabaseClient } from '@/lib/supabase-client';
import { MCQSection } from '@/lib/mcq-parser';
import MCQSections from './MCQSections';
import { SimpleMCQAssessmentHandle } from './SimpleMCQAssessment';

interface MCQSectionsWithResetProps {
  sections: MCQSection[];
  courseId: string;
  week: string;
  lessonSlug: string;
  assessmentRef?: React.RefObject<SimpleMCQAssessmentHandle>;
}

export default function MCQSectionsWithReset({ 
  sections, 
  courseId, 
  week, 
  lessonSlug,
  assessmentRef,
}: MCQSectionsWithResetProps) {
  const { user } = useAuth();
  const [hasAnswers, setHasAnswers] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Check if user has any answers
  useEffect(() => {
    if (!user) {
      setHasAnswers(false);
      return;
    }

    async function checkAnswers() {
      if (!user) return;
      
      console.log('[MCQSectionsWithReset] Checking for answers...', { courseId, week, lessonSlug, userId: user.id });
      
      const { data: assessment, error: assessmentError } = await supabaseClient
        .from('mcq_assessments')
        .select('id')
        .eq('course_id', courseId)
        .eq('week', week)
        .eq('lesson_slug', lessonSlug)
        .maybeSingle();

      if (assessmentError) {
        console.error('[MCQSectionsWithReset] Assessment error:', assessmentError);
      }

      console.log('[MCQSectionsWithReset] Assessment:', assessment);

      if (!assessment) {
        console.log('[MCQSectionsWithReset] No assessment found');
        setHasAnswers(false);
        return;
      }

      const { data: answers, error: answersError } = await supabaseClient
        .from('mcq_user_answers')
        .select('id')
        .eq('user_id', user.id)
        .eq('assessment_id', assessment.id)
        .limit(1);

      if (answersError) {
        console.error('[MCQSectionsWithReset] Answers error:', answersError);
      }

      const hasAny = (answers?.length || 0) > 0;
      const localCount = assessmentRef?.current?.localAnswersCount || 0;
      const combinedHasAnswers = hasAny || localCount > 0;
      console.log('[MCQSectionsWithReset] Has answers:', combinedHasAnswers, 'DB Count:', answers?.length, 'Local Count:', localCount);
      setHasAnswers(combinedHasAnswers);
    }

    checkAnswers();

    // Check local answers every 500ms to update hasAnswers state
    // This allows the reset button to enable immediately when user selects answers
    const interval = setInterval(() => {
      const localCount = assessmentRef?.current?.localAnswersCount || 0;
      if (localCount > 0 && !hasAnswers) {
        setHasAnswers(true);
      } else if (localCount === 0 && hasAnswers) {
        // Re-check database when local is empty
        checkAnswers();
      }
    }, 500);

    // Subscribe to changes in answers
    const channel = supabaseClient
      .channel(`mcq-answers-${user.id}-${lessonSlug}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'mcq_user_answers',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('[MCQSectionsWithReset] Realtime update received:', payload);
          checkAnswers();
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      channel.unsubscribe();
    };
  }, [user, courseId, week, lessonSlug, hasAnswers]);

  const handleResetAll = async () => {
    if (!user) return;

    const confirmed = confirm('Are you sure you want to reset all your answers? This cannot be undone.');
    if (!confirmed) return;

    setIsResetting(true);
    console.log('Starting reset...');

    try {
      // Get assessment
      console.log('Fetching assessment for:', { courseId, week, lessonSlug });
      const { data: existingAssessment, error: assessmentError } = await supabaseClient
        .from('mcq_assessments')
        .select('id')
        .eq('course_id', courseId)
        .eq('week', week)
        .eq('lesson_slug', lessonSlug)
        .maybeSingle();

      if (assessmentError) {
        console.error('Assessment fetch error:', assessmentError);
        throw assessmentError;
      }

      console.log('Assessment:', existingAssessment);

      if (existingAssessment) {
        // Delete all answers
        console.log('Deleting answers for user:', user.id, 'assessment:', existingAssessment.id);
        const { error: deleteError, count } = await supabaseClient
          .from('mcq_user_answers')
          .delete({ count: 'exact' })
          .eq('user_id', user.id)
          .eq('assessment_id', existingAssessment.id);

        if (deleteError) {
          console.error('Delete error:', deleteError);
          throw deleteError;
        }

        console.log('Deleted rows:', count);
      } else {
        console.log('No assessment found, nothing to delete');
      }

      // Wait a moment to ensure deletion is complete
      await new Promise(resolve => setTimeout(resolve, 500));
      
      console.log('Reloading page...');
      // Reload page to refresh state
      window.location.reload();
    } catch (error) {
      console.error('Failed to reset answers:', error);
      alert(`Failed to reset answers: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`);
      setIsResetting(false);
    }
  };

  return (
    <MCQSections 
      sections={sections}
      onResetAll={handleResetAll}
      isResetting={isResetting}
      hasAnswers={hasAnswers}
    />
  );
}
