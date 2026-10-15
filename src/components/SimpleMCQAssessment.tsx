'use client';

import { useState, useEffect, useImperativeHandle, forwardRef, useRef, useMemo, useCallback, useSyncExternalStore } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthModal } from '@/contexts/AuthModalContext';
import { CheckCircle, XCircle, Eye, EyeOff, Save, Share2, RotateCcw } from 'lucide-react';
import { MCQAssessment, MCQOption } from '@/lib/mcq-parser';
import { supabaseClient } from '@/lib/supabase-client';
import AuthModal from './AuthModal';
import TextSelectionMenu from './TextSelectionMenu';
import NoteEditor from './NoteEditor';
import Toast from './Toast';
import ConfirmDialog from './ConfirmDialog';
import { startEngagedClock, type EngagedClock } from '@/lib/learn/engagedClock';

type OptionLabel = MCQOption['label'];

interface SimpleMCQAssessmentProps {
  assessment: MCQAssessment;
  courseId: string;
  week: string;
  lessonSlug: string;
  /** Called whenever the number of answered questions changes (e.g. to enable "Reset all"). */
  onAnsweredCountChange?: (count: number) => void;
}

export interface SimpleMCQAssessmentHandle {
  /** Clears every answer (server + local). Callers confirm first. Resolves false on failure. */
  resetAll: () => Promise<boolean>;
  isSaving: boolean;
  hasAnswers: boolean;
  localAnswersCount: number;
}

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

const DISPLAY_LETTERS = ['A', 'B', 'C', 'D'] as const;
const SAVE_DEBOUNCE_MS = 800;
const SAVE_RETRY_MS = 5000;

