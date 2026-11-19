"use client";

/**
 * "My lists" in the browser: the learner's named problem lists, read from and written to the game flags
 * (`pref:dsa-list:<id>`, src/lib/dsa/my-lists.ts), so a list lives on this device for guests and follows the account once
 * signed in, the way saved problems and the reading look do. Every component that calls this shares the one GameProvider
 * state, so the bank's row, the problem page and the sidebar always agree.
 */
import { useCallback, useMemo } from "react";
import { useGame } from "@/game/GameProvider";
import { useAuth } from "@/contexts/AuthContext";
import { track } from "@/lib/track";
import { addProblem, copyShared, createList, flagKey, listsFrom, moveProblem, nudgeProblem, removeProblem, renameList, tombstone, type MyList, type OpResult, type SharedList } from "@/lib/dsa/my-lists";

export type MyLists = {
  ready: boolean;
  signedIn: boolean;
  lists: MyList[];
  get: (id: string) => MyList | undefined;
  create: (name: string, desc?: string) => OpResult;
  rename: (id: string, name: string, desc: string) => OpResult;
  remove: (id: string) => void;
  /** adds, or does nothing when the list already holds it */
  add: (listId: string, problemId: string, from?: string) => OpResult;
  drop: (listId: string, problemId: string) => void;
  move: (listId: string, from: number, to: number) => void;
  nudge: (listId: string, problemId: string, dir: -1 | 1) => void;
  copy: (s: SharedList) => OpResult;
};

export function useMyLists(): MyLists {
  const { flags, setFlag, hydrated } = useGame();
  const { user } = useAuth();
  const lists = useMemo(() => (hydrated ? listsFrom(flags) : []), [flags, hydrated]);
  const byId = useMemo(() => new Map(lists.map((l) => [l.id, l])), [lists]);
  const put = useCallback((l: MyList) => setFlag(flagKey(l.id), l), [setFlag]);

  const create = useCallback(
    (name: string, desc = "") => {
      const r = createList(lists, name, desc);
      if (r.ok) {
        put(r.list);
        track("dsa_list_create", { lists: lists.length + 1 });
      }
      return r;
    },
    [lists, put],
  );
  const rename = useCallback(
    (id: string, name: string, desc: string): OpResult => {
      const l = byId.get(id);
      if (!l) return { ok: false, reason: "That list is gone." };
      const r = renameList(l, lists, name, desc);
      if (r.ok) put(r.list);
      return r;
    },
    [byId, lists, put],
  );
  const remove = useCallback(
    (id: string) => {
      const l = byId.get(id);
      if (!l) return;
      put(tombstone(l));
      track("dsa_list_delete", { problems: l.ids.length });
    },
    [byId, put],
  );
  const add = useCallback(
    (listId: string, problemId: string, from = "bank"): OpResult => {
      const l = byId.get(listId);
      if (!l) return { ok: false, reason: "That list is gone." };
      const r = addProblem(l, problemId);
      if (r.ok && r.list !== l) {
        put(r.list);
        track("dsa_list_add", { problem: problemId, from });
      }
      return r;
    },
    [byId, put],
  );
  const drop = useCallback(
    (listId: string, problemId: string) => {
      const l = byId.get(listId);
      if (l) put(removeProblem(l, problemId));
    },
    [byId, put],
  );
  const move = useCallback(
    (listId: string, from: number, to: number) => {
      const l = byId.get(listId);
      if (l) put(moveProblem(l, from, to));
    },
    [byId, put],
  );
  const nudge = useCallback(
    (listId: string, problemId: string, dir: -1 | 1) => {
      const l = byId.get(listId);
      if (l) put(nudgeProblem(l, problemId, dir));
    },
    [byId, put],
  );
  const copy = useCallback(
    (s: SharedList) => {
      const r = copyShared(lists, s);
      if (r.ok) {
        put(r.list);
        track("dsa_list_copy", { problems: r.list.ids.length });
      }
      return r;
    },
    [lists, put],
  );

  return { ready: hydrated, signedIn: !!user, lists, get: (id) => byId.get(id), create, rename, remove, add, drop, move, nudge, copy };
}
