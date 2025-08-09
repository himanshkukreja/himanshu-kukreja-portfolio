"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, cubicBezier } from "framer-motion";
import { Mail, User, MessageSquare, CheckCircle, AlertCircle } from "lucide-react";

const schema = z.object({
  name: z.string().min(2, "Please enter at least 2 characters"),
  email: z.string().email("Please enter a valid email"),
  message: z.string().min(10, "Please enter at least 10 characters"),
});

type FormValues = z.infer<typeof schema>;

export default function Contact() {
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState<string>("");
  
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({ 
    resolver: zodResolver(schema) 
  });

  const onSubmit = async (values: FormValues) => {
    try {
      setStatus("idle");
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setStatus("success");
        setStatusMessage(data.message || "Message sent successfully!");
        reset();
      } else {
        setStatus("error");
        setStatusMessage(data.error || "Failed to send message. Please try again.");
      }
    } catch (e) {
      console.error(e);
      setStatus("error");
      setStatusMessage("Network error. Please check your connection and try again.");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px -20% 0px" }}
      transition={{ duration: 0.45, ease: cubicBezier(0.22, 1, 0.36, 1) }}
      className="relative rounded-2xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-black/5 dark:shadow-black/30"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 max-w-2xl">
        <div className="grid gap-1">
          <label className="text-xs font-medium text-white/70 flex items-center gap-2"><User className="h-4 w-4" /> Name</label>
          <input
            placeholder="Your name"
            className="rounded-xl border border-white/10 bg-white/5 text-white p-3 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]/60 placeholder:text-white/40"
            {...register("name")}
          />
          {errors.name && <p className="text-[11px] text-red-400">{errors.name.message}</p>}
        </div>

        <div className="grid gap-1">
          <label className="text-xs font-medium text-white/70 flex items-center gap-2"><Mail className="h-4 w-4" /> Email</label>
          <input
            placeholder="you@example.com"
            className="rounded-xl border border-white/10 bg-white/5 text-white p-3 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]/60 placeholder:text-white/40"
            {...register("email")}
          />
          {errors.email && <p className="text-[11px] text-red-400">{errors.email.message}</p>}
        </div>

        <div className="grid gap-1">
          <label className="text-xs font-medium text-white/70 flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Message</label>
          <textarea
            rows={5}
            placeholder="Tell me about your project or role..."
            className="rounded-xl border border-white/10 bg-white/5 text-white p-3 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]/60 placeholder:text-white/40"
            {...register("message")}
          />
          {errors.message && <p className="text-[11px] text-red-400">{errors.message.message}</p>}
        </div>

        <div className="flex items-center gap-3">
          <button
            disabled={isSubmitting}
            className="group relative inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-[var(--ring)] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-[0_12px_36px_-12px_rgba(59,130,246,0.55)] disabled:opacity-70"
          >
            <span aria-hidden className="absolute -inset-px -z-10 rounded-xl bg-gradient-to-r from-indigo-500 via-blue-500 to-purple-500 opacity-95 transition-opacity duration-300 group-hover:opacity-100" />
            <span aria-hidden className="absolute inset-0 -z-20 rounded-xl blur-md bg-gradient-to-r from-indigo-500/40 via-blue-500/35 to-purple-500/40 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            {isSubmitting ? "Sending..." : "Send Message"}
          </button>
          
          {status === "success" && (
            <span className="flex items-center gap-1.5 text-[11px] text-green-400">
              <CheckCircle className="h-3.5 w-3.5" />
              {statusMessage}
            </span>
          )}
          
          {status === "error" && (
            <span className="flex items-center gap-1.5 text-[11px] text-red-400">
              <AlertCircle className="h-3.5 w-3.5" />
              {statusMessage}
            </span>
          )}
        </div>
      </form>

      <div className="pointer-events-none absolute -inset-px -z-10 rounded-2xl bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.08),transparent_55%)]" />
    </motion.div>
  );
}