// ---------------------------------------------------------------------------
// Deterministic option shuffling.
// The markdown answer key is ~80-90% "B", so options are shown in a per-learner order
// (per-session for guests). Answers are always stored by the ORIGINAL option letter, so
// saved answers stay valid whatever order a learner sees.
// ---------------------------------------------------------------------------
function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(items: T[], seedKey: string): T[] {
  const rand = mulberry32(hashString(seedKey));
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Guests get one shuffle per browser session. Read through useSyncExternalStore so the
// server render (no seed) and the first client render agree.
const GUEST_SEED_KEY = 'mcq-shuffle-seed';
let guestSeedCache: string | null = null;
function getGuestSeed(): string {
  if (guestSeedCache) return guestSeedCache;
  let seed: string | null = null;
  try {
    seed = window.sessionStorage.getItem(GUEST_SEED_KEY);
    if (!seed) {
      seed = Math.random().toString(36).slice(2) + Date.now().toString(36);
      window.sessionStorage.setItem(GUEST_SEED_KEY, seed);
    }
  } catch {
    seed = seed || Math.random().toString(36).slice(2);
  }
  guestSeedCache = seed;
  return seed;
}
const subscribeNoop = () => () => {};
const getNoSeed = () => null;

function guestAnswersKey(courseId: string, week: string, lessonSlug: string) {
  return `mcq-answers:${courseId}:${week}:${lessonSlug}`;
}

function isOptionLabel(value: unknown): value is OptionLabel {
  return value === 'A' || value === 'B' || value === 'C' || value === 'D';
}

const SimpleMCQAssessment = forwardRef<SimpleMCQAssessmentHandle, SimpleMCQAssessmentProps>(
  ({ assessment, courseId, week, lessonSlug, onAnsweredCountChange }, ref) => {
  const { user, loading: authLoading } = useAuth();
  const { openAuthModal } = useAuthModal();
  // Keyed by question number -> ORIGINAL option letter from the markdown
  const [userAnswers, setUserAnswers] = useState<Map<number, OptionLabel>>(new Map());
  // Questions whose answer panel is open
  const [showAnswers, setShowAnswers] = useState<Set<number>>(new Set());
  // Questions whose answer has been revealed at least once: their pick is locked
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const selectedTextRef = useRef<string>("");
  const selectedOffsetRef = useRef<number>(0);
  const questionsContainerRef = useRef<HTMLDivElement>(null);
  const [noteScrollTarget, setNoteScrollTarget] = useState<number | null>(null);
  const [showResults, setShowResults] = useState(false);
  const hasScrolledToLastAttempted = useRef(false);
  const [answersLoaded, setAnswersLoaded] = useState(false);

  // Autosave bookkeeping (refs so timers and unmount flushes see current values)
  const userIdRef = useRef<string | null>(null);
  const answersRef = useRef<Map<number, OptionLabel>>(new Map());
  const pendingRef = useRef<Map<number, OptionLabel | null>>(new Map()); // null = delete
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const assessmentIdRef = useRef<string | null>(null);
  // engaged time on this page (visible tab + recent activity), not wall-clock time
  const clockRef = useRef<EngagedClock | null>(null);
  const progressRowRef = useRef<{ progress: number; status: string; timeSpent: number; started: boolean } | null>(null);
  const loadPromiseRef = useRef<Promise<void> | null>(null);

  // Flatten all questions from sections
  const allQuestions = useMemo(() => assessment.sections.flatMap(section => section.questions), [assessment]);

  // Shuffle seed: per user when signed in, per session for guests, none until auth resolves.
  const guestSeed = useSyncExternalStore(subscribeNoop, getGuestSeed, getNoSeed);
  const shuffleSeed = authLoading ? null : user ? `u:${user.id}` : guestSeed ? `g:${guestSeed}` : null;

  // Display order per question, as ORIGINAL option letters.
  const optionOrder = useMemo(() => {
    const orders = new Map<number, OptionLabel[]>();
    allQuestions.forEach(q => {
      const labels = q.options.map(o => o.label);
      orders.set(
        q.number,
        shuffleSeed ? seededShuffle(labels, `${shuffleSeed}:${courseId}:${week}:${lessonSlug}:${q.number}`) : labels
      );
    });
    return orders;
  }, [allQuestions, shuffleSeed, courseId, week, lessonSlug]);

  // Original letter -> letter shown to this learner
  const displayLetter = (questionNumber: number, original: OptionLabel): string => {
    const idx = optionOrder.get(questionNumber)?.indexOf(original) ?? -1;
    return idx >= 0 ? DISPLAY_LETTERS[idx] : original;
  };

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
        targetElement.style.background = 'rgba(255, 107, 43, 0.15)';

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

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  // Find (or lazily create) this assessment's row.
  const ensureAssessmentId = useCallback(async (create: boolean): Promise<string | null> => {
    if (assessmentIdRef.current) return assessmentIdRef.current;
    const { data: existing } = await supabaseClient
      .from('mcq_assessments')
      .select('id')
      .eq('course_id', courseId)
      .eq('week', week)
      .eq('lesson_slug', lessonSlug)
      .maybeSingle();
    if (existing) {
      assessmentIdRef.current = existing.id;
      return existing.id;
    }
    if (!create) return null;
    const { data: created, error } = await supabaseClient
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
    if (error || !created) throw error || new Error('Failed to create assessment');
    assessmentIdRef.current = created.id;
    return created.id;
  }, [courseId, week, lessonSlug, assessment.title, assessment.description, assessment.totalQuestions]);

  // Mirror answers into learning_progress so assessments count toward course progress.
  // Same rules as lessons: progress never goes down and "completed" is never undone.
  const writeProgress = useCallback(async (userId: string, answered: number) => {
    const total = assessment.totalQuestions;
    if (!total) return;
    const prev = progressRowRef.current ?? { progress: 0, status: 'not_started', timeSpent: 0, started: false };
    const pct = Math.round((Math.min(answered, total) / total) * 100);
    const progress = Math.max(prev.progress, pct);
    if (progress === 0 && !progressRowRef.current) return; // nothing worth recording yet

    const wasCompleted = prev.status === 'completed';
    const completed = wasCompleted || answered >= total;
    const status = completed ? 'completed' : progress > 0 ? 'in_progress' : 'not_started';
    const now = new Date().toISOString();
    const sessionSeconds = clockRef.current?.seconds() ?? 0;

    const row: Record<string, string | number> = {
      user_id: userId,
      course_id: courseId,
      week,
      lesson_slug: lessonSlug,
      progress_percentage: progress,
      status,
      time_spent: Math.min(3 * 3600, prev.timeSpent + sessionSeconds),
      last_accessed_at: now,
    };
    if (!prev.started) row.started_at = now;
    if (completed && !wasCompleted) row.completed_at = now;

    const { error } = await supabaseClient
      .from('learning_progress')
      .upsert(row, { onConflict: 'user_id,course_id,week,lesson_slug' });
    if (error) throw error;
    progressRowRef.current = { progress, status, timeSpent: prev.timeSpent, started: true };
  }, [assessment.totalQuestions, courseId, week, lessonSlug]);

  // Push queued answer changes to the server. Safe to call at any time; it no-ops for guests,
  // when nothing is queued, or while a save is already running (that save re-runs it).
  const flushSaves = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const userId = userIdRef.current;
    if (!userId || savingRef.current || pendingRef.current.size === 0) return;

    savingRef.current = true;
    const batch = new Map(pendingRef.current);
    pendingRef.current.clear();
    setSaveStatus('saving');

    let failed = false;
    try {
      if (loadPromiseRef.current) await loadPromiseRef.current;
      const assessmentId = await ensureAssessmentId(true);
      if (!assessmentId) throw new Error('No assessment id');

      const upserts = Array.from(batch.entries())
        .filter((entry): entry is [number, OptionLabel] => entry[1] !== null)
        .map(([questionNumber, selectedOption]) => ({
          user_id: userId,
          assessment_id: assessmentId,
          question_number: questionNumber,
          selected_option: selectedOption,
        }));
      const deletions = Array.from(batch.entries()).filter(([, v]) => v === null).map(([n]) => n);

      if (upserts.length > 0) {
        const { error } = await supabaseClient
          .from('mcq_user_answers')
          .upsert(upserts, { onConflict: 'user_id,assessment_id,question_number' });
        if (error) throw error;
      }
      if (deletions.length > 0) {
        const { error } = await supabaseClient
          .from('mcq_user_answers')
          .delete()
          .eq('user_id', userId)
          .eq('assessment_id', assessmentId)
          .in('question_number', deletions);
        if (error) throw error;
      }

      await writeProgress(userId, answersRef.current.size);
    } catch (error) {
      console.error('[MCQ] Autosave failed:', error);
      failed = true;
      // Re-queue anything that wasn't changed again in the meantime
      batch.forEach((value, questionNumber) => {
        if (!pendingRef.current.has(questionNumber)) pendingRef.current.set(questionNumber, value);
      });
    } finally {
      savingRef.current = false;
    }

    if (failed) {
      setSaveStatus('error');
      saveTimerRef.current = setTimeout(() => { void flushSaves(); }, SAVE_RETRY_MS);
    } else if (pendingRef.current.size > 0) {
      void flushSaves();
    } else {
      setSaveStatus('saved');
    }
  }, [ensureAssessmentId, writeProgress]);

  const scheduleSave = useCallback(() => {
    if (!userIdRef.current) return;
    setSaveStatus('pending');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { void flushSaves(); }, SAVE_DEBOUNCE_MS);
  }, [flushSaves]);

  // Track the signed-in user for timers/unmount, and start the time-on-page clock.
  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user?.id]);
  useEffect(() => {
    const clock = startEngagedClock();
    clockRef.current = clock;
    return () => clock.stop();
  }, []);

  // Keep a ref copy of answers, report the count, and persist guest answers locally.
  useEffect(() => {
    answersRef.current = userAnswers;
    onAnsweredCountChange?.(userAnswers.size);
    if (!authLoading && !user && answersLoaded) {
      try {
        const key = guestAnswersKey(courseId, week, lessonSlug);
        if (userAnswers.size === 0) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, JSON.stringify(Object.fromEntries(userAnswers)));
      } catch {
        // storage unavailable: answers stay in memory for this visit
      }
    }
  }, [userAnswers, onAnsweredCountChange, authLoading, user, answersLoaded, courseId, week, lessonSlug]);

  // Flush queued answers when the tab is hidden or the component unmounts; warn on close
  // only if something is still unsaved.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void flushSaves();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (userIdRef.current && (pendingRef.current.size > 0 || savingRef.current)) {
        void flushSaves();
        e.preventDefault();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onBeforeUnload);
      void flushSaves();
    };
  }, [flushSaves]);

  // Load saved answers (signed in) or this browser's answers (guest) once auth resolves.
  const signedInUserId = user?.id ?? null;
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    const applyLoaded = (loaded: Map<number, OptionLabel>, carryOverLocal: boolean) => {
      const merged = new Map(loaded);
      // Anything picked before the load finished (or as a guest before signing in) wins,
      // and is queued so it reaches the server.
      answersRef.current.forEach((option, questionNumber) => {
        if (merged.get(questionNumber) !== option) {
          merged.set(questionNumber, option);
          if (carryOverLocal) pendingRef.current.set(questionNumber, option);
        }
      });
      pendingRef.current.forEach((option, questionNumber) => {
        if (option === null) merged.delete(questionNumber);
      });
      answersRef.current = merged;
      setUserAnswers(merged);
      // Only resume-scroll when there were saved answers; never jump while someone starts fresh
      if (loaded.size === 0) hasScrolledToLastAttempted.current = true;
      setAnswersLoaded(true);
    };

    if (!signedInUserId) {
      const loaded = new Map<number, OptionLabel>();
      try {
        const raw = window.localStorage.getItem(guestAnswersKey(courseId, week, lessonSlug));
        const parsed: unknown = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed === 'object') {
          Object.entries(parsed as Record<string, unknown>).forEach(([k, v]) => {
            if (isOptionLabel(v)) loaded.set(Number(k), v);
          });
        }
      } catch {
        // ignore unreadable storage
      }
      Promise.resolve().then(() => {
        if (!cancelled) applyLoaded(loaded, false);
      });
      return () => { cancelled = true; };
    }

    const userId = signedInUserId;
    const load = (async () => {
      const loaded = new Map<number, OptionLabel>();
      try {
        const [assessmentId, progressResult] = await Promise.all([
          ensureAssessmentId(false),
          supabaseClient
            .from('learning_progress')
            .select('progress_percentage, status, time_spent, started_at')
            .eq('user_id', userId)
            .eq('course_id', courseId)
            .eq('week', week)
            .eq('lesson_slug', lessonSlug)
            .maybeSingle(),
        ]);
        const row = progressResult.data;
        progressRowRef.current = row
          ? { progress: row.progress_percentage || 0, status: row.status || 'not_started', timeSpent: row.time_spent || 0, started: true }
          : null;

        if (assessmentId) {
          const { data: answers, error } = await supabaseClient
            .from('mcq_user_answers')
            .select('question_number, selected_option')
            .eq('user_id', userId)
            .eq('assessment_id', assessmentId);
          if (!error && answers) {
            answers.forEach((a: { question_number: number; selected_option: string }) => {
              if (isOptionLabel(a.selected_option)) loaded.set(a.question_number, a.selected_option);
            });
          }
        }
      } catch (error) {
        console.error('Failed to load saved answers:', error);
      }
      if (cancelled) return;
      // Carry over answers picked as a guest in this browser too
      try {
        const raw = window.localStorage.getItem(guestAnswersKey(courseId, week, lessonSlug));
        if (raw) window.localStorage.removeItem(guestAnswersKey(courseId, week, lessonSlug));
      } catch {
        // ignore
      }
      applyLoaded(loaded, true);
      if (pendingRef.current.size > 0) scheduleSave();
    })();
    loadPromiseRef.current = load;

    return () => { cancelled = true; };
  }, [authLoading, signedInUserId, courseId, week, lessonSlug, ensureAssessmentId, scheduleSave]);

  const resetAll = useCallback(async (): Promise<boolean> => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    pendingRef.current.clear();
    try {
      const userId = userIdRef.current;
      if (userId) {
        const assessmentId = await ensureAssessmentId(false);
        if (assessmentId) {
          const { error } = await supabaseClient
            .from('mcq_user_answers')
            .delete()
            .eq('user_id', userId)
            .eq('assessment_id', assessmentId);
          if (error) throw error;
        }
      }
      setUserAnswers(new Map());
      setShowAnswers(new Set());
      setRevealed(new Set());
      setShowResults(false);
      setSaveStatus('idle');
      return true;
    } catch (error) {
      console.error('Failed to reset answers:', error);
      return false;
    }
  }, [ensureAssessmentId]);

  // Expose reset handler to parent via ref
  useImperativeHandle(ref, () => ({
    resetAll,
    isSaving: saveStatus === 'saving',
    hasAnswers: userAnswers.size > 0,
    localAnswersCount: userAnswers.size,
  }), [resetAll, saveStatus, userAnswers.size]);

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
      } catch {
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

  // Scroll to last attempted question when answers are loaded
  useEffect(() => {
    const hash = window.location.hash;
    // Allow auto-scroll unless there's a specific question/note hash (not scroll position)
    const hasSpecificHash = hash.startsWith('#question-') || hash.startsWith('#note-');
    
    // Only scroll if answers are loaded, there are answers, no specific hash navigation, and we haven't scrolled yet
    if (answersLoaded && userAnswers.size > 0 && !hasSpecificHash && !hasScrolledToLastAttempted.current) {
      console.log('[AutoScroll] Attempting to scroll to last attempted question');
      hasScrolledToLastAttempted.current = true;
      
      // Clear any scroll position hash since we're auto-scrolling
      if (hash.startsWith('#scroll-')) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      
      const timer = setTimeout(() => {
        scrollToLastAttempted();
      }, 1200); // Give time for DOM to render completely
      
      return () => clearTimeout(timer);
    }
  }, [answersLoaded, userAnswers.size]); // Trigger when answers are loaded or size changes

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
      htmlElement.style.background = 'rgba(255, 107, 43, 0.15)';

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

    console.log('[AutoScroll] scrollToLastAttempted called with', userAnswers.size, 'answers');

    // Find the highest question number that was attempted
    const lastAttemptedQuestion = Math.max(...Array.from(userAnswers.keys()));
    console.log('[AutoScroll] Last attempted question:', lastAttemptedQuestion);
    
    // Find the next unattempted question after the last attempted one
    const allQuestionNumbers = allQuestions.map(q => q.number).sort((a, b) => a - b);
    const nextUnattempted = allQuestionNumbers.find(num => num > lastAttemptedQuestion && !userAnswers.has(num));
    
    // Scroll to next unattempted or last attempted
    const targetQuestion = nextUnattempted || lastAttemptedQuestion;
    console.log('[AutoScroll] Target question to scroll to:', targetQuestion);
    scrollToQuestion(targetQuestion);
  };

  const handleAnswerSelect = (questionNumber: number, option: OptionLabel) => {
    // Once the answer has been revealed the pick is final (until "Reset all")
    if (revealed.has(questionNumber)) return;

    const next: OptionLabel | null = userAnswers.get(questionNumber) === option ? null : option; // same option again = unselect
    const newAnswers = new Map(userAnswers);
    if (next === null) newAnswers.delete(questionNumber);
    else newAnswers.set(questionNumber, next);
    setUserAnswers(newAnswers);
    answersRef.current = newAnswers;

    if (userIdRef.current) {
      pendingRef.current.set(questionNumber, next);
      scheduleSave();
    }
  };

  // Only answered questions can be revealed
  const toggleShowAnswer = (questionNumber: number) => {
    if (!userAnswers.has(questionNumber)) return;
    setRevealed(prev => (prev.has(questionNumber) ? prev : new Set(prev).add(questionNumber)));
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

  const handleConfirmReset = async () => {
    setShowResetConfirm(false);
    const ok = await resetAll();
    setToast(ok ? { message: 'All answers cleared', type: 'success' } : { message: 'Could not reset answers. Please try again.', type: 'error' });
  };

  const getAnsweredCount = () => userAnswers.size;
  const getCorrectCount = () => {
    let correct = 0;
    allQuestions.forEach(q => {
      if (userAnswers.get(q.number) === q.correctAnswer) correct++;
    });
    return correct;
  };
  const totalQuestions = assessment.totalQuestions || allQuestions.length;
  const scorePercent = totalQuestions > 0 ? Math.round((getCorrectCount() / totalQuestions) * 100) : 0;

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
    } catch {
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
    } catch {
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
    } catch {
      setToast({ message: "Failed to save note", type: "error" });
    }
  };

  const handleShareQuestion = async (questionNumber: number) => {
    const url = `${window.location.origin}${window.location.pathname}#question-${questionNumber}`;
    
    try {
      await navigator.clipboard.writeText(url);
      setToast({ message: "Question link copied to clipboard!", type: "success" });
    } catch {
      setToast({ message: "Failed to copy link", type: "error" });
    }
  };

  const handleCheckResults = () => {
    // Reveal (and lock) answered questions only; unanswered ones stay hidden
    const answered = Array.from(userAnswers.keys());
    setShowAnswers(new Set(answered));
    setRevealed(prev => new Set([...prev, ...answered]));
    setShowResults(true);

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveIndicator =
    saveStatus === 'saving' || saveStatus === 'pending'
      ? 'Saving…'
      : saveStatus === 'error'
      ? 'Not saved · retrying'
      : saveStatus === 'saved'
      ? `Saved ✓ · ${userAnswers.size}/${totalQuestions}`
      : 'Autosave on';

  return (
    <>
      <div className="max-w-4xl space-y-6 pb-20 sm:pb-24">
        {/* Header */}
        <div className="border border-line bg-surface p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h1 className="mb-2 font-display text-[clamp(30px,4vw,48px)] font-extrabold leading-[0.95] tracking-[-0.04em] text-fg">
              {assessment.title}
            </h1>
            {assessment.description && (
              <p className="mb-4 text-fg-2">
                {assessment.description}
              </p>
            )}
            
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-xs uppercase tracking-label text-fg-3">
              <span>{assessment.totalQuestions} Questions</span>
              <span>Answered: {getAnsweredCount()} / {assessment.totalQuestions}</span>
              {userAnswers.size > 0 && (showResults || showAnswers.size > 0) && (
                <span className="text-ok">
                  Correct: {getCorrectCount()} / {totalQuestions}
                </span>
              )}
            </div>
          </div>
        </div>

        {!user && (
          <div className="mt-4 border border-dashed border-line-strong p-3 text-center">
            <button
              onClick={() => setShowAuthModal(true)}
              className="min-h-[44px] text-sm font-medium text-signal-text underline underline-offset-[3px]"
            >
              Sign in to keep practice answers across devices
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
              <div className="border-l-2 border-signal bg-surface px-4 py-3">
                <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-fg">{section.title}</h2>
                <p className="font-mono text-xs uppercase tracking-label text-fg-3">{section.questionRange}</p>
              </div>

            {/* Section Questions */}
            {section.questions.map((question) => {
              const userAnswer = userAnswers.get(question.number);
              const isShowingAnswer = !!userAnswer && showAnswers.has(question.number);
              const isLocked = revealed.has(question.number);
              const isCorrect = userAnswer === question.correctAnswer;

              // Options in this learner's display order; values stay the ORIGINAL letters
              const optionText = new Map(question.options.map(opt => [opt.label, opt.text]));
              const orderedOptions = (optionOrder.get(question.number) ?? question.options.map(opt => opt.label)).map(
                (label, idx) => ({ label, display: DISPLAY_LETTERS[idx] ?? label, text: optionText.get(label) ?? '' })
              );

              return (
                <div
                  key={question.number}
                  data-question-number={question.number}
                  className="border border-line bg-surface p-4 sm:p-6"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs uppercase tracking-label text-signal-text">
                          Question {question.number}
                        </span>
                        <button
                          onClick={() => handleShareQuestion(question.number)}
                          className="grid h-11 w-11 place-items-center text-fg-3 transition-colors hover:text-fg"
                          title="Share this question"
                          aria-label={`Copy a link to question ${question.number}`}
                        >
                          <Share2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <h3 className="mt-1 text-base font-semibold text-fg sm:text-lg">
                        {question.text}
                      </h3>
                    </div>

                    {userAnswer && (
                    <button
                      onClick={() => toggleShowAnswer(question.number)}
                      className="flex min-h-[44px] w-full shrink-0 items-center justify-center gap-2 border border-line-strong px-4 text-sm text-fg transition-colors hover:border-fg-3 sm:w-auto"
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
                    )}
                  </div>

                  {/* Options */}
                  {/* Hidden until the shuffle seed is known so learners never see the order jump */}
                  <div className={`space-y-3 ${shuffleSeed ? '' : 'invisible'}`} aria-busy={!shuffleSeed}>
                    {orderedOptions.map(({ label: key, display, text: value }) => {
                      const isSelected = userAnswer === key;
                      const isCorrectOption = question.correctAnswer === key;
                      const showCorrect = isShowingAnswer && isCorrectOption;
                      const showIncorrect = isShowingAnswer && isSelected && !isCorrect;

                      return (
                        <button
                          key={key}
                          onClick={() => handleAnswerSelect(question.number, key)}
                          aria-pressed={isSelected}
                          aria-disabled={isLocked}
                          className={`w-full p-4 text-left transition-colors ${isLocked ? 'cursor-default ' : ''}${
                            showCorrect
                              ? 'border-2 border-ok bg-bg'
                              : showIncorrect
                              ? 'border-2 border-bad bg-bg'
                              : isSelected
                              ? 'border-2 border-signal bg-surface-2'
                              : 'border border-line-strong bg-bg hover:border-fg-3'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <span className={`grid h-8 w-8 flex-shrink-0 place-items-center font-mono text-sm font-semibold ${
                              showCorrect
                                ? 'bg-ok text-[#04140B]'
                                : showIncorrect
                                ? 'border border-bad text-bad-text'
                                : isSelected
                                ? 'bg-signal text-on-signal'
                                : 'border border-line-strong text-fg-2'
                            }`}>
                              {display}
                            </span>
                            <span className="flex-1 pt-1 text-fg">{value}</span>
                            {showCorrect && (
                              <CheckCircle className="flex-shrink-0 w-6 h-6 text-ok" />
                            )}
                            {showIncorrect && (
                              <XCircle className="flex-shrink-0 w-6 h-6 text-bad-text" />
                            )}
                            {isSelected && !isShowingAnswer && (
                              <span className="flex-shrink-0 font-mono text-xs text-signal-text">SELECTED</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Answer status and explanation */}
                  {isShowingAnswer && (
                    <div className={`mt-4 space-y-3 border bg-bg p-4 ${isCorrect ? 'border-ok' : 'border-bad'}`}>
                      <p className={`font-mono text-xs font-semibold uppercase tracking-label ${isCorrect ? 'text-ok' : 'text-bad-text'}`}>
                        {isCorrect
                          ? '✓ Correct'
                          : `✕ Not quite · the answer is ${displayLetter(question.number, question.correctAnswer)}`}
                      </p>
                      {question.explanation && (
                        <p className="border-t border-line pt-3 text-sm leading-relaxed text-fg-2">{question.explanation}</p>
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
          onClose={closeToast}
        />
      )}

      <ConfirmDialog
        isOpen={showResetConfirm}
        title="Reset all answers?"
        message="This clears every answer on this assessment. It cannot be undone."
        confirmText="Reset answers"
        onConfirm={handleConfirmReset}
        onCancel={() => setShowResetConfirm(false)}
      />
    </div>

    {/* Bottom bar: fixed above the mobile dock, floating bottom-right on desktop */}
    {userAnswers.size > 0 && (
      <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+58px)] z-40 border-t border-line bg-bg/95 p-2 backdrop-blur sm:p-3 lg:inset-x-auto lg:bottom-4 lg:right-6 lg:border">
        <div className="flex flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="text-center font-mono text-xs text-fg-3 sm:text-left">
            {getAnsweredCount()} / {assessment.totalQuestions} answered
            {showResults && (
              <span className="ml-3 text-ok">
                score {getCorrectCount()}/{totalQuestions} · {scorePercent}%
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-1.5 sm:flex sm:gap-2">
            {/* Reset button - mobile only (desktop has it in the sections sidebar) */}
            <button
              onClick={() => setShowResetConfirm(true)}
              disabled={userAnswers.size === 0}
              className="flex min-h-[44px] items-center justify-center gap-1 border border-line-strong px-2 text-xs text-fg transition-colors hover:border-fg-3 disabled:cursor-not-allowed disabled:opacity-50 lg:hidden"
              title="Reset all answers"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
            <button
              onClick={handleCheckResults}
              disabled={userAnswers.size === 0}
              className="flex min-h-[44px] items-center justify-center gap-1.5 bg-signal px-4 text-sm font-semibold text-on-signal transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircle className="h-4 w-4" />
              Check
            </button>
            {user ? (
              <span
                aria-live="polite"
                className={`flex items-center justify-center gap-1 px-2 font-mono text-[10px] sm:px-3 sm:text-xs ${
                  saveStatus === 'error' ? 'text-bad-text' : saveStatus === 'saved' ? 'text-ok' : 'text-fg-3'
                }`}
              >
                {saveIndicator}
              </span>
            ) : (
              <button
                onClick={() => openAuthModal()}
                className="flex min-h-[44px] items-center justify-center gap-1.5 border border-line-strong px-3 text-xs text-fg transition-colors hover:border-fg-3 sm:text-sm"
                title="Answers are saved in this browser. Sign in to keep them across devices."
              >
                <Save className="h-4 w-4" />
                <span className="hidden sm:inline">Saved here · sign in to sync</span>
                <span className="sm:hidden">Sign in</span>
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
