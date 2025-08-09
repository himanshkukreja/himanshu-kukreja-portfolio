"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail } from "lucide-react";

const schema = z.object({ email: z.string().email() });

export default function NewsletterForm() {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<{ email: string }>({ resolver: zodResolver(schema) });
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  const onSubmit = async (data: { email: string }) => {
    setStatus("idle");
    setMessage("");
    try {
      const res = await fetch("/api/newsletter/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed");
      setStatus("success");
      setMessage(json?.message || "You're subscribed!");
      reset();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus("error");
      setMessage(msg || "Something went wrong");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-md">
      <div className="flex gap-2">
        <input
          type="email"
          placeholder="Your email"
          {...register("email")}
          className="flex-1 rounded-xl bg-white/5 border border-white/10 px-4 py-2 text-sm text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
        <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12),0_10px_30px_-12px_rgba(59,130,246,0.6)] bg-[linear-gradient(110deg,rgba(99,102,241,0.95),rgba(59,130,246,0.95),rgba(147,51,234,0.95))]">
          <Mail className="h-4 w-4" /> Subscribe
        </button>
      </div>
      {errors.email && <p className="mt-2 text-xs text-red-300">{errors.email.message as string}</p>}
      {status !== "idle" && <p className={`mt-2 text-xs ${status === "success" ? "text-green-300" : "text-red-300"}`}>{message}</p>}
    </form>
  );
}
