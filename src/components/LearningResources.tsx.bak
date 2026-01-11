import Link from "next/link";
import { BookOpen, ArrowRight, GraduationCap, Sparkles } from "lucide-react";

export default function LearningResources() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="relative group">
        {/* Gradient Background Card */}
        <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>

        {/* Main Card */}
        <div className="relative bg-gray-900/90 backdrop-blur-sm rounded-2xl p-8 sm:p-12 border border-white/10">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
            {/* Icon */}
            <div className="flex-shrink-0">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl blur-xl opacity-50"></div>
                <div className="relative bg-gradient-to-r from-blue-500 to-purple-600 p-4 rounded-2xl">
                  <GraduationCap className="w-8 h-8 text-white" />
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-2xl sm:text-3xl font-bold text-white">
                  System Design Mastery
                </h3>
                <Sparkles className="w-5 h-5 text-yellow-400 animate-pulse" />
              </div>
              <p className="text-white/70 text-base sm:text-lg mb-6">
                A comprehensive, structured learning path for mastering system design concepts.
                From foundations to advanced distributed systems—everything you need in one place.
              </p>

              {/* Features */}
              <div className="grid sm:grid-cols-3 gap-4 mb-6">
                <div className="flex items-center gap-2 text-white/60 text-sm">
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
                  <span>Week-by-week curriculum</span>
                </div>
                <div className="flex items-center gap-2 text-white/60 text-sm">
                  <div className="w-1.5 h-1.5 bg-purple-400 rounded-full"></div>
                  <span>Hands-on capstones</span>
                </div>
                <div className="flex items-center gap-2 text-white/60 text-sm">
                  <div className="w-1.5 h-1.5 bg-pink-400 rounded-full"></div>
                  <span>Real-world scenarios</span>
                </div>
              </div>

              {/* CTA Button */}
              <Link
                href="/learn/system-design-mastery"
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium rounded-lg transition-all shadow-lg shadow-blue-500/50 hover:shadow-xl hover:shadow-blue-500/60 group/btn"
              >
                <BookOpen className="w-5 h-5" />
                <span>Start Learning</span>
                <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
