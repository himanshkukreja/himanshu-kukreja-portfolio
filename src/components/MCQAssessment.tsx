"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { CheckCircle, XCircle, Clock, Award, ChevronLeft, ChevronRight, Play, RotateCcw } from "lucide-react";
import { MCQAssessment, MCQQuestion } from "@/lib/mcq-parser";

type MCQAttempt = {
  id: string;
  attemptNumber: number;
  status: 'in_progress' | 'completed';
  correctAnswers: number;
  incorrectAnswers: number;
  skippedAnswers: number;
  scorePercentage: number;
  passed: boolean | null;
  timeTaken: number | null;
  startedAt: string;
  completedAt: string | null;
};

type UserAnswer = {
  questionNumber: number;
  selectedOption: 'A' | 'B' | 'C' | 'D' | null;
  isCorrect: boolean | null;
  timeSpent: number;
};

type Props = {
  assessment: MCQAssessment;
  courseId: string;
  week: string;
  lessonSlug: string;
};

export default function MCQAssessmentComponent({
  assessment,
  courseId,
  week,
  lessonSlug,
}: Props) {
  const { user } = useAuth();
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, UserAnswer>>({});
  const [showResults, setShowResults] = useState(false);
  const [attemptData, setAttemptData] = useState<MCQAttempt | null>(null);
  const [previousAttempts, setPreviousAttempts] = useState<MCQAttempt[]>([]);
  const [loading, setLoading] = useState(false);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [questionStartTime, setQuestionStartTime] = useState<number>(Date.now());
  const [hasStarted, setHasStarted] = useState(false);

  // Flatten all questions from all sections
  const allQuestions = assessment.sections.flatMap(s => s.questions);

  // Load previous attempts on mount
  useEffect(() => {
    if (user) {
      loadPreviousAttempts();
    }
  }, [user]);

  const loadPreviousAttempts = async () => {
    if (!user) return;
    
    try {
      const response = await fetch(
        `/api/mcq/attempts?courseId=${courseId}&week=${week}&lessonSlug=${lessonSlug}`
      );
      if (response.ok) {
        const data = await response.json();
        setPreviousAttempts(data.attempts || []);
      }
    } catch (error) {
      console.error('Failed to load previous attempts:', error);
    }
  };

  const startAttempt = async () => {
    if (!user) {
      alert('Please sign in to attempt this assessment');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/mcq/attempt/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId,
          week,
          lessonSlug,
          title: assessment.title,
          totalQuestions: allQuestions.length,
          passingScore: assessment.passingScore,
        }),
      });

      if (!response.ok) throw new Error('Failed to start attempt');

      const data = await response.json();
      setAttemptId(data.attemptId);
      setHasStarted(true);
      setStartTime(Date.now());
      setQuestionStartTime(Date.now());
      setUserAnswers({});
      setShowResults(false);
    } catch (error) {
      console.error('Failed to start attempt:', error);
      alert('Failed to start assessment. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const selectAnswer = (option: 'A' | 'B' | 'C' | 'D') => {
    const question = allQuestions[currentQuestion];
    const timeSpent = Math.floor((Date.now() - questionStartTime) / 1000);
    const isCorrect = question.correctAnswer === option;

    setUserAnswers(prev => ({
      ...prev,
      [question.number]: {
        questionNumber: question.number,
        selectedOption: option,
        isCorrect,
        timeSpent,
      },
    }));
  };

  const goToNextQuestion = () => {
    if (currentQuestion < allQuestions.length - 1) {
      setCurrentQuestion(prev => prev + 1);
      setQuestionStartTime(Date.now());
    }
  };

  const goToPreviousQuestion = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(prev => prev - 1);
      setQuestionStartTime(Date.now());
    }
  };

  const goToQuestion = (index: number) => {
    setCurrentQuestion(index);
    setQuestionStartTime(Date.now());
  };

  const submitAttempt = async () => {
    if (!attemptId) return;
    
    const unanswered = allQuestions.filter(q => !userAnswers[q.number]);
    if (unanswered.length > 0) {
      const confirm = window.confirm(
        `You have ${unanswered.length} unanswered questions. Submit anyway?`
      );
      if (!confirm) return;
    }

    setLoading(true);
    try {
      // Submit all answers
      const answers = allQuestions.map(question => ({
        questionNumber: question.number,
        questionText: question.text,
        selectedOption: userAnswers[question.number]?.selectedOption || null,
        correctOption: question.correctAnswer,
        isCorrect: userAnswers[question.number]?.isCorrect || null,
        options: question.options.reduce((acc, opt) => {
          acc[opt.label] = opt.text;
          return acc;
        }, {} as Record<string, string>),
        timeSpent: userAnswers[question.number]?.timeSpent || 0,
      }));

      const response = await fetch('/api/mcq/attempt/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attemptId,
          answers,
        }),
      });

      if (!response.ok) throw new Error('Failed to submit attempt');

      const data = await response.json();
      setAttemptData(data.attempt);
      setShowResults(true);
      await loadPreviousAttempts();
    } catch (error) {
      console.error('Failed to submit attempt:', error);
      alert('Failed to submit assessment. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const resetAttempt = () => {
    setAttemptId(null);
    setCurrentQuestion(0);
    setUserAnswers({});
    setShowResults(false);
    setAttemptData(null);
    setHasStarted(false);
  };

  // Render start screen
  if (!hasStarted) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-xl p-8 border border-black/10 dark:border-white/10">
          <div className="text-center mb-8">
            <Award className="w-16 h-16 mx-auto mb-4 text-blue-400" />
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
              {assessment.title}
            </h2>
            {assessment.description && (
              <p className="text-gray-600 dark:text-white/70 mb-6">
                {assessment.description}
              </p>
            )}
          </div>

          <div className="grid gap-4 mb-8">
            <div className="flex items-center justify-between p-4 bg-black/5 dark:bg-white/5 rounded-lg">
              <span className="text-gray-600 dark:text-white/70">Total Questions</span>
              <span className="font-bold text-gray-900 dark:text-white">{allQuestions.length}</span>
            </div>
            {assessment.passingScore && (
              <div className="flex items-center justify-between p-4 bg-black/5 dark:bg-white/5 rounded-lg">
                <span className="text-gray-600 dark:text-white/70">Passing Score</span>
                <span className="font-bold text-gray-900 dark:text-white">{assessment.passingScore}%</span>
              </div>
            )}
            <div className="flex items-center justify-between p-4 bg-black/5 dark:bg-white/5 rounded-lg">
              <span className="text-gray-600 dark:text-white/70">Sections</span>
              <span className="font-bold text-gray-900 dark:text-white">{assessment.sections.length}</span>
            </div>
          </div>

          {/* Previous Attempts */}
          {previousAttempts.length > 0 && (
            <div className="mb-8">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Your Previous Attempts</h3>
              <div className="space-y-2">
                {previousAttempts.slice(0, 3).map((attempt) => (
                  <div
                    key={attempt.id}
                    className="flex items-center justify-between p-3 bg-black/5 dark:bg-white/5 rounded-lg text-sm"
                  >
                    <span className="text-gray-600 dark:text-white/70">
                      Attempt #{attempt.attemptNumber}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {attempt.scorePercentage}%
                      </span>
                      {attempt.passed !== null && (
                        <span className={`px-2 py-1 rounded ${
                          attempt.passed 
                            ? 'bg-green-500/20 text-green-400' 
                            : 'bg-red-500/20 text-red-400'
                        }`}>
                          {attempt.passed ? 'Passed' : 'Failed'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {user ? (
            <button
              onClick={startAttempt}
              disabled={loading}
              className="w-full px-6 py-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Play className="w-5 h-5" />
              {loading ? 'Starting...' : previousAttempts.length > 0 ? 'Start New Attempt' : 'Start Assessment'}
            </button>
          ) : (
            <div className="text-center">
              <p className="text-gray-600 dark:text-white/70 mb-4">
                Please sign in to attempt this assessment
              </p>
              <a
                href="/auth/signin"
                className="inline-block px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity"
              >
                Sign In
              </a>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Render results screen
  if (showResults && attemptData) {
    const percentage = attemptData.scorePercentage;
    const passed = attemptData.passed;

    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-xl p-8 border border-black/10 dark:border-white/10">
          <div className="text-center mb-8">
            {passed !== null && (
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full mb-4 ${
                passed 
                  ? 'bg-green-500/20 text-green-400' 
                  : 'bg-red-500/20 text-red-400'
              }`}>
                {passed ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                <span className="font-semibold">{passed ? 'Passed!' : 'Not Passed'}</span>
              </div>
            )}
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
              {percentage.toFixed(1)}%
            </h2>
            <p className="text-gray-600 dark:text-white/70">
              You got {attemptData.correctAnswers} out of {allQuestions.length} questions correct
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="text-center p-4 bg-green-500/10 rounded-lg border border-green-500/20">
              <div className="text-2xl font-bold text-green-400 mb-1">{attemptData.correctAnswers}</div>
              <div className="text-sm text-gray-600 dark:text-white/60">Correct</div>
            </div>
            <div className="text-center p-4 bg-red-500/10 rounded-lg border border-red-500/20">
              <div className="text-2xl font-bold text-red-400 mb-1">{attemptData.incorrectAnswers}</div>
              <div className="text-sm text-gray-600 dark:text-white/60">Incorrect</div>
            </div>
            <div className="text-center p-4 bg-gray-500/10 rounded-lg border border-gray-500/20">
              <div className="text-2xl font-bold text-gray-400 mb-1">{attemptData.skippedAnswers}</div>
              <div className="text-sm text-gray-600 dark:text-white/60">Skipped</div>
            </div>
          </div>

          {attemptData.timeTaken && (
            <div className="flex items-center justify-center gap-2 text-gray-600 dark:text-white/70 mb-8">
              <Clock className="w-5 h-5" />
              <span>Time taken: {Math.floor(attemptData.timeTaken / 60)}m {attemptData.timeTaken % 60}s</span>
            </div>
          )}

          {/* Question Review */}
          <div className="mb-8">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Review Your Answers</h3>
            <div className="grid grid-cols-10 gap-2">
              {allQuestions.map((question, index) => {
                const answer = userAnswers[question.number];
                return (
                  <button
                    key={question.number}
                    onClick={() => goToQuestion(index)}
                    className={`aspect-square rounded-lg font-medium text-sm transition-all ${
                      !answer
                        ? 'bg-gray-500/20 text-gray-400'
                        : answer.isCorrect
                        ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                        : 'bg-red-500/20 text-red-400 border border-red-500/50'
                    }`}
                  >
                    {question.number}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={resetAttempt}
              className="flex-1 px-6 py-3 bg-black/10 dark:bg-white/10 text-gray-900 dark:text-white font-semibold rounded-lg hover:bg-black/20 dark:hover:bg-white/20 transition-all flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-5 h-5" />
              Try Again
            </button>
          </div>
        </div>

        {/* Detailed Review */}
        <div className="mt-8 space-y-6">
          {allQuestions.map((question, index) => {
            const answer = userAnswers[question.number];
            return (
              <div
                key={question.number}
                className={`p-6 rounded-lg border ${
                  !answer
                    ? 'bg-gray-500/5 border-gray-500/20'
                    : answer.isCorrect
                    ? 'bg-green-500/5 border-green-500/20'
                    : 'bg-red-500/5 border-red-500/20'
                }`}
              >
                <div className="flex items-start gap-4 mb-4">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center font-bold text-sm">
                    {question.number}
                  </span>
                  <h4 className="flex-1 font-medium text-gray-900 dark:text-white">
                    {question.text}
                  </h4>
                </div>
                <div className="space-y-2 ml-12">
                  {question.options.map((option) => {
                    const isSelected = answer?.selectedOption === option.label;
                    const isCorrect = question.correctAnswer === option.label;
                    
                    return (
                      <div
                        key={option.label}
                        className={`p-3 rounded-lg ${
                          isCorrect
                            ? 'bg-green-500/20 border border-green-500/50'
                            : isSelected
                            ? 'bg-red-500/20 border border-red-500/50'
                            : 'bg-black/5 dark:bg-white/5'
                        }`}
                      >
                        <span className="font-semibold">{option.label})</span> {option.text}
                        {isCorrect && <span className="ml-2 text-green-400">(Correct Answer)</span>}
                        {isSelected && !isCorrect && <span className="ml-2 text-red-400">(Your Answer)</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Render quiz interface
  const question = allQuestions[currentQuestion];
  const selectedAnswer = userAnswers[question.number]?.selectedOption;
  const progress = ((currentQuestion + 1) / allQuestions.length) * 100;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600 dark:text-white/70">
            Question {currentQuestion + 1} of {allQuestions.length}
          </span>
          <span className="text-sm text-gray-600 dark:text-white/70">
            {Object.keys(userAnswers).length} answered
          </span>
        </div>
        <div className="h-2 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question Card */}
      <div className="bg-black/5 dark:bg-white/5 rounded-xl p-8 border border-black/10 dark:border-white/10 mb-6">
        {question.section && (
          <div className="text-sm text-blue-400 font-medium mb-4">
            {question.section}
          </div>
        )}
        
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
          {question.text}
        </h3>

        <div className="space-y-3">
          {question.options.map((option) => (
            <button
              key={option.label}
              onClick={() => selectAnswer(option.label)}
              className={`w-full text-left p-4 rounded-lg transition-all ${
                selectedAnswer === option.label
                  ? 'bg-blue-500/20 border-2 border-blue-500'
                  : 'bg-black/10 dark:bg-white/10 border-2 border-transparent hover:border-black/20 dark:hover:border-white/20'
              }`}
            >
              <span className="font-semibold text-gray-900 dark:text-white">{option.label})</span>{' '}
              <span className="text-gray-700 dark:text-white/80">{option.text}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={goToPreviousQuestion}
          disabled={currentQuestion === 0}
          className="px-6 py-3 bg-black/10 dark:bg-white/10 text-gray-900 dark:text-white font-medium rounded-lg hover:bg-black/20 dark:hover:bg-white/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <ChevronLeft className="w-5 h-5" />
          Previous
        </button>

        <div className="flex-1 flex justify-center">
          {currentQuestion === allQuestions.length - 1 && (
            <button
              onClick={submitAttempt}
              disabled={loading}
              className="px-8 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? 'Submitting...' : 'Submit Assessment'}
            </button>
          )}
        </div>

        <button
          onClick={goToNextQuestion}
          disabled={currentQuestion === allQuestions.length - 1}
          className="px-6 py-3 bg-black/10 dark:bg-white/10 text-gray-900 dark:text-white font-medium rounded-lg hover:bg-black/20 dark:hover:bg-white/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
        >
          Next
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Question Grid */}
      <div className="mt-8 p-6 bg-black/5 dark:bg-white/5 rounded-lg border border-black/10 dark:border-white/10">
        <h4 className="font-semibold text-gray-900 dark:text-white mb-4">Quick Navigation</h4>
        <div className="grid grid-cols-10 gap-2">
          {allQuestions.map((q, index) => {
            const isAnswered = !!userAnswers[q.number];
            const isCurrent = index === currentQuestion;
            
            return (
              <button
                key={q.number}
                onClick={() => goToQuestion(index)}
                className={`aspect-square rounded-lg font-medium text-sm transition-all ${
                  isCurrent
                    ? 'bg-blue-500 text-white scale-110'
                    : isAnswered
                    ? 'bg-green-500/30 text-green-400 border border-green-500/50'
                    : 'bg-black/10 dark:bg-white/10 text-gray-600 dark:text-white/60'
                }`}
              >
                {q.number}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
