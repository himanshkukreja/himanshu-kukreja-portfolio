"use client";

/**
 * The code-lab editor: CodeMirror 6 with Python, JavaScript or TypeScript (switched in place through a
 * compartment), themed from the site's tokens (CSS variables, so it follows every theme with no re-render). Loaded on demand through loadCodeEditor() in
 * src/lib/offline/lazy.ts, the same import offline saving warms, so it is one chunk either way.
 */
import { useEffect, useImperativeHandle, useRef, type RefObject } from "react";
import { Compartment, EditorSelection, EditorState, Prec } from "@codemirror/state";
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, HighlightStyle, indentOnInput, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { acceptCompletion, autocompletion, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { python } from "@codemirror/lang-python";
import { javascript } from "@codemirror/lang-javascript";
import { cppLanguage, javaLanguage } from "./clike";
import { makeSource } from "./completions";
import { tags as t } from "@lezer/highlight";
import styles from "./labs.module.css";

export type CodeEditorHandle = {
  getValue(): string;
  /** replace the whole document as one undoable change */
  setValue(v: string): void;
  focus(): void;
  goToLine(line: number): void;
};

/** java and cpp: DSA Mastery's problem room (a small highlighting-only stream mode, ./clike.ts) */
export type EditorLang = "python" | "javascript" | "typescript" | "java" | "cpp";
const langExt = (l: EditorLang) => (l === "python" ? python() : l === "java" ? javaLanguage() : l === "cpp" ? cppLanguage() : javascript({ typescript: l === "typescript" }));

/** touch keyboards: nothing is pre-selected, so Enter stays a newline until the learner picks an option */
const coarse = () => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;

/**
 * Basic suggestions: the language's own sources plus ./completions. Enter or Tab accepts, Escape closes (Tab still
 * indents when the list is closed). Opens after 2 typed characters, or at once after a dot.
 */
const suggestExt = (l: EditorLang, on: boolean) =>
  on
    ? [
        autocompletion({ activateOnTyping: true, activateOnTypingDelay: 120, maxRenderedOptions: 12, icons: true, selectOnOpen: !coarse() }),
        EditorState.languageData.of(() => [{ autocomplete: makeSource(l) }]),
        Prec.high(keymap.of([{ key: "Tab", run: acceptCompletion }])),
      ]
    : [];

type Props = {
  /** basic code suggestions (default on); off in interview mode */
  suggestions?: boolean;
  /** the language to highlight (defaults to Python) */
  language?: EditorLang;
  /** filled with the editor's handle (a prop, not `ref`, so it survives next/dynamic) */
  handle: RefObject<CodeEditorHandle | null>;
  initial: string;
  fontSize: number;
  label: string;
  onChange?: (value: string) => void;
  onRun?: () => void;
  onFocus?: () => void;
};

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword, t.definitionKeyword], color: "var(--lab-kw)", fontWeight: "600" },
  { tag: [t.string, t.special(t.string), t.regexp], color: "var(--lab-str)" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "var(--lab-num)" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--lab-com)", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.function(t.definition(t.variableName))], color: "var(--lab-fn)" },
  { tag: [t.definition(t.className), t.className, t.typeName], color: "var(--lab-type)" },
  { tag: [t.self, t.special(t.variableName)], color: "var(--lab-self)" },
  { tag: [t.propertyName], color: "var(--lab-prop)" },
  { tag: [t.operator, t.punctuation, t.bracket], color: "var(--lab-op)" },
  { tag: t.invalid, color: "var(--c-bad-text)" },
]);

