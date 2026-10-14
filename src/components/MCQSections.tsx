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
      <h3 className="font-mono text-xs uppercase tracking-label text-fg-3">
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
              className={`block w-full border-l-2 px-3 py-2 text-left text-sm transition-colors ${
                isActive ? 'border-signal bg-surface text-fg' : 'border-transparent text-fg-2 hover:border-line-strong hover:text-fg'
              }`}
            >
              <div className="font-medium">{section.title}</div>
              <div className="mt-0.5 font-mono text-[11px] text-fg-3">
                {section.questionRange} • {section.questions.length} questions
              </div>
            </button>
          );
        })}
      </nav>
      
      <div className="mt-6 border-t border-line pt-6">
        <div className="text-xs text-fg-3">
          <div className="font-medium mb-2">Quick Stats</div>
          <div className="space-y-1">
            <div>Total Sections: {sections.length}</div>
            <div>Total Questions: {sections.reduce((sum, s) => sum + s.questions.length, 0)}</div>
          </div>
        </div>
      </div>

      {onResetAll && (
        <div className="mt-4 border-t border-line pt-4">
          <button
            onClick={onResetAll}
            disabled={isResetting || !hasAnswers}
            className="min-h-[44px] w-full border border-bad px-4 text-sm font-medium text-bad-text transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isResetting ? 'Resetting...' : 'Reset All Answers'}
          </button>
          {!hasAnswers && (
            <p className="mt-2 text-center text-xs text-fg-4">
              No answers to reset
            </p>
          )}
        </div>
      )}
    </div>
  );
}
