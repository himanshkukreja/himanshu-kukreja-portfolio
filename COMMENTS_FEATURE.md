# Comments Feature Documentation

## Overview
A Reddit-style nested comments system with rich text editing capabilities for authenticated users to discuss lesson content.

## Features

### 🎨 Rich Text Editor
- **Formatting**: Bold, Italic, Lists (Ordered & Unordered), Blockquotes
- **Code Blocks**: Full code block support with syntax preservation
- **Links**: Insert hyperlinks
- **Preview Mode**: Toggle between edit and preview
- **Undo/Redo**: Full history support

### 💬 Comments System
- **Nested Replies**: Infinite nesting (up to 5 levels for UI clarity)
- **Voting**: Upvote/downvote with optimistic updates
- **Sorting**: Top, Newest, Oldest
- **Edit/Delete**: Users can manage their own comments
- **Pinned Comments**: Admin can pin important comments
- **Solution Marking**: Mark comments as solutions
- **Edit History**: Tracks when comments are edited
- **Collapsible Threads**: Show/hide reply chains
- **Real-time Updates**: Instant refresh after actions

### 🔐 Authentication
- **Auth-Only Posting**: Only authenticated users can comment
- **Guest Viewing**: Anyone can view comments
- **Author Permissions**: Edit/delete own comments only
- **Vote Permissions**: Auth required for voting

## Database Schema

### Tables

#### `lesson_comments`
```sql
- id: UUID (primary key)
- user_id: UUID (foreign key to auth.users)
- course_id: TEXT
- week: TEXT
- lesson_slug: TEXT
- parent_id: UUID (self-reference for nesting)
- content: TEXT (HTML content)
- raw_content: TEXT (plain text for search)
- is_edited: BOOLEAN
- edit_history: JSONB
- upvotes: INTEGER
- downvotes: INTEGER
- is_pinned: BOOLEAN
- is_solution: BOOLEAN
- created_at: TIMESTAMPTZ
- updated_at: TIMESTAMPTZ
```

#### `comment_votes`
```sql
- id: UUID (primary key)
- user_id: UUID (foreign key)
- comment_id: UUID (foreign key)
- vote_type: TEXT ('upvote' | 'downvote')
- created_at: TIMESTAMPTZ
- UNIQUE(user_id, comment_id)
```

#### `comment_mentions`
```sql
- id: UUID (primary key)
- comment_id: UUID (foreign key)
- mentioned_user_id: UUID (foreign key)
- created_at: TIMESTAMPTZ
```

## Component Architecture

```
LessonComments (Container)
├── RichTextEditor (New comment form)
├── Sort/Filter Controls
└── CommentItem (Recursive)
    ├── User Avatar & Info
    ├── Comment Content (HTML)
    ├── Vote Buttons
    ├── Reply Button
    ├── Actions Menu (Edit/Delete)
    └── Nested Replies (CommentItem[])
```

## File Structure

```
src/
├── components/
│   ├── LessonComments.tsx       # Main comments container
│   ├── CommentItem.tsx          # Individual comment with nesting
│   ├── RichTextEditor.tsx       # WYSIWYG editor
│   └── ...
├── lib/
│   ├── date-utils.ts            # Date formatting utilities
│   └── supabase-client.ts       # Database client
└── app/
    └── learn/[course]/[week]/[slug]/
        └── page.tsx             # Lesson page with comments
```

## Usage

### Integration
Comments are automatically displayed at the end of each lesson:

```tsx
import LessonComments from "@/components/LessonComments";

<LessonComments
  courseId={course}
  week={week}
  lessonSlug={slug}
/>
```

### Rich Text Editor
```tsx
import RichTextEditor from "@/components/RichTextEditor";

<RichTextEditor
  value={content}
  onChange={(html, plainText) => {
    setContent(html);
    setPlainText(plainText);
  }}
  placeholder="Write your comment..."
  minHeight="120px"
  autoFocus={false}
/>
```

## API Operations

