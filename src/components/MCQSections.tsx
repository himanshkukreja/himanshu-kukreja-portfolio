'use client';

import { MCQSection } from '@/lib/mcq-parser';
import { useEffect, useState } from 'react';

interface MCQSectionsProps {
  sections: MCQSection[];
  onResetAll?: () => void;
  isResetting?: boolean;
  hasAnswers?: boolean;
  activeSection?: string | null;
}

export default function MCQSections({ sections, onResetAll, isResetting, hasAnswers }: MCQSectionsProps) {
  const [activeSection, setActiveSection] = useState<string | null>(null);

  // Track active section on scroll
  useEffect(() => {
    const handleScroll = () => {
      for (const section of sections) {
        const id = section.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const element = document.getElementById(id);
        if (element) {
          const rect = element.getBoundingClientRect();
          // Check if section is in viewport (considering sticky header)
          if (rect.top >= 0 && rect.top <= 300) {
            setActiveSection(id);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Initial check
    return () => window.removeEventListener('scroll', handleScroll);
  }, [sections]);
  const scrollToSection = (sectionTitle: string) => {
    // Create an ID from section title (same as rendered in SimpleMCQAssessment)
    const id = sectionTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const element = document.getElementById(id);
    if (element) {
      const offset = 100; // Account for sticky header
      const elementPosition = element.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({
        top: elementPosition - offset,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="sticky top-24 space-y-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">
        Sections
      </h3>
      <nav className="space-y-2">
        {sections.map((section) => {
          const sectionId = section.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          const isActive = activeSection === sectionId;
          
          return (
            <button
              key={section.title}
              onClick={() => scrollToSection(section.title)}
              className={`block w-full text-left text-sm transition-colors py-2 px-3 rounded-lg ${
                isActive
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border-l-2 border-indigo-600 dark:border-indigo-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <div className="font-medium">{section.title}</div>
              <div className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                {section.questionRange} • {section.questions.length} questions
              </div>
            </button>
          );
        })}
      </nav>
      
      <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
        <div className="text-xs text-gray-500 dark:text-gray-400">
          <div className="font-medium mb-2">Quick Stats</div>
          <div className="space-y-1">
            <div>Total Sections: {sections.length}</div>
            <div>Total Questions: {sections.reduce((sum, s) => sum + s.questions.length, 0)}</div>
          </div>
        </div>
      </div>

      {onResetAll && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onResetAll}
            disabled={isResetting || !hasAnswers}
            className="w-full px-4 py-2 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-red-200 dark:border-red-800"
          >
            {isResetting ? 'Resetting...' : 'Reset All Answers'}
          </button>
          {!hasAnswers && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 text-center">
              No answers to reset
            </p>
          )}
        </div>
      )}
    </div>
  );
}
