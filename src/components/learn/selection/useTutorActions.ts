"use client";

/**
 * The course tutor's actions for an article's selection toolbar (TextSelectionMenu): "Explain this" and
 * "Ask the tutor" when the chat is on for this learner, "Sign in to ask the tutor" when signed out, nothing
 * otherwise (the chat is off or still loading). Also binds Alt+A: ask the tutor about the current selection.
 */
import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useAiStatus } from "@/components/learn/ai/useAiStatus";
import { liveRange, openTutor, tutorEligible, tutorSelection } from "@/lib/learn/tutorSelection";

export type TutorMenuProps = {
  onExplain?: () => void;
  onAskTutor?: () => void;
  onTutorSignIn?: () => void;
};

type Options = {
  /** the range the toolbar was opened for (the live selection can collapse once a button takes focus) */
  getRange: () => Range | null;
  /** close the toolbar once the tutor opens */
  onDone: () => void;
};

export function useTutorActions(rootRef: React.RefObject<HTMLElement | null>, { getRange, onDone }: Options) {
  const { user, loading } = useAuth();
  const { openAuthModal } = useAuthModal();
  const ai = useAiStatus();
  const state: "on" | "signin" | "off" = loading ? "off" : !user ? "signin" : ai?.features["course-chat"] ? "on" : "off";

  const latest = useRef({ getRange, onDone, openAuthModal });
  useEffect(() => {
    latest.current = { getRange, onDone, openAuthModal };
  });

  const fire = useCallback(
    (mode: "explain" | "ask", range?: Range | null) => {
      const root = rootRef.current;
      const r = range ?? latest.current.getRange();
      if (!root || !r) return false;
      const ctx = tutorSelection(r, root);
      if (!ctx) return false;
      latest.current.onDone();
      openTutor(mode, ctx);
      return true;
    },
    [rootRef],
  );

  const signIn = useCallback(() => {
    latest.current.onDone();
    latest.current.openAuthModal();
  }, []);

  // Alt+A (Option+A on a Mac, matched by key position): ask the tutor about the selected passage
  useEffect(() => {
    if (state === "off") return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.code !== "KeyA") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const r = liveRange(rootRef.current) ?? latest.current.getRange();
      if (!r || !tutorEligible(r.toString())) return;
      e.preventDefault();
      if (state === "signin") signIn();
      else fire("ask", r);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state, rootRef, fire, signIn]);

  /** the toolbar props for this selected text (none for a word or two, or more than ~1,200 characters) */
  const menuProps = (text: string): TutorMenuProps => {
    if (state === "off" || !tutorEligible(text)) return {};
    if (state === "signin") return { onTutorSignIn: signIn };
    return {
      onExplain: () => void fire("explain"),
      onAskTutor: () => void fire("ask"),
    };
  };

  return { menuProps, state };
}