### Fetch Comments
```typescript
const { data } = await supabaseClient
  .from("lesson_comments")
  .select(`
    *,
    user_profiles!lesson_comments_user_id_fkey (
      full_name,
      avatar_url
    )
  `)
  .eq("course_id", courseId)
  .eq("week", week)
  .eq("lesson_slug", lessonSlug);
```

### Post Comment
```typescript
const { data } = await supabaseClient
  .from("lesson_comments")
  .insert({
    user_id: user.id,
    course_id: courseId,
    week: week,
    lesson_slug: lessonSlug,
    content: htmlContent,
    raw_content: plainText,
    parent_id: null, // or parentId for replies
  });
```

### Vote on Comment
```typescript
// Check existing vote
const { data: existingVote } = await supabaseClient
  .from("comment_votes")
  .select("*")
  .eq("user_id", user.id)
  .eq("comment_id", commentId)
  .maybeSingle();

// Insert/update/delete vote
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
  // New vote
  await supabaseClient
    .from("comment_votes")
    .insert({
      user_id: user.id,
      comment_id: commentId,
      vote_type: voteType,
    });
}
```

## Security

### Row Level Security (RLS)
- ✅ **Read**: Anyone can view comments
- ✅ **Create**: Authenticated users only
- ✅ **Update**: Users can only edit their own comments
- ✅ **Delete**: Users can only delete their own comments

### Vote Integrity
- Automatic vote count updates via database triggers
- One vote per user per comment (enforced by UNIQUE constraint)
- Cascade deletes when comments are removed

## Styling

### Prose Classes
Comments use Tailwind prose classes for rich text:
- `prose` - Base styling
- `prose-sm` - Smaller text size
- `prose-invert` - Dark mode support
- `dark:prose-invert` - Auto dark mode switching

### Custom Styles
- Code blocks with syntax preservation
- Custom scrollbars for long content
- Responsive design (mobile-first)
- Hover states for interactivity

## Performance Optimizations

### Optimistic Updates
- Vote changes update UI immediately
- Revert on error
- Prevents UI lag

### Recursive Rendering
- CommentItem renders itself recursively
- Depth limiting (max 5 levels)
- Auto-collapse deep threads

### Efficient Queries
- Single query fetches all comments
- Client-side tree building
- Vote data batched per user

## Future Enhancements

### Planned Features
- [ ] @mentions with autocomplete
- [ ] Notification system for replies
- [ ] Comment search/filter
- [ ] Markdown shortcuts
- [ ] Image uploads in comments
- [ ] Reaction emojis
- [ ] Comment drafts (auto-save)
- [ ] Report/flag system
- [ ] Moderator tools
- [ ] Comment analytics

### Performance
- [ ] Pagination for large threads
- [ ] Virtual scrolling
- [ ] Lazy load deep replies
- [ ] Cache comment counts

## Testing

### Manual Testing Checklist
- [ ] Post top-level comment
- [ ] Reply to comment (nested)
- [ ] Edit own comment
- [ ] Delete own comment
- [ ] Upvote/downvote
- [ ] Change vote
- [ ] Remove vote
- [ ] Sort comments
- [ ] Collapse/expand threads
- [ ] Guest view (no auth)
- [ ] Auth required for actions
- [ ] Rich text formatting
- [ ] Code block rendering
- [ ] Mobile responsive
- [ ] Dark mode

## Troubleshooting

### Common Issues

**Comments not loading**
- Check Supabase connection
- Verify RLS policies
- Check browser console for errors

**Votes not updating**
- Ensure trigger is installed: `update_comment_votes_trigger`
- Check user authentication
- Verify vote table constraints

**Editor not working**
- Check contentEditable browser support
- Verify CSS prose classes loaded
- Test in different browsers

## Support

For issues or questions:
1. Check database migrations are applied
2. Verify RLS policies are enabled
3. Test with authenticated user
4. Check browser console for errors
5. Review Supabase logs

---

**Version**: 1.0.0  
**Last Updated**: February 11, 2026  
**Author**: Himanshu Kukreja
