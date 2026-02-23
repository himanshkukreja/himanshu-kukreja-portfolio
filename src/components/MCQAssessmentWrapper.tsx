'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import SimpleMCQAssessment, { SimpleMCQAssessmentHandle } from './SimpleMCQAssessment';
import MCQSectionsWithReset from './MCQSectionsWithReset';
import FocusMode from './FocusMode';
import LessonComments from './LessonComments';
import { MCQAssessment } from '@/lib/mcq-parser';

interface MCQAssessmentWrapperProps {
  assessment: MCQAssessment;
  courseId: string;
  week: string;
  lessonSlug: string;
  weekDisplayName: string;
  previousResource?: { week: string; slug: string; title: string } | null;
  nextResource?: { week: string; slug: string; title: string } | null;
  sidebarLeft: React.ReactNode;
}

export default function MCQAssessmentWrapper({
  assessment,
  courseId,
  week,
  lessonSlug,
  weekDisplayName,
  previousResource,
  nextResource,
  sidebarLeft,
}: MCQAssessmentWrapperProps) {
  const mcqRef = useRef<SimpleMCQAssessmentHandle>(null);

  return (
    <FocusMode
      sidebarLeft={sidebarLeft}
      sidebarRight={
        <MCQSectionsWithReset
          sections={assessment.sections}
          courseId={courseId}
          week={week}
          lessonSlug={lessonSlug}
          assessmentRef={mcqRef}
        />
      }
    >
      {/* Badges and Actions */}
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm font-medium">
            MCQ Assessment
          </span>
        </div>
      </div>

      {/* Render MCQ Assessment */}
      <SimpleMCQAssessment
        ref={mcqRef}
        assessment={assessment}
        courseId={courseId}
        week={week}
        lessonSlug={lessonSlug}
      />

      {/* Comments Section */}
      <LessonComments
        courseId={courseId}
        week={week}
        lessonSlug={lessonSlug}
      />

      {/* Navigation */}
      <nav className="mt-12 pt-8 border-t border-black/10 dark:border-white/10 flex items-center justify-between gap-4">
        {previousResource ? (
          <Link
            href={`/learn/${courseId}/${previousResource.week}/${previousResource.slug}`}
            className="flex items-center gap-2 px-4 py-3 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-all group"
          >
            <ChevronLeft className="w-5 h-5 text-gray-500 dark:text-white/60 group-hover:text-gray-900 dark:hover:text-white group-hover:-translate-x-1 transition-all" />
            <div className="text-left">
              <div className="text-xs text-gray-500 dark:text-white/40">Previous</div>
              <div className="text-gray-900 dark:text-white text-sm font-medium">{previousResource.title}</div>
            </div>
          </Link>
        ) : (
          <div />
        )}
        {nextResource ? (
          <Link
            href={`/learn/${courseId}/${nextResource.week}/${nextResource.slug}`}
            className="flex items-center gap-2 px-4 py-3 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-all group"
          >
            <div className="text-right">
              <div className="text-xs text-gray-500 dark:text-white/40">Next</div>
              <div className="text-gray-900 dark:text-white text-sm font-medium">{nextResource.title}</div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-500 dark:text-white/60 group-hover:text-gray-900 dark:hover:text-white group-hover:translate-x-1 transition-all" />
          </Link>
        ) : (
          <div />
        )}
      </nav>

      {/* Back to Course */}
      <div className="mt-8 text-center">
        <Link
          href={`/learn/${courseId}`}
          className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Course Overview
        </Link>
      </div>
    </FocusMode>
  );
}
