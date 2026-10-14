"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const schema = z.object({ email: z.string().email("Enter a valid email address") });

/** "Get the next case file by email" — same subscribe API as NewsletterForm, Level Up styling. */
export default function NewsletterStrip() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<{ email: string }>({ resolver: zodResolver(schema) });
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const onSubmit = async (data: { email: string }) => {
    setStatus("idle");
    setMessage("");
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed");
      setStatus("success");
      setMessage(json?.message || "You're subscribed!");
      reset();
    } catch (e: unknown) {
      setStatus("error");
      setMessage((e instanceof Error ? e.message : String(e)) || "Something went wrong");
    }
  };

  return (
    <section aria-labelledby="case-news-h" className="flex flex-wrap items-center justify-between gap-6 border border-line bg-surface p-5 sm:p-8">
      <div className="flex max-w-[560px] flex-col gap-2">
        <h2 id="case-news-h" className="m-0 font-display text-[28px] font-bold tracking-[-0.02em]">
          Get the next case file by email
        </h2>
        <p className="m-0 text-[15px] text-fg-2">One story when it ships. No digest, no spam.</p>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex max-w-[520px] flex-[1_1_360px] flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <label className="flex flex-[1_1_220px]">
            <span className="sr-only">Email</span>
            <input
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              aria-invalid={!!errors.email}
              {...register("email")}
              className="min-h-12 w-full grow border border-line-strong bg-bg px-3.5 text-base text-fg placeholder:text-fg-4 focus:border-signal focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={isSubmitting}
            className="min-h-12 bg-signal px-5 text-[15px] font-semibold text-on-signal hover:brightness-110 disabled:opacity-60"
          >
            {isSubmitting ? "Subscribing…" : "Subscribe"}
          </button>
        </div>
        <div aria-live="polite" className="min-h-[1px]">
          {errors.email && <p className="m-0 text-xs text-bad-text">{errors.email.message as string}</p>}
          {status !== "idle" && (
            <p className={`m-0 font-mono text-xs ${status === "success" ? "text-signal-text" : "text-bad-text"}`}>
              {status === "success" ? "✓ " : ""}
              {message}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}
