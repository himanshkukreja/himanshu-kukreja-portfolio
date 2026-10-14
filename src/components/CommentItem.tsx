"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { ThumbsUp, ThumbsDown, Reply, MoreVertical, Edit, Trash2, Flag, CheckCircle, Pin, Share2 } from "lucide-react";
import RichTextEditor from "./RichTextEditor";
import { formatDistanceToNow } from "@/lib/date-utils";
import ConfirmDialog from "./ConfirmDialog";
import richStyles from "@/components/learn/lesson/richtext.module.css";

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

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

const ACTION = "inline-flex min-h-11 items-center gap-1.5 px-2 font-mono text-xs text-fg-3 hover:text-fg";

export default function CommentItem({ comment, onReply, onEdit, onDelete, onVote, depth = 0, maxDepth = 5 }: CommentItemProps) {
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [showEditBox, setShowEditBox] = useState(false);
  const [showReplies, setShowReplies] = useState(depth < 2); // first two levels open
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
  const [share, setShare] = useState<{ ok: boolean; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isHighlighted, setIsHighlighted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const commentRef = useRef<HTMLDivElement>(null);

  const isAuthor = user?.id === comment.user_id;
  const netVotes = localUpvotes - localDownvotes;
  const canReply = depth < maxDepth;

  // #comment-<id> deep links: scroll to and briefly mark the comment
  useEffect(() => {
    if (window.location.hash !== `#comment-${comment.id}`) return;
    const t1 = window.setTimeout(() => {
      setIsHighlighted(true);
      commentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
    const t2 = window.setTimeout(() => setIsHighlighted(false), 3300);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [comment.id]);

  useEffect(() => {
    if (!showMenu) return;
    const onDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setShowMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setShowMenu(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [showMenu]);

  const handleVote = async (voteType: "upvote" | "downvote") => {
    if (!user) {
      openAuthModal();
      return;
    }
    const prev = { vote: localVote, up: localUpvotes, down: localDownvotes };
    if (localVote === voteType) {
      setLocalVote(null);
      if (voteType === "upvote") setLocalUpvotes((n) => n - 1);
      else setLocalDownvotes((n) => n - 1);
    } else {
      if (localVote === "upvote") {
        setLocalUpvotes((n) => n - 1);
        setLocalDownvotes((n) => n + 1);
      } else if (localVote === "downvote") {
        setLocalDownvotes((n) => n - 1);
        setLocalUpvotes((n) => n + 1);
      } else if (voteType === "upvote") setLocalUpvotes((n) => n + 1);
      else setLocalDownvotes((n) => n + 1);
      setLocalVote(voteType);
    }
    try {
      await onVote(comment.id, voteType);
    } catch {
      setLocalVote(prev.vote);
      setLocalUpvotes(prev.up);
      setLocalDownvotes(prev.down);
      setError("Vote didn't save. Try again.");
    }
  };

  const handleReplySubmit = async () => {
    if (!replyRawContent.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onReply(comment.id, replyContent, replyRawContent);
      setReplyContent("");
      setReplyRawContent("");
      setShowReplyBox(false);
      setShowReplies(true);
    } catch {
      setError("Reply didn't post. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async () => {
    if (!editRawContent.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onEdit(comment.id, editContent, editRawContent);
      setShowEditBox(false);
    } catch {
      setError("Edit didn't save. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    try {
      await onDelete(comment.id);
      setShowDeleteConfirm(false);
    } catch {
      setShowDeleteConfirm(false);
      setError("Couldn't delete the comment. Try again.");
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}${window.location.pathname}#comment-${comment.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setShare({ ok: true, url });
      window.setTimeout(() => setShare(null), 2000);
    } catch {
      // clipboard blocked: show the link so it can be copied by hand
      setShare({ ok: false, url });
    }
  };

  return (
    <div className={depth > 0 ? "ml-3 border-l border-line pl-3 sm:ml-6 sm:pl-4" : ""}>
      <div
        ref={commentRef}
        id={`comment-${comment.id}`}
        className={`py-3 transition-colors ${isHighlighted ? "-mx-2 bg-surface-2 px-2 outline outline-1 outline-signal" : ""}`}
      >
        <div className="flex items-start gap-3">
          <div className="shrink-0">
            {comment.user_avatar ? (
              <Image
                src={comment.user_avatar}
                alt=""
                width={36}
                height={36}
                className="h-9 w-9 border border-line-strong object-cover"
                unoptimized={!comment.user_avatar.includes("googleusercontent.com")}
              />
            ) : (
              <span aria-hidden className="grid h-9 w-9 place-items-center border border-line-strong bg-surface-2 text-[13px] font-bold text-fg">
                {initials(comment.user_name)}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="truncate text-sm font-semibold text-fg">{comment.user_name}</span>
              {isAuthor && <span className="bg-fg px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-label text-bg">YOU</span>}
              {comment.is_solution && (
                <span className="inline-flex items-center gap-1 border border-ok px-1.5 py-0.5 font-mono text-[10px] tracking-label text-ok">
                  <CheckCircle className="h-3 w-3" aria-hidden />
                  SOLUTION
                </span>
              )}
              {comment.is_pinned && (
                <span className="inline-flex items-center gap-1 border border-signal px-1.5 py-0.5 font-mono text-[10px] tracking-label text-signal-text">
                  <Pin className="h-3 w-3" aria-hidden />
                  PINNED
                </span>
              )}
              <span className="font-mono text-[11px] text-fg-3">
                {formatDistanceToNow(new Date(comment.created_at))}
                {comment.is_edited ? " · edited" : ""}
              </span>
            </div>

            {showEditBox ? (
              <div className="mb-3">
                <RichTextEditor
                  value={editContent}
                  onChange={(html, text) => {
                    setEditContent(html);
                    setEditRawContent(text);
                  }}
                  placeholder="Edit your comment…"
                  minHeight="100px"
                  autoFocus
                />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleEditSubmit}
                    disabled={isSubmitting || !editRawContent.trim()}
                    className="min-h-11 bg-signal px-4 text-sm font-semibold text-on-signal disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSubmitting ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditBox(false);
                      setEditContent(comment.content);
                      setEditRawContent(comment.raw_content);
                    }}
                    className="min-h-11 border border-line-strong px-4 text-sm text-fg hover:border-fg-3"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                className={`prose ${richStyles.rich} mb-1 max-w-none text-[15px] leading-relaxed text-fg-2`}
                dangerouslySetInnerHTML={{ __html: comment.content }}
              />
            )}

            {!showEditBox && (
              <div className="-ml-2 flex flex-wrap items-center text-sm">
                <button
                  type="button"
                  onClick={() => handleVote("upvote")}
                  aria-pressed={localVote === "upvote"}
                  aria-label={`Upvote, ${localUpvotes}`}
                  className={`${ACTION} ${localVote === "upvote" ? "text-signal-text" : ""}`}
                >
                  <ThumbsUp className="h-3.5 w-3.5" aria-hidden />
                  {localUpvotes}
                </button>
                <button
                  type="button"
                  onClick={() => handleVote("downvote")}
                  aria-pressed={localVote === "downvote"}
                  aria-label="Downvote"
                  className={`${ACTION} ${localVote === "downvote" ? "text-bad-text" : ""}`}
                >
                  <ThumbsDown className="h-3.5 w-3.5" aria-hidden />
                </button>
                {netVotes !== 0 && (
                  <span className={`px-1 font-mono text-xs ${netVotes > 0 ? "text-fg-2" : "text-bad-text"}`}>
                    {netVotes > 0 ? "+" : ""}
                    {netVotes}
                  </span>
                )}
                {canReply && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!user) {
                        openAuthModal();
                        return;
                      }
                      setShowReplyBox((v) => !v);
                    }}
                    aria-expanded={showReplyBox}
                    className={ACTION}
                  >
                    <Reply className="h-3.5 w-3.5" aria-hidden />
                    reply
                  </button>
                )}
                <span className="relative">
                  <button type="button" onClick={handleShare} className={ACTION} title="Copy a link to this comment">
                    <Share2 className="h-3.5 w-3.5" aria-hidden />
                    share
                  </button>
                  {share && (
                    <span role="status" className="absolute left-0 top-full z-20 mt-1 flex min-w-max max-w-[min(80vw,420px)] items-center gap-2 border border-line-strong bg-surface px-3 py-2 font-mono text-[11px] text-fg-2">
                      {share.ok ? (
                        "Link copied ✓"
                      ) : (
                        <>
                          <span className="shrink-0">Copy this link:</span>
                          <input readOnly value={share.url} onFocus={(e) => e.currentTarget.select()} aria-label="Comment link" className="min-w-0 flex-1 bg-transparent text-fg outline-none" />
                          <button type="button" onClick={() => setShare(null)} aria-label="Close" className="px-1 text-fg-3 hover:text-fg">
                            ×
                          </button>
                        </>
                      )}
                    </span>
                  )}
                </span>

                <div className="relative ml-auto" ref={menuRef}>
                  <button type="button" onClick={() => setShowMenu((v) => !v)} aria-expanded={showMenu} aria-label="More actions" className="grid min-h-11 min-w-11 place-items-center text-fg-3 hover:text-fg">
                    <MoreVertical className="h-4 w-4" aria-hidden />
                  </button>
                  {showMenu && (
                    <div className="absolute right-0 top-full z-20 w-44 border border-line-strong bg-surface py-1">
                      {isAuthor ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setShowEditBox(true);
                              setShowMenu(false);
                            }}
                            className="flex min-h-11 w-full items-center gap-2 px-4 text-sm text-fg hover:bg-surface-2"
                          >
                            <Edit className="h-4 w-4" aria-hidden />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowDeleteConfirm(true);
                              setShowMenu(false);
                            }}
                            className="flex min-h-11 w-full items-center gap-2 px-4 text-sm text-bad-text hover:bg-surface-2"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                            Delete
                          </button>
                        </>
                      ) : (
                        <button type="button" onClick={() => setShowMenu(false)} className="flex min-h-11 w-full items-center gap-2 px-4 text-sm text-fg hover:bg-surface-2">
                          <Flag className="h-4 w-4" aria-hidden />
                          Report
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {error && (
              <p role="alert" className="m-0 mt-1 text-[13px] text-bad-text">
                {error}
              </p>
            )}

            {showReplyBox && (
              <div className="mb-2 mt-3">
                <RichTextEditor
                  value={replyContent}
                  onChange={(html, text) => {
                    setReplyContent(html);
                    setReplyRawContent(text);
                  }}
                  placeholder={`Reply to ${comment.user_name}…`}
                  minHeight="100px"
                  autoFocus
                />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleReplySubmit}
                    disabled={isSubmitting || !replyRawContent.trim()}
                    className="min-h-11 bg-signal px-4 text-sm font-semibold text-on-signal disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSubmitting ? "Posting…" : "Reply"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowReplyBox(false);
                      setReplyContent("");
                      setReplyRawContent("");
                    }}
                    className="min-h-11 border border-line-strong px-4 text-sm text-fg hover:border-fg-3"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <ConfirmDialog
          isOpen={showDeleteConfirm}
          title="Delete comment"
          message="Delete this comment? This can't be undone."
          confirmText="Delete"
          cancelText="Cancel"
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />

        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-1">
            <button type="button" onClick={() => setShowReplies((v) => !v)} aria-expanded={showReplies} className="min-h-11 font-mono text-xs text-signal-text hover:underline">
              {showReplies ? "▾ hide" : "▸ show"} {comment.replies.length} {comment.replies.length === 1 ? "reply" : "replies"}
            </button>
            {showReplies &&
              comment.replies.map((reply) => (
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
    </div>
  );
}
