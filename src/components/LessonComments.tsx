"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { supabaseClient } from "@/lib/supabase-client";
import { MessageSquare, Loader2, AlertCircle } from "lucide-react";
import CommentItem from "./CommentItem";
import RichTextEditor from "./RichTextEditor";

type Comment = {
  id: string;
  user_id: string;
  user_name: string;
  user_avatar: string | null;
  parent_id: string | null;
  content: string;
  raw_content: string;
  is_edited: boolean;
  upvotes: number;
  downvotes: number;
  is_pinned: boolean;
  is_solution: boolean;
  created_at: string;
  updated_at: string;
  user_vote: "upvote" | "downvote" | null;
  reply_count: number;
  replies?: Comment[];
};

type LessonCommentsProps = {
  courseId: string;
  week: string;
  lessonSlug: string;
};

export default function LessonComments({
  courseId,
  week,
  lessonSlug,
}: LessonCommentsProps) {
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newCommentContent, setNewCommentContent] = useState("");
  const [newCommentRawContent, setNewCommentRawContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "top">("top");

  useEffect(() => {
    fetchComments();
  }, [courseId, week, lessonSlug]);

  const fetchComments = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all comments for this lesson
      const { data, error: fetchError } = await supabaseClient
        .from("lesson_comments")
        .select(
          `
          id,
          user_id,
          parent_id,
          content,
          raw_content,
          is_edited,
          upvotes,
          downvotes,
          is_pinned,
          is_solution,
          created_at,
          updated_at,
          user_profiles (
            full_name,
            avatar_url
          )
        `
        )
        .eq("course_id", courseId)
        .eq("week", week)
        .eq("lesson_slug", lessonSlug)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;

      if (data) {
        // Fetch user votes if authenticated
        let userVotes: { [key: string]: "upvote" | "downvote" } = {};
        if (user) {
          const commentIds = data.map((c: any) => c.id);
          const { data: votesData } = await supabaseClient
            .from("comment_votes")
            .select("comment_id, vote_type")
            .eq("user_id", user.id)
            .in("comment_id", commentIds);

          if (votesData) {
            userVotes = votesData.reduce((acc: any, vote: any) => {
              acc[vote.comment_id] = vote.vote_type;
              return acc;
            }, {});
          }
        }

        // Transform data and build nested structure
        const commentsMap = new Map<string, Comment>();
        const rootComments: Comment[] = [];

        // First pass: create comment objects
        data.forEach((comment: any) => {
          const profile = comment.user_profiles;
          const commentObj: Comment = {
            id: comment.id,
            user_id: comment.user_id,
            user_name: profile?.full_name || "User",
            user_avatar: profile?.avatar_url || null,
            parent_id: comment.parent_id,
            content: comment.content,
            raw_content: comment.raw_content,
            is_edited: comment.is_edited,
            upvotes: comment.upvotes,
            downvotes: comment.downvotes,
            is_pinned: comment.is_pinned,
            is_solution: comment.is_solution,
            created_at: comment.created_at,
            updated_at: comment.updated_at,
            user_vote: userVotes[comment.id] || null,
            reply_count: 0,
            replies: [],
          };
          commentsMap.set(comment.id, commentObj);
        });

        // Second pass: build tree structure
        commentsMap.forEach((comment) => {
          if (comment.parent_id) {
            const parent = commentsMap.get(comment.parent_id);
            if (parent) {
              parent.replies = parent.replies || [];
              parent.replies.push(comment);
              parent.reply_count = parent.replies.length;
            }
          } else {
            rootComments.push(comment);
          }
        });

        // Sort comments based on selected sort option
        const sortedComments = sortComments(rootComments, sortBy);
        setComments(sortedComments);
      }
    } catch (err: any) {
      console.error("Error fetching comments:", err);
      setError(err.message || "Failed to load comments");
    } finally {
      setLoading(false);
    }
  };

  const sortComments = (comments: Comment[], sortType: "newest" | "oldest" | "top"): Comment[] => {
    const sorted = [...comments];

    // Sort recursively
    const sortRecursive = (items: Comment[]) => {
      items.forEach((item) => {
        if (item.replies && item.replies.length > 0) {
          sortRecursive(item.replies);
        }
      });

      items.sort((a, b) => {
        // Pinned comments always first
        if (a.is_pinned !== b.is_pinned) {
          return a.is_pinned ? -1 : 1;
        }

        switch (sortType) {
          case "top":
            const scoreA = a.upvotes - a.downvotes;
            const scoreB = b.upvotes - b.downvotes;
            return scoreB - scoreA;
          case "oldest":
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          case "newest":
          default:
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
      });
    };

    sortRecursive(sorted);
    return sorted;
  };

  const handleSubmitComment = async () => {
    if (!user) {
      openAuthModal();
      return;
    }

    if (!newCommentRawContent.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const { data, error: insertError } = await supabaseClient
        .from("lesson_comments")
        .insert({
          user_id: user.id,
          course_id: courseId,
          week,
          lesson_slug: lessonSlug,
          content: newCommentContent,
          raw_content: newCommentRawContent,
          parent_id: null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Reset form
      setNewCommentContent("");
      setNewCommentRawContent("");
      
      // Clear the editor DOM
      const editorElement = document.querySelector('[contenteditable="true"]');
      if (editorElement) {
        editorElement.innerHTML = "";
      }

      // Refresh comments
      await fetchComments();
    } catch (err: any) {
      console.error("Error posting comment:", err);
      alert("Failed to post comment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReply = async (parentId: string, content: string, rawContent: string) => {
    if (!user) {
      openAuthModal();
      return;
    }

    const { error: insertError } = await supabaseClient
      .from("lesson_comments")
      .insert({
        user_id: user.id,
        course_id: courseId,
        week,
        lesson_slug: lessonSlug,
        content,
        raw_content: rawContent,
        parent_id: parentId,
      });

    if (insertError) throw insertError;

    // Refresh comments
    await fetchComments();
  };

  const handleEdit = async (commentId: string, content: string, rawContent: string) => {
    if (!user) return;

    const { error: updateError } = await supabaseClient
      .from("lesson_comments")
      .update({
        content,
        raw_content: rawContent,
        is_edited: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", commentId)
      .eq("user_id", user.id);

    if (updateError) throw updateError;

    // Refresh comments
    await fetchComments();
  };

  const handleDelete = async (commentId: string) => {
    if (!user) return;

    const { error: deleteError } = await supabaseClient
      .from("lesson_comments")
      .delete()
      .eq("id", commentId)
      .eq("user_id", user.id);

    if (deleteError) throw deleteError;

    // Refresh comments
    await fetchComments();
  };

  const handleVote = async (commentId: string, voteType: "upvote" | "downvote") => {
    if (!user) {
      openAuthModal();
      return;
    }

    // Check if user already voted
    const { data: existingVote } = await supabaseClient
      .from("comment_votes")
      .select("*")
      .eq("user_id", user.id)
      .eq("comment_id", commentId)
      .maybeSingle();

    if (existingVote) {
      if (existingVote.vote_type === voteType) {
        // Remove vote
        await supabaseClient
          .from("comment_votes")
          .delete()
          .eq("user_id", user.id)
          .eq("comment_id", commentId);
      } else {
        // Change vote
        await supabaseClient
          .from("comment_votes")
          .update({ vote_type: voteType })
          .eq("user_id", user.id)
          .eq("comment_id", commentId);
      }
    } else {
      // Add new vote
      await supabaseClient.from("comment_votes").insert({
        user_id: user.id,
        comment_id: commentId,
        vote_type: voteType,
      });
    }

    // Refresh to get updated vote counts
    await fetchComments();
  };

  useEffect(() => {
    const sortedComments = sortComments(comments, sortBy);
    setComments(sortedComments);
  }, [sortBy]);

  return (
    <div className="mt-12 pt-8 border-t border-black/10 dark:border-white/10">
      {/* Public visibility notice */}
      <div className="mb-6 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
        <p className="text-sm text-blue-700 dark:text-blue-400">
          💬 <strong>Public Discussion:</strong> Comments are visible to all users. Please be respectful and mindful of what you share.
        </p>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-blue-500" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Discussion ({comments.length})
          </h2>
        </div>

        {/* Sort options */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 dark:text-white/60">Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "newest" | "oldest" | "top")}
            className="text-sm bg-white dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-lg px-3 py-1.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="top">Top</option>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
        </div>
      </div>

      {/* New comment form */}
      <div className="mb-8">
        {user ? (
          <div>
            <RichTextEditor
              value={newCommentContent}
              onChange={(html, text) => {
                setNewCommentContent(html);
                setNewCommentRawContent(text);
              }}
              placeholder="Share your thoughts, ask questions, or help others learn..."
              minHeight="120px"
            />
            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-gray-500 dark:text-white/50">
                You can format your comment with bold, italic, code blocks, and more.
              </p>
              <button
                onClick={handleSubmitComment}
                disabled={isSubmitting || !newCommentRawContent.trim()}
                className="px-6 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all shadow-md hover:shadow-lg disabled:shadow-none"
              >
                {isSubmitting ? "Posting..." : "Post Comment"}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 bg-black/5 dark:bg-white/5 rounded-lg border border-black/10 dark:border-white/10">
            <MessageSquare className="w-12 h-12 text-gray-400 dark:text-white/40 mx-auto mb-3" />
            <p className="text-gray-600 dark:text-white/60 mb-4">
              Sign in to join the discussion
            </p>
            <button
              onClick={openAuthModal}
              className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
            >
              Sign In
            </button>
          </div>
        )}
      </div>

      {/* Comments list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-600 dark:text-red-400">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      ) : comments.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-white/50">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No comments yet. Be the first to share your thoughts!</p>
        </div>
      ) : (
        <div className="space-y-1">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              onReply={handleReply}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onVote={handleVote}
            />
          ))}
        </div>
      )}
    </div>
  );
}