const theme = EditorView.theme({
  "&": { color: "var(--c-fg)", backgroundColor: "var(--c-raised)", height: "100%" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace", lineHeight: "1.65", overflow: "auto" },
  ".cm-content": { caretColor: "var(--c-signal)", padding: "12px 0 40px" },
  ".cm-line": { padding: "0 14px 0 10px" },
  ".cm-gutters": { backgroundColor: "var(--c-surface)", color: "var(--c-fg-4)", border: "none", borderRight: "1px solid var(--c-line)" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 10px 0 12px", minWidth: "36px" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--c-signal) 6%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "color-mix(in srgb, var(--c-signal) 8%, transparent)", color: "var(--c-fg-2)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--c-signal)", borderLeftWidth: "2px" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "color-mix(in srgb, var(--c-signal) 26%, transparent)",
  },
  ".cm-matchingBracket": { backgroundColor: "color-mix(in srgb, var(--c-signal) 22%, transparent)", outline: "1px solid color-mix(in srgb, var(--c-signal) 55%, transparent)" },
  ".cm-nonmatchingBracket": { color: "var(--c-bad-text)" },
  // suggestions: the editor's own tokens (teal inside .dsa-theme, through --c-signal)
  ".cm-tooltip.cm-tooltip-autocomplete": { backgroundColor: "var(--c-raised)", color: "var(--c-fg)", border: "1px solid var(--c-line-strong)", boxShadow: "0 8px 24px rgba(0,0,0,0.18)" },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": { fontFamily: "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace", maxHeight: "16em" },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li": { padding: "2px 8px 2px 4px", color: "var(--c-fg-2)" },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "color-mix(in srgb, var(--c-signal) 18%, transparent)", color: "var(--c-fg)" },
  ".cm-completionMatchedText": { textDecoration: "none", fontWeight: "700", color: "var(--c-signal-text)" },
  ".cm-completionDetail": { color: "var(--c-fg-4)", fontStyle: "normal", marginLeft: "0.8em" },
  ".cm-completionIcon": { opacity: "1", width: "1.3em", fontSize: "90%", textAlign: "center" },
  ".cm-completionIcon-keyword": { color: "var(--lab-kw)", "&:after": { content: "'k'" } },
  ".cm-completionIcon-function, .cm-completionIcon-method": { color: "var(--lab-fn)", "&:after": { content: "'f'" } },
  ".cm-completionIcon-class, .cm-completionIcon-type": { color: "var(--lab-type)", "&:after": { content: "'C'" } },
  ".cm-completionIcon-variable, .cm-completionIcon-property, .cm-completionIcon-constant": { color: "var(--lab-prop)", "&:after": { content: "'x'" } },
  ".cm-completionIcon-snippet": { color: "var(--c-signal-text)", "&:after": { content: "'{}'" } },
});

export default function CodeEditor({ handle, initial, fontSize, label, onChange, onRun, onFocus, language = "python", suggestions = true }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const cb = useRef({ onChange, onRun, onFocus });
  const fontComp = useRef(new Compartment());
  const langComp = useRef(new Compartment());
  const indentComp = useRef(new Compartment());
  const suggestComp = useRef(new Compartment());

  useEffect(() => {
    cb.current = { onChange, onRun, onFocus };
  }, [onChange, onRun, onFocus]);

  useEffect(() => {
    if (!host.current) return;
    const runKeys = keymap.of([
      {
        key: "Mod-Enter",
        preventDefault: true,
        run: () => {
          cb.current.onRun?.();
          return true;
        },
      },
    ]);
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initial,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          drawSelection(),
          dropCursor(),
          EditorState.allowMultipleSelections.of(true),
          indentOnInput(),
          indentComp.current.of(indentUnit.of(language === "python" || language === "java" || language === "cpp" ? "    " : "  ")),
          EditorState.tabSize.of(4),
          bracketMatching(),
          closeBrackets(),
          rectangularSelection(),
          highlightActiveLine(),
          langComp.current.of(langExt(language)),
          suggestComp.current.of(suggestExt(language, suggestions)),
          syntaxHighlighting(highlight),
          theme,
          fontComp.current.of(EditorView.theme({ "&": { fontSize: `${fontSize}px` } })),
          runKeys,
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.contentAttributes.of({ "aria-label": label, autocapitalize: "off", autocorrect: "off", spellcheck: "false" }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) cb.current.onChange?.(u.state.doc.toString());
            if (u.focusChanged && u.view.hasFocus) cb.current.onFocus?.();
          }),
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // the editor is created once; `initial` only seeds it (setValue replaces it later)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    view.current?.dispatch({ effects: suggestComp.current.reconfigure(suggestExt(language, suggestions)) });
  }, [language, suggestions]);

  useEffect(() => {
    view.current?.dispatch({ effects: [langComp.current.reconfigure(langExt(language)), indentComp.current.reconfigure(indentUnit.of(language === "python" || language === "java" || language === "cpp" ? "    " : "  "))] });
  }, [language]);

  useEffect(() => {
    view.current?.dispatch({ effects: fontComp.current.reconfigure(EditorView.theme({ "&": { fontSize: `${fontSize}px` } })) });
  }, [fontSize]);

  useImperativeHandle(
    handle,
    () => ({
      getValue: () => view.current?.state.doc.toString() ?? initial,
      setValue: (value: string) => {
        const v = view.current;
        if (!v) return;
        v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value }, selection: EditorSelection.cursor(0), scrollIntoView: true });
      },
      focus: () => view.current?.focus(),
      goToLine: (line: number) => {
        const v = view.current;
        if (!v) return;
        const n = Math.min(Math.max(1, line), v.state.doc.lines);
        const l = v.state.doc.line(n);
        v.dispatch({ selection: EditorSelection.range(l.from, l.to), scrollIntoView: true });
        v.focus();
      },
    }),
    [initial]
  );

  return <div ref={host} className={`${styles.editor} h-full min-h-0`} />;
}
