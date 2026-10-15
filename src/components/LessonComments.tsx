"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { supabaseClient } from "@/lib/supabase-client";
import { InlineLoader } from "@/components/ui/loader";
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
  const [postError, setPostError] = useState<string | null>(null);

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
        // Counts come from the votes (public rows), not lesson_comments.upvotes/downvotes: the
        // trigger that maintains those runs as the voter, and RLS stops it updating anyone else's
        // comment, so they never moved (fixed in 20261015_learn_backend_fixes.sql).
        const userVotes: { [key: string]: "upvote" | "downvote" } = {};
        const counts = new Map<string, { up: number; down: number }>();
        let votesOk = false;
        const commentIds = data.map((c: any) => c.id);
        if (commentIds.length > 0) {
          const { data: votesData, error: votesError } = await supabaseClient
            .from("comment_votes")
            .select("comment_id, vote_type, user_id")
            .in("comment_id", commentIds);
          votesOk = !votesError && !!votesData;
          (votesData || []).forEach((vote: { comment_id: string; vote_type: "upvote" | "downvote"; user_id: string }) => {
            const c = counts.get(vote.comment_id) || { up: 0, down: 0 };
            if (vote.vote_type === "upvote") c.up++;
            else c.down++;
            counts.set(vote.comment_id, c);
            if (user && vote.user_id === user.id) userVotes[vote.comment_id] = vote.vote_type;
          });
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
            upvotes: votesOk ? counts.get(comment.id)?.up ?? 0 : comment.upvotes,
            downvotes: votesOk ? counts.get(comment.id)?.down ?? 0 : comment.downvotes,
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
      const { error: insertError } = await supabaseClient
        .from("lesson_comments")
        .insert({
          user_id: user.id,
          course_id: courseId,
          week,
          lesson_slug: lessonSlug,
          content: newCommentContent,
          raw_content: newCommentRawContent,
          parent_id: null,
        });

      if (insertError) throw insertError;

      // Reset form (the editor clears itself when its value goes back to "")
      setNewCommentContent("");
      setNewCommentRawContent("");
      setPostError(null);

      // Refresh comments
      await fetchComments();
    } catch (err: any) {
      console.error("Error posting comment:", err);
      setPostError("Your comment didn't post. Try again.");
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

  const total = comments.reduce(function count(n: number, c: Comment): number {
    return n + 1 + (c.replies ?? []).reduce(count, 0);
  }, 0);

  return (
    <section aria-labelledby="discussion-h" className="mt-12 flex flex-col gap-4 border-t border-line pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 id="discussion-h" className="m-0 font-display text-[26px] font-bold tracking-[-0.02em]">
          Discussion · {loading ? "…" : total}
        </h2>
        <label className="flex items-center gap-2 font-mono text-xs text-fg-3">
          sort
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "newest" | "oldest" | "top")}
            className="min-h-10 border border-line-strong bg-bg px-2 text-sm text-fg"
          >
            <option value="top">top</option>
            <option value="newest">newest</option>
            <option value="oldest">oldest</option>
          </select>
        </label>
      </div>
      <p className="m-0 text-[13px] text-fg-3">Public: everyone reading this lesson sees comments. Be kind and keep it on the material.</p>

      {user ? (
        <div className="flex flex-col gap-2">
          <span className="text-[13px] text-fg-3">Add to the discussion</span>
          <RichTextEditor
            value={newCommentContent}
            onChange={(html, text) => {
              setNewCommentContent(html);
              setNewCommentRawContent(text);
            }}
            placeholder="Ask about this lesson, or answer someone…"
            minHeight="110px"
          />
          <div className="flex flex-wrap items-center justify-end gap-3">
            {postError && (
              <span role="alert" className="text-[13px] text-bad-text">
                {postError}
              </span>
            )}
            <button
              type="button"
              onClick={handleSubmitComment}
              disabled={isSubmitting || !newCommentRawContent.trim()}
              className="min-h-11 w-full bg-fg px-5 text-sm font-semibold text-bg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {isSubmitting ? "Posting…" : "Post"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 border border-dashed border-line-strong px-4 py-4">
          <span className="min-w-0 flex-[1_1_240px] text-sm text-fg-2">Sign in to ask a question or answer one. Reading stays open to everyone.</span>
          <button type="button" onClick={openAuthModal} className="min-h-11 bg-fg px-4 text-sm font-semibold text-bg hover:opacity-90">
            Sign in to comment
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-6">
          <InlineLoader label="loading the discussion" />
        </div>
      ) : error ? (
        <div role="alert" className="border border-bad p-4 text-sm text-bad-text">
          {error}
        </div>
      ) : comments.length === 0 ? (
        <p className="m-0 py-4 text-sm text-fg-3">No comments yet. Start the thread.</p>
      ) : (
        <div className="flex flex-col divide-y divide-line border-y border-line">
          {comments.map((comment) => (
            <CommentItem key={comment.id} comment={comment} onReply={handleReply} onEdit={handleEdit} onDelete={handleDelete} onVote={handleVote} />
          ))}
        </div>
      )}
    </section>
  );
}
