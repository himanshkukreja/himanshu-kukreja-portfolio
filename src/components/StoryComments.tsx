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

type StoryCommentsProps = {
  storySlug: string;
};

export default function StoryComments({ storySlug }: StoryCommentsProps) {
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
  }, [storySlug, sortBy]);

  const fetchComments = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all comments for this story (including replies)
      const { data, error: fetchError } = await supabaseClient
        .from("story_comments")
        .select("*")
        .eq("story_slug", storySlug);

      if (fetchError) throw fetchError;

      if (data) {
        // Get comment IDs for vote fetching
        const commentIds = data.map((c: any) => c.id);

        // Fetch user votes if logged in
        let userVotes: Record<string, "upvote" | "downvote"> = {};
        if (user && commentIds.length > 0) {
          const { data: votesData } = await supabaseClient
            .from("story_comment_votes")
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
          const commentObj: Comment = {
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
    } catch (err) {
      console.error("Error fetching comments:", err);
      setError("Failed to load comments. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  const sortComments = (
    comments: Comment[],
    sortType: "newest" | "oldest" | "top"
  ): Comment[] => {
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

        // Then by selected sort option
        if (sortType === "newest") {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        } else if (sortType === "oldest") {
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        } else if (sortType === "top") {
          const netA = a.upvotes - a.downvotes;
          const netB = b.upvotes - b.downvotes;
          return netB - netA;
        }
        return 0;
      });
    };

    sortRecursive(sorted);
    return sorted;
  };

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

      const { data, error } = await supabaseClient
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
      alert("Failed to post comment. Please try again.");
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

  return (
    <div id="discussion-section" className="mt-16 pt-8 border-t border-black/10 dark:border-white/10">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6" />
          Discussion ({comments.length})
        </h2>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs sm:text-sm text-gray-500 dark:text-white/60">Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="px-2 sm:px-3 py-1 bg-black/5 dark:bg-white/5 rounded text-xs sm:text-sm text-gray-900 dark:text-white border border-black/10 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/50 flex-1 sm:flex-none"
          >
            <option value="top">Top</option>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
        </div>
      </div>

      {/* Post New Comment */}
      <div className="mb-8">
        {!user ? (
          <div className="p-6 bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 dark:border-blue-400/20 rounded-lg text-center">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 text-blue-500 dark:text-blue-400 opacity-75" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Join the Discussion!
            </h3>
            <p className="text-gray-600 dark:text-white/70 mb-4">
              Sign in to share your thoughts and engage with the community.
            </p>
            <button
              onClick={() => openAuthModal()}
              className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-all shadow-md hover:shadow-lg"
            >
              Sign In to Comment
            </button>
          </div>
        ) : (
          <>
            <RichTextEditor
              value={newCommentContent}
              onChange={(html, raw) => {
                setNewCommentContent(html);
                setNewCommentRawContent(raw);
              }}
              placeholder="Share your thoughts on this story..."
            />
            <div className="flex items-center justify-end gap-3 mt-3">
              <button
                onClick={handlePostComment}
                disabled={!newCommentContent.trim() || isSubmitting}
                className="px-4 sm:px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm sm:text-base w-full sm:w-auto"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Posting...
                  </span>
                ) : (
                  "Post Comment"
                )}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Comments List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      ) : comments.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-white/60">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No comments yet. Be the first to share your thoughts!</p>
        </div>
      ) : (
        <div className="space-y-6">
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
    </div>
  );
}
