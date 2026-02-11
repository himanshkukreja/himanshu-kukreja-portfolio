"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import {
  ThumbsUp,
  ThumbsDown,
  Reply,
  MoreVertical,
  Edit,
  Trash2,
  Flag,
  CheckCircle,
  Pin,
  ChevronDown,
  ChevronUp,
  Share2,
  Check,
} from "lucide-react";
import RichTextEditor from "./RichTextEditor";
import { formatDistanceToNow } from "@/lib/date-utils";
import ConfirmDialog from "./ConfirmDialog";

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

type CommentItemProps = {
  comment: Comment;
  onReply: (parentId: string, content: string, rawContent: string) => Promise<void>;
  onEdit: (commentId: string, content: string, rawContent: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  onVote: (commentId: string, voteType: "upvote" | "downvote") => Promise<void>;
  depth?: number;
  maxDepth?: number;
};

export default function CommentItem({
  comment,
  onReply,
  onEdit,
  onDelete,
  onVote,
  depth = 0,
  maxDepth = 5,
}: CommentItemProps) {
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [showEditBox, setShowEditBox] = useState(false);
  const [showReplies, setShowReplies] = useState(depth < 2); // Auto-expand first 2 levels
  const [showMenu, setShowMenu] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [replyRawContent, setReplyRawContent] = useState("");
  const [editContent, setEditContent] = useState(comment.content);
  const [editRawContent, setEditRawContent] = useState(comment.raw_content);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localVote, setLocalVote] = useState(comment.user_vote);
  const [localUpvotes, setLocalUpvotes] = useState(comment.upvotes);
  const [localDownvotes, setLocalDownvotes] = useState(comment.downvotes);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showShareToast, setShowShareToast] = useState(false);
  const [isHighlighted, setIsHighlighted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const commentRef = useRef<HTMLDivElement>(null);

  const isAuthor = user?.id === comment.user_id;
  const netVotes = localUpvotes - localDownvotes;
  const canReply = depth < maxDepth;

  // Handle comment highlighting from URL hash
  useEffect(() => {
    const hash = window.location.hash;
    if (hash === `#comment-${comment.id}`) {
      setIsHighlighted(true);
      // Scroll to comment
      setTimeout(() => {
        commentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
      
      // Remove highlight after 3 seconds
      setTimeout(() => {
        setIsHighlighted(false);
      }, 3000);
    }
  }, [comment.id]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showMenu]);

  const handleVote = async (voteType: "upvote" | "downvote") => {
    if (!user) {
      openAuthModal();
      return;
    }

    const previousVote = localVote;
    const previousUpvotes = localUpvotes;
    const previousDownvotes = localDownvotes;

    // Optimistic update
    if (localVote === voteType) {
      // Remove vote
      setLocalVote(null);
      if (voteType === "upvote") {
        setLocalUpvotes((prev) => prev - 1);
      } else {
        setLocalDownvotes((prev) => prev - 1);
      }
    } else {
      // Add or change vote
      if (localVote === "upvote") {
        setLocalUpvotes((prev) => prev - 1);
        setLocalDownvotes((prev) => prev + 1);
      } else if (localVote === "downvote") {
        setLocalDownvotes((prev) => prev - 1);
        setLocalUpvotes((prev) => prev + 1);
      } else {
        if (voteType === "upvote") {
          setLocalUpvotes((prev) => prev + 1);
        } else {
          setLocalDownvotes((prev) => prev + 1);
        }
      }
      setLocalVote(voteType);
    }

    try {
      await onVote(comment.id, voteType);
    } catch (error) {
      // Revert on error
      setLocalVote(previousVote);
      setLocalUpvotes(previousUpvotes);
      setLocalDownvotes(previousDownvotes);
    }
  };

  const handleReplySubmit = async () => {
    if (!replyRawContent.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onReply(comment.id, replyContent, replyRawContent);
      setReplyContent("");
      setReplyRawContent("");
      setShowReplyBox(false);
      setShowReplies(true); // Auto-expand to show new reply
    } catch (error) {
      console.error("Error submitting reply:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async () => {
    if (!editRawContent.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onEdit(comment.id, editContent, editRawContent);
      setShowEditBox(false);
    } catch (error) {
      console.error("Error editing comment:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    try {
      await onDelete(comment.id);
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error("Error deleting comment:", error);
    }
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}#comment-${comment.id}`;
    
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShowShareToast(true);
      setTimeout(() => setShowShareToast(false), 2000);
    } catch (error) {
      console.error("Error copying to clipboard:", error);
      // Fallback: show the URL in a prompt
      prompt("Copy this link:", shareUrl);
    }
  };

  const indentClass = depth > 0 ? "ml-3 sm:ml-6 md:ml-10 border-l-2 border-black/10 dark:border-white/10 pl-2 sm:pl-3 md:pl-4" : "";

  return (
    <div className={`${indentClass}`}>
      <div 
        ref={commentRef}
        id={`comment-${comment.id}`}
        className={`py-3 transition-all duration-300 ${
          isHighlighted ? 'bg-blue-500/10 -mx-2 px-2 rounded-lg border-l-4 border-blue-500' : ''
        }`}
      >
        {/* Header */}
        <div className="flex items-start gap-2 sm:gap-3">
          {/* Avatar */}
          <div className="flex-shrink-0">
            {comment.user_avatar ? (
              <Image
                src={comment.user_avatar}
                alt={comment.user_name}
                width={32}
                height={32}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full"
                unoptimized={!comment.user_avatar.includes('googleusercontent.com')}
              />
            ) : (
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs sm:text-sm font-bold">
                {comment.user_name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* User info and metadata */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white truncate">
                {comment.user_name}
              </span>
              {isAuthor && (
                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-600 dark:text-blue-400 text-xs rounded-full font-medium flex-shrink-0">
                  You
                </span>
              )}
              {comment.is_solution && (
                <span className="flex items-center gap-1 text-xs bg-green-500/20 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full flex-shrink-0">
                  <CheckCircle className="w-3 h-3" />
                  <span className="hidden sm:inline">Solution</span>
                </span>
              )}
              {comment.is_pinned && (
                <span className="flex items-center gap-1 text-xs bg-blue-500/20 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full flex-shrink-0">
                  <Pin className="w-3 h-3" />
                  <span className="hidden sm:inline">Pinned</span>
                </span>
              )}
              <span className="text-xs text-gray-500 dark:text-white/50 flex-shrink-0">
                {formatDistanceToNow(new Date(comment.created_at))}
              </span>
              {comment.is_edited && (
                <span className="text-xs text-gray-500 dark:text-white/50 flex-shrink-0">(edited)</span>
              )}
            </div>

            {/* Comment content */}
            {showEditBox ? (
              <div className="mb-3">
                <RichTextEditor
                  value={editContent}
                  onChange={(html, text) => {
                    setEditContent(html);
                    setEditRawContent(text);
                  }}
                  placeholder="Edit your comment..."
                  minHeight="100px"
                  autoFocus
                />
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={handleEditSubmit}
                    disabled={isSubmitting || !editRawContent.trim()}
                    className="px-4 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-all shadow-md hover:shadow-lg disabled:shadow-none"
                  >
                    {isSubmitting ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={() => {
                      setShowEditBox(false);
                      setEditContent(comment.content);
                      setEditRawContent(comment.raw_content);
                    }}
                    className="px-4 py-1.5 bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 rounded-lg text-sm font-medium transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="prose prose-sm dark:prose-invert max-w-none mb-3 break-words overflow-hidden"
                dangerouslySetInnerHTML={{ __html: comment.content }}
              />
            )}

            {/* Action buttons */}
            {!showEditBox && (
              <div className="flex items-center flex-wrap gap-2 sm:gap-3 text-sm">
                {/* Vote buttons */}
                <div className="flex items-center gap-1 sm:gap-2">
                  <button
                    onClick={() => handleVote("upvote")}
                    className={`flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded transition-colors ${
                      localVote === "upvote"
                        ? "bg-green-500/20 text-green-600 dark:text-green-400"
                        : "hover:bg-black/10 dark:hover:bg-white/10 text-gray-600 dark:text-white/60"
                    }`}
                  >
                    <ThumbsUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="text-xs font-medium">{localUpvotes}</span>
                  </button>
                  <button
                    onClick={() => handleVote("downvote")}
                    className={`flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded transition-colors ${
                      localVote === "downvote"
                        ? "bg-red-500/20 text-red-600 dark:text-red-400"
                        : "hover:bg-black/10 dark:hover:bg-white/10 text-gray-600 dark:text-white/60"
                    }`}
                  >
                    <ThumbsDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                  {netVotes !== 0 && (
                    <span className={`text-xs font-medium ${netVotes > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                      {netVotes > 0 ? "+" : ""}{netVotes}
                    </span>
                  )}
                </div>

                {/* Reply button */}
                {canReply && (
                  <button
                    onClick={() => {
                      if (!user) {
                        openAuthModal();
                        return;
                      }
                      setShowReplyBox(!showReplyBox);
                    }}
                    className="flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-gray-600 dark:text-white/60 transition-colors"
                  >
                    <Reply className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="text-xs font-medium hidden sm:inline">Reply</span>
                  </button>
                )}

                {/* Share button */}
                <div className="relative">
                  <button
                    onClick={handleShare}
                    className="flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-gray-600 dark:text-white/60 transition-colors"
                    title="Share this comment"
                  >
                    <Share2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="text-xs font-medium hidden sm:inline">Share</span>
                  </button>
                  
                  {/* Copy success toast */}
                  {showShareToast && (
                    <div className="absolute left-0 top-8 bg-green-500/10 border border-green-500/20 text-green-700 dark:text-green-400 text-xs px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-1 whitespace-nowrap z-20 animate-in fade-in slide-in-from-top-2">
                      <Check className="w-3 h-3" />
                      Link copied!
                    </div>
                  )}
                </div>

                {/* More menu */}
                <div className="relative ml-auto" ref={menuRef}>
                  <button
                    onClick={() => setShowMenu(!showMenu)}
                    className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-gray-600 dark:text-white/60 transition-colors"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {showMenu && (
                    <div className="absolute right-0 top-8 w-48 bg-white dark:bg-gray-800 border border-black/10 dark:border-white/10 rounded-lg shadow-lg py-1 z-20">
                      {isAuthor && (
                        <>
                          <button
                            onClick={() => {
                              setShowEditBox(true);
                              setShowMenu(false);
                            }}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5 text-gray-700 dark:text-white/70"
                          >
                            <Edit className="w-4 h-4" />
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              setShowDeleteConfirm(true);
                              setShowMenu(false);
                            }}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5 text-red-600 dark:text-red-400"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </button>
                        </>
                      )}
                      {!isAuthor && (
                        <button
                          onClick={() => setShowMenu(false)}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5 text-gray-700 dark:text-white/70"
                        >
                          <Flag className="w-4 h-4" />
                          Report
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Reply box */}
            {showReplyBox && (
              <div className="mt-3 mb-2">
                <RichTextEditor
                  value={replyContent}
                  onChange={(html, text) => {
                    setReplyContent(html);
                    setReplyRawContent(text);
                  }}
                  placeholder={`Reply to ${comment.user_name}...`}
                  minHeight="100px"
                  autoFocus
                />
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={handleReplySubmit}
                    disabled={isSubmitting || !replyRawContent.trim()}
                    className="px-4 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-all shadow-md hover:shadow-lg disabled:shadow-none"
                  >
                    {isSubmitting ? "Posting..." : "Reply"}
                  </button>
                  <button
                    onClick={() => {
                      setShowReplyBox(false);
                      setReplyContent("");
                      setReplyRawContent("");
                    }}
                    className="px-4 py-1.5 bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 rounded-lg text-sm font-medium transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          isOpen={showDeleteConfirm}
          title="Delete Comment"
          message="Are you sure you want to delete this comment? This action cannot be undone."
          confirmText="Delete"
          cancelText="Cancel"
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />

        {/* Replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setShowReplies(!showReplies)}
              className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 font-medium mb-2"
            >
              {showReplies ? (
                <>
                  <ChevronUp className="w-3 h-3" />
                  Hide {comment.replies.length} {comment.replies.length === 1 ? "reply" : "replies"}
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" />
                  Show {comment.replies.length} {comment.replies.length === 1 ? "reply" : "replies"}
                </>
              )}
            </button>

            {showReplies && (
              <div>
                {comment.replies.map((reply) => (
                  <CommentItem
                    key={reply.id}
                    comment={reply}
                    onReply={onReply}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onVote={onVote}
                    depth={depth + 1}
                    maxDepth={maxDepth}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
