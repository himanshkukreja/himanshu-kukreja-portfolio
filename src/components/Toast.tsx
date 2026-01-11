"use client";

import { useEffect } from "react";
import { X, CheckCircle, XCircle, Info } from "lucide-react";

type ToastProps = {
  message: string;
  type?: "success" | "error" | "info";
  onClose: () => void;
  duration?: number;
};

export default function Toast({ message, type = "success", onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const icons = {
    success: <CheckCircle className="w-5 h-5 text-green-500" />,
    error: <XCircle className="w-5 h-5 text-red-500" />,
    info: <Info className="w-5 h-5 text-blue-500" />,
  };

  const colors = {
    success: "bg-green-50 dark:bg-green-900/95 border-green-300 dark:border-green-700",
    error: "bg-red-50 dark:bg-red-900/95 border-red-300 dark:border-red-700",
    info: "bg-blue-50 dark:bg-blue-900/95 border-blue-300 dark:border-blue-700",
  };

  const iconColors = {
    success: "text-green-600 dark:text-green-400",
    error: "text-red-600 dark:text-red-400",
    info: "text-blue-600 dark:text-blue-400",
  };

  const textColors = {
    success: "text-green-900 dark:text-green-50",
    error: "text-red-900 dark:text-red-50",
    info: "text-blue-900 dark:text-blue-50",
  };

  return (
    <div
      className={`fixed top-4 right-4 z-[10000] flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg backdrop-blur-sm animate-in slide-in-from-top-5 ${colors[type]}`}
    >
      <div className={iconColors[type]}>{icons[type]}</div>
      <p className={`text-sm font-medium ${textColors[type]}`}>{message}</p>
      <button
        onClick={onClose}
        className="ml-2 p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded"
      >
        <X className="w-4 h-4 text-gray-600 dark:text-gray-400" />
      </button>
    </div>
  );
}
