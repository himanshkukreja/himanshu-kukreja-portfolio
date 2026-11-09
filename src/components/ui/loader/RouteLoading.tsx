/**
 * Route-level loading screen for `loading.tsx` files: the terminal boot log on top, then a
 * skeleton shaped like the page that is coming, so nothing jumps when it streams in.
 * Server component (the only client piece is ProgressHold, which keeps the top bar running).
 */
import type { ReactNode } from "react";
import ProgressHold from "@/components/site/ProgressHold";
import { BootLoader, Skeleton, SkeletonText } from "./index";

export type RouteShape = "page" | "course" | "lesson" | "dashboard" | "grid" | "story" | "admin" | "split";

const wrap = "mx-auto w-full max-w-[1320px] px-4 sm:px-6";

function Shape({ shape }: { shape: RouteShape }) {
  switch (shape) {
    case "lesson":
      return (
        <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12">
          <div className="hidden flex-col gap-2 lg:flex">
            {Array.from({ length: 7 }, (_, i) => (
              <Skeleton key={i} className="h-9" style={{ opacity: 1 - i * 0.1 }} />
            ))}
          </div>
          <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5">
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-11 w-[88%] sm:h-14" />
            <Skeleton className="h-11 w-[60%] sm:h-14" />
            <div className="flex gap-2">
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-7 w-16" />
            </div>
            <SkeletonText lines={5} className="mt-4" />
            <Skeleton className="h-44 w-full border border-line" />
            <SkeletonText lines={4} />
          </div>
        </div>
      );
    case "course":
      return (
        <div className="flex flex-col gap-10">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-14 w-[min(560px,90%)] sm:h-20" />
            <SkeletonText lines={2} className="max-w-[640px]" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-40 border border-line" />
            ))}
          </div>
        </div>
      );
    case "dashboard":
      return (
        <div className="flex flex-col gap-6">
          <Skeleton className="h-12 w-[min(420px,80%)] sm:h-16" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-[220px] border border-line" />
          <div className="grid gap-3 lg:grid-cols-2">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        </div>
      );
    case "grid":
      return (
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-12 w-[min(480px,85%)] sm:h-16" />
            <SkeletonText lines={2} className="max-w-[620px]" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-52 border border-line" />
            ))}
          </div>
        </div>
      );
    case "story":
      return (
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-12 w-[92%] sm:h-16" />
          <Skeleton className="h-12 w-[55%] sm:h-16" />
          <Skeleton className="mt-2 aspect-[16/7] w-full" />
          <SkeletonText lines={6} />
        </div>
      );
    case "split":
      // a two-pane room: the statement on the left, the editor on the right (DSA Mastery's problem room)
      return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-8">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-10 w-[80%] sm:h-12" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-24" />
            </div>
            <SkeletonText lines={6} className="mt-2" />
          </div>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-10 w-[70%]" />
            <Skeleton className="h-[320px] border border-line sm:h-[420px]" />
            <div className="flex gap-2">
              <Skeleton className="h-11 w-20" />
              <Skeleton className="h-11 w-24" />
            </div>
          </div>
        </div>
      );
    case "admin":
      return (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-64 border border-line" />
        </div>
      );
    default:
      return (
        <div className="flex max-w-[760px] flex-col gap-4">
          <Skeleton className="h-12 w-[70%]" />
          <SkeletonText lines={4} />
        </div>
      );
  }
}

export default function RouteLoading({
  cmd,
  steps,
  label = "Loading page",
  shape = "page",
  prompt,
  mark,
  bare = false,
}: {
  cmd: string;
  /** The boot log's title-bar badge (BootLoader). */
  mark?: ReactNode;
  /** Terminal home (BootLoader): course routes pass "~/sdm". */
  prompt?: string;
  steps: string[];
  label?: string;
  shape?: RouteShape;
  /** Inside a layout that already provides the page container (e.g. the admin shell). */
  bare?: boolean;
}) {
  const Tag = bare ? "div" : "main";
  return (
    <Tag data-route-loading aria-busy="true" className={bare ? "flex flex-col gap-6" : `${wrap} flex flex-col gap-8 pb-24 pt-8 sm:pt-12`}>
      <ProgressHold />
      <BootLoader cmd={cmd} steps={steps} label={label} prompt={prompt} mark={mark} />
      <Shape shape={shape} />
    </Tag>
  );
}
