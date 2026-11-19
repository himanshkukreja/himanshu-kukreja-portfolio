"use client";

/**
 * The code-lab editor: CodeMirror 6 with Python, JavaScript or TypeScript (switched in place through a
 * compartment), themed by a palette (src/lib/editor/themes.ts: Match site theme by default, or the learner's manual pick; CSS variables, so a switch re-colours in place). Loaded on demand through loadCodeEditor() in
 * src/lib/offline/lazy.ts, the same import offline saving warms, so it is one chunk either way.
 */
import { useEffect, useImperativeHandle, useRef, type CSSProperties, type RefObject } from "react";
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
import { paletteVars } from "@/lib/editor/themes";
import { useEditorTheme } from "./useEditorTheme";

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
 * indents when the list is closed). Opens after 2 typed characters, or at once after a dot. The source is made once
 * per language: the autocompletion keeps a source's results by its identity, so a new function on every update
 * re-queried forever and the list never showed (Java and C++ have no source of their own to fall back on).
 */
const SOURCES = new Map<EditorLang, ReturnType<typeof makeSource>>();
const sourceFor = (l: EditorLang) => {
  let s = SOURCES.get(l);
  if (!s) SOURCES.set(l, (s = makeSource(l)));
  return s;
};
const suggestExt = (l: EditorLang, on: boolean) =>
  on
    ? [
        autocompletion({ activateOnTyping: true, activateOnTypingDelay: 120, maxRenderedOptions: 12, icons: true, selectOnOpen: !coarse() }),
        EditorState.languageData.of(() => [{ autocomplete: sourceFor(l) }]),
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
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword, t.definitionKeyword], color: "var(--ed-kw)", fontWeight: "600" },
  { tag: [t.string, t.special(t.string), t.regexp], color: "var(--ed-str)" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "var(--ed-num)" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--ed-com)", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.function(t.definition(t.variableName))], color: "var(--ed-fn)" },
  { tag: [t.definition(t.className), t.className, t.typeName], color: "var(--ed-type)" },
  { tag: [t.self, t.special(t.variableName)], color: "var(--ed-self)" },
  { tag: [t.propertyName], color: "var(--ed-prop)" },
  { tag: [t.operator, t.punctuation, t.bracket], color: "var(--ed-op)" },
  { tag: t.invalid, color: "var(--ed-err)" },
]);

const mono = "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace";

/** Every colour is a --ed-* variable (src/lib/editor/themes.ts, set on the host element), so a theme switch re-colours in place. */
const theme = EditorView.theme({
  "&": { color: "var(--ed-fg)", backgroundColor: "var(--ed-bg)", height: "100%" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: mono, lineHeight: "1.65", overflow: "auto" },
  ".cm-content": { caretColor: "var(--ed-caret)", padding: "12px 0 40px" },
  ".cm-line": { padding: "0 14px 0 10px" },
  ".cm-gutters": { backgroundColor: "var(--ed-gutter-bg)", color: "var(--ed-gutter-fg)", border: "none", borderRight: "1px solid var(--ed-gutter-line)" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 10px 0 12px", minWidth: "36px" },
  ".cm-activeLine": { backgroundColor: "var(--ed-active-line)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--ed-active-line)", color: "var(--ed-gutter-fg-active)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--ed-caret)", borderLeftWidth: "2px" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--ed-selection)",
  },
  ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": { backgroundColor: "var(--ed-bracket)", outline: "1px solid var(--ed-bracket-line)" },
  ".cm-nonmatchingBracket, &.cm-focused .cm-nonmatchingBracket": { color: "var(--ed-err)", backgroundColor: "transparent", outline: "1px solid var(--ed-err)" },
  // search matches (the search panel, when a build adds it) and diagnostics (lint underlines)
  ".cm-searchMatch": { backgroundColor: "var(--ed-search)", outline: "1px solid var(--ed-popup-line)" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "var(--ed-search-active)" },
  ".cm-selectionMatch": { backgroundColor: "var(--ed-bracket)" },
  ".cm-lintRange-error": { backgroundImage: "none", textDecoration: "underline wavy var(--ed-err)", textUnderlineOffset: "3px" },
  ".cm-lintRange-warning": { backgroundImage: "none", textDecoration: "underline wavy var(--ed-warn)", textUnderlineOffset: "3px" },
  ".cm-diagnostic-error": { borderLeft: "3px solid var(--ed-err)" },
  ".cm-diagnostic-warning": { borderLeft: "3px solid var(--ed-warn)" },
  ".cm-panels": { backgroundColor: "var(--ed-popup-bg)", color: "var(--ed-fg)" },
  ".cm-panels input, .cm-panels button": { color: "var(--ed-fg)", backgroundColor: "var(--ed-bg)", border: "1px solid var(--ed-popup-line)" },
  // suggestions
  ".cm-tooltip": { backgroundColor: "var(--ed-popup-bg)", color: "var(--ed-fg)", border: "1px solid var(--ed-popup-line)" },
  ".cm-tooltip.cm-tooltip-autocomplete": { backgroundColor: "var(--ed-popup-bg)", color: "var(--ed-fg)", border: "1px solid var(--ed-popup-line)", boxShadow: "0 8px 24px rgba(0,0,0,0.22)" },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": { fontFamily: mono, maxHeight: "16em" },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li": { padding: "2px 8px 2px 4px", color: "var(--ed-fg)" },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "var(--ed-popup-sel)", color: "var(--ed-fg)" },
  ".cm-completionMatchedText": { textDecoration: "none", fontWeight: "700", color: "var(--ed-accent)" },
  ".cm-completionDetail": { color: "var(--ed-gutter-fg)", fontStyle: "normal", marginLeft: "0.8em" },
  ".cm-completionIcon": { opacity: "1", width: "1.3em", fontSize: "90%", textAlign: "center" },
  ".cm-completionIcon-keyword": { color: "var(--ed-kw)", "&:after": { content: "'k'" } },
  ".cm-completionIcon-function, .cm-completionIcon-method": { color: "var(--ed-fn)", "&:after": { content: "'f'" } },
  ".cm-completionIcon-class, .cm-completionIcon-type": { color: "var(--ed-type)", "&:after": { content: "'C'" } },
  ".cm-completionIcon-variable, .cm-completionIcon-property, .cm-completionIcon-constant": { color: "var(--ed-prop)", "&:after": { content: "'x'" } },
  ".cm-completionIcon-snippet": { color: "var(--ed-accent)", "&:after": { content: "'{}'" } },
});

export default function CodeEditor({ handle, initial, fontSize, label, onChange, onRun, onFocus, language = "python", suggestions = true }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const { palette } = useEditorTheme();
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

  return <div ref={host} className={`${styles.editor} h-full min-h-0`} style={paletteVars(palette) as CSSProperties} data-editor-palette={palette.bg} />;
}
