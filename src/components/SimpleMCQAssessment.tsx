'use client';

import { useState, useEffect, useImperativeHandle, forwardRef, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthModal } from '@/contexts/AuthModalContext';
import { CheckCircle, XCircle, Eye, EyeOff, Save, Share2, RotateCcw } from 'lucide-react';
import { MCQAssessment } from '@/lib/mcq-parser';
import { supabaseClient } from '@/lib/supabase-client';
import AuthModal from './AuthModal';
import TextSelectionMenu from './TextSelectionMenu';
import NoteEditor from './NoteEditor';
import Toast from './Toast';

interface SimpleMCQAssessmentProps {
  assessment: MCQAssessment;
  courseId: string;
  week: string;
  lessonSlug: string;
}

export interface SimpleMCQAssessmentHandle {
  resetAll: () => void;
  isSaving: boolean;
  hasAnswers: boolean;
  localAnswersCount: number;
}

const SimpleMCQAssessment = forwardRef<SimpleMCQAssessmentHandle, SimpleMCQAssessmentProps>(
  ({ assessment, courseId, week, lessonSlug }, ref) => {
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [userAnswers, setUserAnswers] = useState<Map<number, 'A' | 'B' | 'C' | 'D'>>(new Map());
  const [showAnswers, setShowAnswers] = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const selectedTextRef = useRef<string>("");
  const selectedOffsetRef = useRef<number>(0);
  const questionsContainerRef = useRef<HTMLDivElement>(null);
  const [noteScrollTarget, setNoteScrollTarget] = useState<number | null>(null);
  const [showResults, setShowResults] = useState(false);

  // Flatten all questions from sections
  const allQuestions = assessment.sections.flatMap(section => section.questions);

  // Detect note navigation or question navigation from URL hash
  useEffect(() => {
    const hash = window.location.hash;

    if (hash.startsWith('#note-')) {
      const offset = parseInt(hash.replace('#note-', ''), 10);
      if (!isNaN(offset)) {
        console.log("[Note] Detected note navigation to offset:", offset);
        setNoteScrollTarget(offset);
      }
    } else if (hash.startsWith('#question-')) {
      const questionNumber = parseInt(hash.replace('#question-', ''), 10);
      if (!isNaN(questionNumber)) {
        console.log("[Share] Detected question navigation to:", questionNumber);
        // Scroll to the question after content loads
        setTimeout(() => {
          scrollToQuestion(questionNumber);
        }, 500);
      }
    }
  }, []);

  // Scroll to noted text when navigating from notes page
  useEffect(() => {
    if (noteScrollTarget === null || !questionsContainerRef.current) return;

    const timer = setTimeout(() => {
      if (!questionsContainerRef.current) return;

      console.log("[NoteScroll] Looking for offset:", noteScrollTarget);

      // Find all question elements
      const questionElements = questionsContainerRef.current.querySelectorAll('[data-question-number]');
      
      let currentOffset = 0;
      let targetElement: HTMLElement | null = null;

      for (const element of Array.from(questionElements)) {
        const elementText = (element as HTMLElement).textContent || '';
        const elementLength = elementText.length;

        if (currentOffset + elementLength > noteScrollTarget) {
          targetElement = element as HTMLElement;
          break;
        }
        currentOffset += elementLength;
      }

      if (targetElement) {
        console.log("[NoteScroll] Found target question");
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Add temporary highlight animation
        const originalBg = targetElement.style.background;
        const originalTransition = targetElement.style.transition;

        targetElement.style.transition = 'background 0.3s ease-in-out';
        targetElement.style.background = 'rgba(99, 102, 241, 0.2)'; // Indigo highlight

        setTimeout(() => {
          if (targetElement) {
            targetElement.style.background = originalBg;
            setTimeout(() => {
              if (targetElement) {
                targetElement.style.transition = originalTransition;
              }
            }, 300);
          }
        }, 3000);

        console.log("[NoteScroll] Scrolled to noted text");
      }

      setNoteScrollTarget(null);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }, 800); // Wait for DOM to be ready

    return () => clearTimeout(timer);
  }, [noteScrollTarget]);

  // Expose reset handler to parent via ref
  useImperativeHandle(ref, () => ({
    resetAll: handleResetAll,
    isSaving,
    hasAnswers: userAnswers.size > 0,
    localAnswersCount: userAnswers.size,
  }), [isSaving, userAnswers.size]);

  // Load user's saved answers on mount
  useEffect(() => {
    if (user) {
      loadSavedAnswers();
    }
  }, [user]);

  // Right-click and long-press handler for text selection
  useEffect(() => {
    let longPressTimer: NodeJS.Timeout | null = null;
    let touchStartX = 0;
    let touchStartY = 0;

    const showSelectionMenu = (x: number, y: number) => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        return false;
      }

      const text = selection.toString().trim();
      if (!text) {
        return false;
      }

      const range = selection.getRangeAt(0);
      setSelectedText(text);
      selectedTextRef.current = text;

      // Calculate offset
      try {
        if (questionsContainerRef.current) {
          const tempRange = document.createRange();
          tempRange.selectNodeContents(questionsContainerRef.current);
          tempRange.setEnd(range.startContainer, range.startOffset);
          const offset = tempRange.toString().length;
          selectedOffsetRef.current = offset;
        }
      } catch (err) {
        selectedOffsetRef.current = 0;
      }

      // Position menu
      const menuWidth = 250;
      const menuHeight = 200;

      let menuX = x;
      let menuY = y;

      if (menuX + menuWidth > window.innerWidth) {
        menuX = window.innerWidth - menuWidth - 10;
      }
      if (menuY + menuHeight > window.innerHeight) {
        menuY = window.innerHeight - menuHeight - 10;
      }

      setMenuPosition({ x: menuX, y: menuY });
      return true;
    };

    const handleRightClick = (e: MouseEvent) => {
      if (!questionsContainerRef.current?.contains(e.target as Node)) {
        return;
      }

      // Prevent default context menu
      e.preventDefault();

      showSelectionMenu(e.clientX, e.clientY);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (!questionsContainerRef.current?.contains(e.target as Node)) {
        return;
      }

      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;

      // Start long-press timer
      longPressTimer = setTimeout(() => {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) {
          // User has selected text, show menu at touch location
          showSelectionMenu(touchStartX, touchStartY);
        }
      }, 500); // 500ms long press
    };

    const handleTouchMove = (e: TouchEvent) => {
      // If user moves finger too much, cancel long press
      if (longPressTimer) {
        const touch = e.touches[0];
        const moveX = Math.abs(touch.clientX - touchStartX);
        const moveY = Math.abs(touch.clientY - touchStartY);
        
        // Cancel if moved more than 10px
        if (moveX > 10 || moveY > 10) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      }
    };

    const handleTouchEnd = () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };

    document.addEventListener("contextmenu", handleRightClick);
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("touchend", handleTouchEnd);
    document.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
      }
      document.removeEventListener("contextmenu", handleRightClick);
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, []);

  // Scroll to last attempted question when answers are loaded - DISABLED per user request
  // useEffect(() => {
  //   if (userAnswers.size > 0) {
  //     setTimeout(() => {
  //       scrollToLastAttempted();
  //     }, 500);
  //   }
  // }, [userAnswers.size]);

  const scrollToQuestion = (questionNumber: number) => {
    const element = document.querySelector(`[data-question-number="${questionNumber}"]`);
    
    if (element) {
      const offset = 120; // Account for sticky header
      const elementPosition = element.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({
        top: elementPosition - offset,
        behavior: 'smooth'
      });

      // Add temporary highlight animation
      const htmlElement = element as HTMLElement;
      const originalBg = htmlElement.style.background;
      const originalTransition = htmlElement.style.transition;

      htmlElement.style.transition = 'background 0.3s ease-in-out';
      htmlElement.style.background = 'rgba(99, 102, 241, 0.2)'; // Indigo highlight

      setTimeout(() => {
        htmlElement.style.background = originalBg;
        setTimeout(() => {
          htmlElement.style.transition = originalTransition;
        }, 300);
      }, 2000);
    }
  };

  const scrollToLastAttempted = () => {
    if (userAnswers.size === 0) return;

    // Find the highest question number that was attempted
    const lastAttemptedQuestion = Math.max(...Array.from(userAnswers.keys()));
    
    // Find the next unattempted question after the last attempted one
    const allQuestionNumbers = allQuestions.map(q => q.number).sort((a, b) => a - b);
    const nextUnattempted = allQuestionNumbers.find(num => num > lastAttemptedQuestion && !userAnswers.has(num));
    
    // Scroll to next unattempted or last attempted
    const targetQuestion = nextUnattempted || lastAttemptedQuestion;
    scrollToQuestion(targetQuestion);
  };

  const loadSavedAnswers = async () => {
    if (!user) return;

    try {
      // Get or find assessment
      const { data: assessment } = await supabaseClient
        .from('mcq_assessments')
        .select('id')
        .eq('course_id', courseId)
        .eq('week', week)
        .eq('lesson_slug', lessonSlug)
        .maybeSingle();

      if (!assessment) return;

      // Fetch user's answers
      const { data: answers, error } = await supabaseClient
        .from('mcq_user_answers')
        .select('question_number, selected_option')
        .eq('user_id', user.id)
        .eq('assessment_id', assessment.id);

      if (!error && answers) {
        const answersMap = new Map<number, 'A' | 'B' | 'C' | 'D'>(
          answers.map((a: any) => [a.question_number, a.selected_option])
        );
        setUserAnswers(answersMap);
      }
    } catch (error) {
      console.error('Failed to load saved answers:', error);
    }
  };

  const handleAnswerSelect = (questionNumber: number, option: 'A' | 'B' | 'C' | 'D') => {
    setUserAnswers(prev => {
      const newAnswers = new Map(prev);
      const currentAnswer = prev.get(questionNumber);
      
      // If clicking the same option, unselect it
      if (currentAnswer === option) {
        newAnswers.delete(questionNumber);
      } else {
        newAnswers.set(questionNumber, option);
      }
      
      return newAnswers;
    });
  };

  const toggleShowAnswer = (questionNumber: number) => {
    setShowAnswers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(questionNumber)) {
        newSet.delete(questionNumber);
      } else {
        newSet.add(questionNumber);
      }
      return newSet;
    });
  };

  const handleSaveAnswers = async () => {
    if (!user) {
      alert('Please sign in to save your answers');
      return;
    }

    setIsSaving(true);

    try {
      // Get or create assessment
      let assessmentId: string;
      const { data: existingAssessment } = await supabaseClient
        .from('mcq_assessments')
        .select('id')
        .eq('course_id', courseId)
        .eq('week', week)
        .eq('lesson_slug', lessonSlug)
        .maybeSingle();

      if (existingAssessment) {
        assessmentId = existingAssessment.id;
      } else {
        // Create new assessment
        const { data: newAssessment, error: createError } = await supabaseClient
          .from('mcq_assessments')
          .insert({
            course_id: courseId,
            week,
            lesson_slug: lessonSlug,
            title: assessment.title,
            description: assessment.description,
            total_questions: assessment.totalQuestions,
          })
          .select('id')
          .single();

        if (createError || !newAssessment) {
          throw new Error('Failed to create assessment');
        }
        assessmentId = newAssessment.id;
      }

      // Get all existing answers for this assessment
      const { data: existingAnswers } = await supabaseClient
        .from('mcq_user_answers')
        .select('question_number')
        .eq('user_id', user.id)
        .eq('assessment_id', assessmentId);

      const existingQuestionNumbers = new Set(existingAnswers?.map(a => a.question_number) || []);
      const currentQuestionNumbers = new Set(userAnswers.keys());

      // Delete answers that are no longer selected
      const questionsToDelete = Array.from(existingQuestionNumbers).filter(
        q => !currentQuestionNumbers.has(q)
      );

      if (questionsToDelete.length > 0) {
        await supabaseClient
          .from('mcq_user_answers')
          .delete()
          .eq('user_id', user.id)
          .eq('assessment_id', assessmentId)
          .in('question_number', questionsToDelete);
      }

      // Upsert currently selected answers
      if (userAnswers.size > 0) {
        const answersToSave = Array.from(userAnswers.entries()).map(([questionNumber, selectedOption]) => ({
          user_id: user.id,
          assessment_id: assessmentId,
          question_number: questionNumber,
          selected_option: selectedOption,
        }));

        const { error: answersError } = await supabaseClient
          .from('mcq_user_answers')
          .upsert(answersToSave, {
            onConflict: 'user_id,assessment_id,question_number',
          });

        if (answersError) {
          throw answersError;
        }
      }

      setLastSaved(new Date());
    } catch (error) {
      console.error('Failed to save answers:', error);
      alert('Failed to save answers. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetAll = async () => {
    if (!user) return;

    const confirmed = confirm('Are you sure you want to reset all your answers? This cannot be undone.');
    if (!confirmed) return;

    setIsSaving(true);

    try {
      // Get assessment
      const { data: existingAssessment } = await supabaseClient
        .from('mcq_assessments')
        .select('id')
        .eq('course_id', courseId)
        .eq('week', week)
        .eq('lesson_slug', lessonSlug)
        .maybeSingle();

      if (existingAssessment) {
        // Delete all answers
        await supabaseClient
          .from('mcq_user_answers')
          .delete()
          .eq('user_id', user.id)
          .eq('assessment_id', existingAssessment.id);
      }

      // Clear local state
      setUserAnswers(new Map());
      setShowAnswers(new Set());
      setLastSaved(new Date());
    } catch (error) {
      console.error('Failed to reset answers:', error);
      alert('Failed to reset answers. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const getAnsweredCount = () => userAnswers.size;
  const getCorrectCount = () => {
    let correct = 0;
    allQuestions.forEach(q => {
      if (userAnswers.get(q.number) === q.correctAnswer) correct++;
    });
    return correct;
  };

  const handleHighlight = async (color: string) => {
    if (!user) {
      openAuthModal();
      return;
    }

    const textToHighlight = selectedTextRef.current || selectedText;
    if (!textToHighlight) return;

    try {
      const { error } = await supabaseClient
        .from("content_notes")
        .insert({
          user_id: user.id,
          course_id: courseId,
          week,
          lesson_slug: lessonSlug,
          highlight_text: textToHighlight,
          highlight_offset: selectedOffsetRef.current,
          note_text: "",
          color,
          note_type: "general",
          is_private: true,
        });

      if (error) throw error;

      setToast({ message: "Highlighted!", type: "success" });
      window.getSelection()?.removeAllRanges();
      setMenuPosition(null);
      setSelectedText("");
    } catch (error) {
      setToast({ message: "Failed to save highlight", type: "error" });
    }
  };

  const handleBookmark = async () => {
    if (!user) {
      openAuthModal();
      return;
    }

    const textToBookmark = selectedTextRef.current || selectedText;
    if (!textToBookmark) return;

    try {
      const { error } = await supabaseClient
        .from("bookmarks")
        .insert({
          user_id: user.id,
          course_id: courseId,
          week,
          lesson_slug: lessonSlug,
          bookmark_text: textToBookmark,
          bookmark_offset: selectedOffsetRef.current,
        });

      if (error) throw error;

      setToast({ message: "Bookmarked!", type: "success" });
      window.getSelection()?.removeAllRanges();
      setMenuPosition(null);
      setSelectedText("");
    } catch (error) {
      setToast({ message: "Failed to bookmark", type: "error" });
    }
  };

  const handleNote = () => {
    if (!user) {
      openAuthModal();
      return;
    }

    const textForNote = selectedTextRef.current || selectedText;
    if (!textForNote) return;

    setMenuPosition(null);
    setShowNoteEditor(true);
  };

  const handleSaveNote = async (
    noteText: string,
    noteType: "general" | "question" | "important" | "todo",
    color: "yellow" | "green" | "blue" | "red" | "purple"
  ) => {
    if (!user) return;

    const textWithNote = selectedTextRef.current || selectedText;
    if (!textWithNote) return;

    try {
      const { error } = await supabaseClient
        .from("content_notes")
        .insert({
          user_id: user.id,
          course_id: courseId,
          week,
          lesson_slug: lessonSlug,
          highlight_text: textWithNote,
          highlight_offset: selectedOffsetRef.current,
          note_text: noteText,
          note_type: noteType,
          color,
          is_private: true,
        });

      if (error) throw error;

      setToast({ message: "Note saved!", type: "success" });
      setShowNoteEditor(false);
      window.getSelection()?.removeAllRanges();
      setSelectedText("");
    } catch (error) {
      setToast({ message: "Failed to save note", type: "error" });
    }
  };

  const handleShareQuestion = async (questionNumber: number) => {
    const url = `${window.location.origin}${window.location.pathname}#question-${questionNumber}`;
    
    try {
      await navigator.clipboard.writeText(url);
      setToast({ message: "Question link copied to clipboard!", type: "success" });
    } catch (error) {
      setToast({ message: "Failed to copy link", type: "error" });
    }
  };

  const handleCheckResults = () => {
    // Show all answers
    const allQuestionNumbers = allQuestions.map(q => q.number);
    setShowAnswers(new Set(allQuestionNumbers));
    setShowResults(true);
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <div className="max-w-4xl mx-auto space-y-6 pb-20 sm:pb-24">{/* Add padding-bottom for sticky bar */}
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 sticky top-16 z-10">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              {assessment.title}
            </h1>
            {assessment.description && (
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {assessment.description}
              </p>
            )}
            
            <div className="flex items-center gap-6 text-sm text-gray-600 dark:text-gray-400">
              <span>{assessment.totalQuestions} Questions</span>
              <span>Answered: {getAnsweredCount()} / {assessment.totalQuestions}</span>
              {userAnswers.size > 0 && showAnswers.size > 0 && (
                <span className="text-green-600 dark:text-green-400 font-medium">
                  Correct: {getCorrectCount()} / {userAnswers.size}
                </span>
              )}
            </div>
          </div>
        </div>

        {lastSaved && (
          <p className="mt-2 text-sm text-green-600 dark:text-green-400">
            Last saved: {lastSaved.toLocaleTimeString()}
          </p>
        )}

        {!user && (
          <div className="mt-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 text-center">
            <button
              onClick={() => setShowAuthModal(true)}
              className="text-sm text-yellow-800 dark:text-yellow-200 hover:text-yellow-900 dark:hover:text-yellow-100 underline font-medium transition-colors"
            >
              Sign in to save your answers
            </button>
          </div>
        )}
      </div>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />

      {/* Questions */}
      <div ref={questionsContainerRef} className="space-y-6">
        {assessment.sections.map((section) => {
          // Create section ID for scrolling
          const sectionId = section.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          
          return (
            <div key={section.title} className="space-y-6" id={sectionId}>
              {/* Section Header */}
              <div className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg p-4">
                <h2 className="text-xl font-bold">{section.title}</h2>
                <p className="text-sm text-indigo-100">{section.questionRange}</p>
              </div>

            {/* Section Questions */}
            {section.questions.map((question) => {
              const userAnswer = userAnswers.get(question.number);
              const isShowingAnswer = showAnswers.has(question.number);
              const isCorrect = userAnswer === question.correctAnswer;

              // Convert options array to object format
              const optionsObj = question.options.reduce((acc, opt) => {
                acc[opt.label] = opt.text;
                return acc;
              }, {} as Record<string, string>);

              return (
                <div
                  key={question.number}
                  data-question-number={question.number}
                  className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 sm:p-6"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                          Question {question.number}
                        </span>
                        <button
                          onClick={() => handleShareQuestion(question.number)}
                          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                          title="Share this question"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mt-1">
                        {question.text}
                      </h3>
                    </div>

                    <button
                      onClick={() => toggleShowAnswer(question.number)}
                      className="flex items-center justify-center gap-2 px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors shrink-0 w-full sm:w-auto"
                    >
                      {isShowingAnswer ? (
                        <>
                          <EyeOff className="w-4 h-4" />
                          Hide Answer
                        </>
                      ) : (
                        <>
                          <Eye className="w-4 h-4" />
                          Show Answer
                        </>
                      )}
                    </button>
                  </div>

                  {/* Options */}
                  <div className="space-y-3">
                    {Object.entries(optionsObj).map(([key, value]) => {
                      const isSelected = userAnswer === key;
                      const isCorrectOption = question.correctAnswer === key;
                      const showCorrect = isShowingAnswer && isCorrectOption;
                      const showIncorrect = isShowingAnswer && isSelected && !isCorrect;

                      return (
                        <button
                          key={key}
                          onClick={() => handleAnswerSelect(question.number, key as 'A' | 'B' | 'C' | 'D')}
                          className={`w-full p-4 text-left rounded-lg border-2 transition-all ${
                            showCorrect
                              ? 'border-green-500 dark:border-green-400 bg-green-50 dark:bg-green-900/20'
                              : showIncorrect
                              ? 'border-red-500 dark:border-red-400 bg-red-50 dark:bg-red-900/20'
                              : isSelected
                              ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <span className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
                              showCorrect
                                ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300'
                                : showIncorrect
                                ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                                : isSelected
                                ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                            }`}>
                              {key}
                            </span>
                            <span className="flex-1 pt-1 text-gray-900 dark:text-white">{value}</span>
                            {showCorrect && (
                              <CheckCircle className="flex-shrink-0 w-6 h-6 text-green-600 dark:text-green-400" />
                            )}
                            {showIncorrect && (
                              <XCircle className="flex-shrink-0 w-6 h-6 text-red-600 dark:text-red-400" />
                            )}
                            {isSelected && !isShowingAnswer && (
                              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center">
                                <CheckCircle className="w-4 h-4 text-white" />
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Answer status and explanation */}
                  {isShowingAnswer && (
                    <div className={`mt-4 p-4 rounded-lg space-y-3 ${
                      userAnswer 
                        ? isCorrect
                          ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                          : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                        : 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                    }`}>
                      {userAnswer ? (
                        <p className={`text-sm font-medium ${
                          isCorrect 
                            ? 'text-green-800 dark:text-green-300' 
                            : 'text-red-800 dark:text-red-300'
                        }`}>
                          {isCorrect 
                            ? '✓ Your answer is correct!' 
                            : `✗ Your answer is incorrect. The correct answer is ${question.correctAnswer}.`}
                        </p>
                      ) : (
                        <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                          Correct answer: {question.correctAnswer}
                        </p>
                      )}
                      
                      {question.explanation && (
                        <div className={`pt-3 border-t ${
                          userAnswer
                            ? isCorrect
                              ? 'border-green-200 dark:border-green-800'
                              : 'border-red-200 dark:border-red-800'
                            : 'border-blue-200 dark:border-blue-800'
                        }`}>
                          <p className={`text-sm font-medium mb-1 ${
                            userAnswer
                              ? isCorrect
                                ? 'text-green-700 dark:text-green-400'
                                : 'text-red-700 dark:text-red-400'
                              : 'text-blue-700 dark:text-blue-400'
                          }`}>
                            💡 Explanation:
                          </p>
                          <p className={`text-sm ${
                            userAnswer
                              ? isCorrect
                                ? 'text-green-700 dark:text-green-300'
                                : 'text-red-700 dark:text-red-300'
                              : 'text-blue-700 dark:text-blue-300'
                          }`}>
                            {question.explanation}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          );
        })}
      </div>

      {/* Text Selection Menu */}
      {menuPosition && selectedText && (
        <TextSelectionMenu
          selectedText={selectedText}
          position={menuPosition}
          onHighlight={handleHighlight}
          onBookmark={handleBookmark}
          onNote={handleNote}
          onClose={() => {
            setMenuPosition(null);
            setSelectedText("");
            window.getSelection()?.removeAllRanges();
          }}
        />
      )}

      {/* Note Editor */}
      <NoteEditor
        isOpen={showNoteEditor}
        selectedText={selectedTextRef.current || selectedText}
        lessonTitle={assessment.title}
        existingNote={null}
        onSave={handleSaveNote}
        onDelete={() => {}}
        onClose={() => {
          setShowNoteEditor(false);
          window.getSelection()?.removeAllRanges();
          setSelectedText("");
        }}
        isSaving={false}
      />

      {/* Toast Notifications */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>

    {/* Bottom Action Buttons - Fixed on mobile, sticky on desktop */}
    {userAnswers.size > 0 && (
      <div className="fixed sm:sticky bottom-0 left-0 right-0 sm:max-w-4xl sm:mx-auto bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm shadow-lg sm:rounded-lg p-2 sm:p-4 border-t border-gray-200 dark:border-gray-700 z-50">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3">
          <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 text-center sm:text-left">
            <span className="font-medium">Progress: </span>
            {getAnsweredCount()} / {assessment.totalQuestions}
            {showResults && (
              <span className="ml-2 sm:ml-4 text-green-600 dark:text-green-400 font-medium">
                Score: {getCorrectCount()}/{userAnswers.size} ({Math.round((getCorrectCount() / userAnswers.size) * 100)}%)
              </span>
            )}
          </div>
          <div className={`grid ${user ? 'grid-cols-3' : 'grid-cols-2'} sm:flex gap-1.5 sm:gap-2`}>
            {/* Reset button - visible on mobile only when authenticated */}
            {user && (
              <button
                onClick={handleResetAll}
                disabled={isSaving || userAnswers.size === 0}
                className="sm:hidden flex items-center justify-center gap-0.5 px-2 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Reset All Answers"
              >
                <RotateCcw className="w-3 h-3" />
                <span className="text-[10px]">Reset</span>
              </button>
            )}
            <button
              onClick={handleCheckResults}
              disabled={userAnswers.size === 0}
              className="flex items-center justify-center gap-0.5 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded text-xs sm:text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Check</span>
              <span className="sm:hidden text-[10px]">Check</span>
            </button>
            {user ? (
              <button
                onClick={handleSaveAnswers}
                disabled={isSaving}
                className="flex items-center justify-center gap-0.5 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded text-xs sm:text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Save className="w-3 h-3 sm:w-4 sm:h-4" />
                {isSaving ? (
                  <span className="text-[10px] sm:text-sm">Saving...</span>
                ) : (
                  <>
                    <span className="hidden sm:inline">Save</span>
                    <span className="sm:hidden text-[10px]">Save</span>
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={() => openAuthModal()}
                className="flex items-center justify-center gap-0.5 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded text-xs sm:text-sm font-medium transition-colors"
              >
                <Save className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Sign in to Save</span>
                <span className="sm:hidden text-[10px]">Sign in</span>
              </button>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
});

SimpleMCQAssessment.displayName = 'SimpleMCQAssessment';

export default SimpleMCQAssessment;
