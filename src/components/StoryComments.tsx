"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { supabaseClient } from "@/lib/supabase-client";
import { Loader2 } from "lucide-react";
import CommentItem from "./CommentItem";
import RichTextEditor from "./RichTextEditor";
import styles from "./stories/reader.module.css";

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

type CommentRow = {
  id: string;
  user_id: string;
  user_name: string | null;
  user_avatar: string | null;
  parent_id: string | null;
  content: string;
  raw_content: string;
  is_edited: boolean;
  upvotes: number;
  downvotes: number;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
};

type VoteRow = { comment_id: string; vote_type: "upvote" | "downvote" };

type SortBy = "newest" | "oldest" | "top";

type StoryCommentsProps = {
  storySlug: string;
};

function sortComments(comments: Comment[], sortType: SortBy): Comment[] {
  const sortRecursive = (items: Comment[]): Comment[] =>
    items
      .map((item) => (item.replies && item.replies.length > 0 ? { ...item, replies: sortRecursive(item.replies) } : item))
      .sort((a, b) => {
        // Pinned comments always first
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
        if (sortType === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        if (sortType === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        return b.upvotes - b.downvotes - (a.upvotes - a.downvotes);
      });
  return sortRecursive(comments);
}

const SORTS: { id: SortBy; label: string }[] = [
  { id: "top", label: "Top" },
  { id: "newest", label: "Newest" },
  { id: "oldest", label: "Oldest" },
];

export default function StoryComments({ storySlug }: StoryCommentsProps) {
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [roots, setRoots] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);
  const [newCommentContent, setNewCommentContent] = useState("");
  const [newCommentRawContent, setNewCommentRawContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>("top");
  const userId = user?.id;

  const fetchComments = useCallback(async () => {
    try {
      // Fetch all comments for this story (including replies)
      const { data, error: fetchError } = await supabaseClient
        .from("story_comments")
        .select("*")
        .eq("story_slug", storySlug);

      if (fetchError) throw fetchError;

      const rows = (data || []) as CommentRow[];
      const commentIds = rows.map((c) => c.id);

      // Fetch user votes if logged in
      let userVotes: Record<string, "upvote" | "downvote"> = {};
      if (userId && commentIds.length > 0) {
        const { data: votesData } = await supabaseClient
          .from("story_comment_votes")
          .select("comment_id, vote_type")
          .eq("user_id", userId)
          .in("comment_id", commentIds);

        if (votesData) {
          userVotes = (votesData as VoteRow[]).reduce<Record<string, "upvote" | "downvote">>((acc, vote) => {
            acc[vote.comment_id] = vote.vote_type;
            return acc;
          }, {});
        }
      }

      // Build the nested structure
      const commentsMap = new Map<string, Comment>();
      const rootComments: Comment[] = [];

      rows.forEach((comment) => {
        commentsMap.set(comment.id, {
          id: comment.id,
          user_id: comment.user_id,
          user_name: comment.user_name || "User",
          user_avatar: comment.user_avatar || null,
          parent_id: comment.parent_id,
          content: comment.content,
          raw_content: comment.raw_content,
          is_edited: comment.is_edited,
          upvotes: comment.upvotes,
          downvotes: comment.downvotes,
          is_pinned: comment.is_pinned,
          is_solution: false,
          created_at: comment.created_at,
          updated_at: comment.updated_at,
          user_vote: userVotes[comment.id] || null,
          reply_count: 0,
          replies: [],
        });
      });

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

      setRoots(rootComments);
      setError(null);
    } catch (err) {
      console.error("Error fetching comments:", err);
      setError("Failed to load comments. Please try again later.");
    } finally {
      setLoading(false);
    }
  }, [storySlug, userId]);

  useEffect(() => {
    void fetchComments();
  }, [fetchComments]);

  const comments = useMemo(() => sortComments(roots, sortBy), [roots, sortBy]);

  const handlePostComment = async () => {
    if (!user) {
      openAuthModal();
      return;
    }

    if (!newCommentContent.trim()) {
      return;
    }

    try {
      setIsSubmitting(true);
      setPostError(null);

      const { error } = await supabaseClient
        .from("story_comments")
        .insert({
          story_slug: storySlug,
          user_id: user.id,
          user_name: user.user_metadata?.full_name || user.email || "Anonymous",
          user_avatar: user.user_metadata?.avatar_url || null,
          content: newCommentContent,
          raw_content: newCommentRawContent,
          parent_id: null,
        })
        .select()
        .single();

      if (error) throw error;

      setNewCommentContent("");
      setNewCommentRawContent("");
      await fetchComments();
    } catch (err) {
      console.error("Error posting comment:", err);
      setPostError("Failed to post comment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVote = async (
    commentId: string,
    voteType: "upvote" | "downvote"
  ) => {
    if (!user) {
      openAuthModal();
      return;
    }

    try {
      // Check existing vote
      const { data: existingVote } = await supabaseClient
        .from("story_comment_votes")
        .select("vote_type")
        .eq("comment_id", commentId)
        .eq("user_id", user.id)
        .single();

      if (existingVote) {
        // If same vote, remove it
        if (existingVote.vote_type === voteType) {
          await supabaseClient
            .from("story_comment_votes")
            .delete()
            .eq("comment_id", commentId)
            .eq("user_id", user.id);
        } else {
          // If different vote, update it
          await supabaseClient
            .from("story_comment_votes")
            .update({ vote_type: voteType })
            .eq("comment_id", commentId)
            .eq("user_id", user.id);
        }
      } else {
        // No existing vote, insert new one
        await supabaseClient.from("story_comment_votes").insert({
          comment_id: commentId,
          user_id: user.id,
          vote_type: voteType,
        });
      }

      // Recalculate votes
      const { data: votes } = await supabaseClient
        .from("story_comment_votes")
        .select("vote_type")
        .eq("comment_id", commentId);

      const upvotes = votes?.filter((v) => v.vote_type === "upvote").length || 0;
      const downvotes = votes?.filter((v) => v.vote_type === "downvote").length || 0;

      await supabaseClient
        .from("story_comments")
        .update({ upvotes, downvotes })
        .eq("id", commentId);

      await fetchComments();
    } catch (err) {
      console.error("Error voting:", err);
    }
  };

  const handleReply = async (
    parentId: string,
    content: string,
    rawContent: string
  ) => {
    if (!user) {
      openAuthModal();
      return;
    }

    try {
      const { error } = await supabaseClient.from("story_comments").insert({
        story_slug: storySlug,
        user_id: user.id,
        user_name: user.user_metadata?.full_name || user.email || "Anonymous",
        user_avatar: user.user_metadata?.avatar_url || null,
        content,
        raw_content: rawContent,
        parent_id: parentId,
      });

      if (error) throw error;

      await fetchComments();
    } catch (err) {
      console.error("Error posting reply:", err);
      throw err;
    }
  };

  const handleEdit = async (commentId: string, newContent: string, newRawContent: string) => {
    if (!user) return;

    try {
      const { error } = await supabaseClient
        .from("story_comments")
        .update({
          content: newContent,
          raw_content: newRawContent,
          is_edited: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", commentId)
        .eq("user_id", user.id);

      if (error) throw error;

      await fetchComments();
    } catch (err) {
      console.error("Error editing comment:", err);
      throw err;
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!user) return;

    try {
      // Delete all replies first
      await supabaseClient
        .from("story_comments")
        .delete()
        .eq("parent_id", commentId);

      // Delete the comment
      const { error } = await supabaseClient
        .from("story_comments")
        .delete()
        .eq("id", commentId)
        .eq("user_id", user.id);

      if (error) throw error;

      await fetchComments();
    } catch (err) {
      console.error("Error deleting comment:", err);
      throw err;
    }
  };

  const total = comments.reduce((n, c) => n + 1 + (c.reply_count || 0), 0);

  return (
    <section
      id="discussion-section"
      aria-labelledby="disc-h"
      className={`flex scroll-mt-[calc(var(--reader-top,120px)_+_16px)] flex-col gap-4 border-t border-line pt-6 ${styles.comments}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="disc-h" className="m-0 font-display text-[26px] font-bold">
          Discussion <span className="font-mono text-base font-normal text-fg-3">{loading ? "" : `(${total})`}</span>
        </h2>
        <div role="group" aria-label="Sort comments" className="flex gap-1">
          {SORTS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSortBy(s.id)}
              aria-pressed={sortBy === s.id}
              className={`min-h-11 border px-3 font-mono text-xs ${
                sortBy === s.id ? "border-fg bg-fg text-bg" : "border-line-strong bg-transparent text-fg-3 hover:text-fg"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Post New Comment */}
      {!user ? (
        <div className="flex flex-col gap-3">
          <span className="text-[13px] text-fg-3">Add to the post-mortem</span>
          <button
            type="button"
            onClick={() => openAuthModal()}
            className="min-h-[84px] border border-line-strong bg-surface px-3.5 py-3 text-left text-base text-fg-4 hover:border-fg-3"
          >
            What would you have done differently? Sign in to post.
          </button>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => openAuthModal()}
              className="min-h-11 bg-fg px-[18px] text-sm font-semibold text-bg hover:opacity-90"
            >
              Sign in to comment
            </button>
            {!loading && !error && comments.length === 0 && (
              <span className="text-[13px] text-fg-3">No comments yet. Be the first on the record.</span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <span className="text-[13px] text-fg-3">Add to the post-mortem</span>
          <RichTextEditor
            value={newCommentContent}
            onChange={(html, raw) => {
              setNewCommentContent(html);
              setNewCommentRawContent(raw);
            }}
            placeholder="What would you have done differently?"
          />
          <div className="flex flex-wrap items-center justify-end gap-3">
            {postError && (
              <span role="alert" className="text-[13px] text-bad-text">
                {postError}
              </span>
            )}
            <button
              type="button"
              onClick={handlePostComment}
              disabled={!newCommentContent.trim() || isSubmitting}
              className="min-h-11 w-full bg-signal px-[18px] text-sm font-semibold text-on-signal hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Posting…
                </span>
              ) : (
                "Post comment"
              )}
            </button>
          </div>
        </div>
      )}

      {/* Comments List */}
      {loading ? (
        <div className="flex items-center gap-2 py-8 font-mono text-xs text-fg-3" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> loading the record…
        </div>
      ) : error ? (
        <div role="alert" className="border border-bad p-4 text-sm text-bad-text">
          {error}
        </div>
      ) : comments.length === 0 ? (
        user ? <p className="m-0 text-[13px] text-fg-3">No comments yet. Be the first on the record.</p> : null
      ) : (
        <div className="flex flex-col gap-4">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              onVote={handleVote}
              onReply={handleReply}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </section>
  );
}
