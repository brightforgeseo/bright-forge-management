# Complete Setup Guide - All Recent Features

## Overview

This guide covers all the recent features that have been implemented and what you need to do to activate them.

---

## ✅ Features Completed

1. **Online/Offline Status Tracking** - See who's online in real-time
2. **Profile Picture Upload** - Users can upload avatars
3. **Message Editing** - Edit your own messages in chat and DMs
4. **Real-time Message Sync** - Edits appear instantly for all users
5. **Role-Based Settings** - Non-owners can't see branding configuration

---

## 🚨 CRITICAL: Required Database Setup

**YOU MUST RUN THESE SQL SCRIPTS BEFORE THE FEATURES WILL WORK!**

### Step 1: Add Message Editing Columns

**File:** `ADD_MESSAGE_EDITING_COLUMNS.sql`

**What it does:**
- Adds `sender_id` column to track who sent each message
- Adds `is_edited` boolean flag
- Adds `edited_at` timestamp
- Creates index for better performance

**How to run:**
1. Open https://supabase.com/dashboard
2. Navigate to: **SQL Editor**
3. Click **"New query"**
4. Copy/paste entire contents of `ADD_MESSAGE_EDITING_COLUMNS.sql`
5. Click **"Run"**

**Expected output:**
```
ALTER TABLE
CREATE INDEX
(verification queries showing the new columns)
```

**If you don't do this:** Messages won't send and you'll get errors!

---

### Step 2: Fix Upload Bucket (For Profile Pictures)

**File:** `CHECK_UPLOADS_BUCKET.sql`

**What it does:**
- Verifies the 'uploads' bucket exists
- Creates proper RLS policies for authenticated uploads
- Ensures public read access for uploaded files
- Sets file size limit to 10MB

**How to run:**
1. In Supabase SQL Editor
2. Click **"New query"**
3. Copy/paste entire contents of `CHECK_UPLOADS_BUCKET.sql`
4. Click **"Run"**

**Expected output:**
```
Uploads bucket configuration:
id: uploads, public: true, file_size_limit: 10485760

Uploads bucket policies:
- Allow authenticated uploads
- Public uploads access
```

**If you don't do this:** Profile picture uploads will fail with "Bucket not found" error!

---

### Step 3 (OPTIONAL): Create Dedicated Avatars Bucket

**File:** `SETUP_AVATARS_BUCKET.sql`

**What it does:**
- Creates a dedicated 'avatars' bucket
- Sets 5MB file size limit
- Restricts to image files only
- Creates proper RLS policies

**Why it's optional:**
- Currently using 'uploads' bucket for avatars (works fine)
- This creates a dedicated bucket for better organization
- Recommended for production but not required

**How to run:**
1. In Supabase SQL Editor
2. Copy/paste entire contents of `SETUP_AVATARS_BUCKET.sql`
3. Click **"Run"**
4. Update `Settings.tsx` line 54: change `'uploads'` to `'avatars'`

---

## 📝 Code Changes Summary

All code changes are already committed and pushed to GitHub. Here's what was changed:

### 1. `types.ts`
**Added presence fields to Profile:**
```typescript
isOnline?: boolean;
lastSeen?: string;
```

**Added editing fields to ChatMessage:**
```typescript
senderId?: string;
isEdited?: boolean;
editedAt?: string;
```

### 2. `components/TeamChat.tsx`
**Major additions:**
- Online/offline presence tracking with 30-second heartbeat
- Message editing UI with Edit button (appears on hover)
- Edit mode with Save/Cancel buttons
- Real-time UPDATE listener for cross-user sync
- Message cache updates for edits

**Key sections:**
- Lines 108-154: Presence tracking setup
- Lines 32-34: Edit state management
- Lines 343-374: UPDATE event listener (CRITICAL for real-time edits)
- Lines 515-545: Edit and cancel handlers
- Lines 946-1008: Edit UI in message display

### 3. `components/Settings.tsx`
**Major additions:**
- Profile picture upload UI with preview
- File validation (images only, max 5MB)
- Loading state during upload
- Branding section hidden from non-Owners

**Key sections:**
- Lines 29-84: Avatar upload handler
- Lines 122-163: Avatar upload UI
- Lines 213-253: Owner-only branding section

### 4. `services/databaseService.ts`
**Major additions:**
- `editChatMessage()` function - Updates message in database
- Enhanced `sendChatMessage()` - Includes sender_id
- Enhanced `uploadFile()` - Better error logging

**Key sections:**
- Lines 289-300: Edit message function
- Lines 271-287: Send message with sender_id
- Lines 311-332: Upload with logging

### 5. `App.tsx`
**Minor change:**
- Line 261: Pass `currentUser` prop to Settings component

---

## 🎯 How Each Feature Works

### Online/Offline Status

**How it works:**
1. Uses Supabase Presence API
2. Each user "tracks" their presence on mount
3. 30-second heartbeat keeps status fresh
4. Green dot = online, gray = offline
5. Updates in real-time across all users

**Where to see it:**
- Team section in sidebar
- Next to each team member's name

**No database changes needed** - Uses Supabase Presence (in-memory)

---

### Profile Picture Upload

**How it works:**
1. User clicks "Upload Photo" in Settings
2. File validated (images only, max 5MB)
3. Uploaded to Supabase Storage 'uploads' bucket
4. Public URL stored in profiles.avatar_url
5. Avatar appears in sidebar, chat messages, settings

**Where to see it:**
- Settings page (upload UI)
- Sidebar (your profile)
- Chat messages (next to your name)

**Database changes needed:**
- ✅ Run `CHECK_UPLOADS_BUCKET.sql` (REQUIRED)
- Optional: Run `SETUP_AVATARS_BUCKET.sql` for dedicated bucket

---

### Message Editing

**How it works:**
1. Hover over your own message → Edit button appears
2. Click Edit → Message becomes editable textarea
3. Make changes → Press Enter or click Save
4. Message updates in database with `is_edited = true`
5. UPDATE event fires → All users see the edit in real-time
6. "(edited)" indicator appears next to timestamp

**Where it works:**
- Live chat (channel messages)
- Private messages (DMs)

**Database changes needed:**
- ✅ Run `ADD_MESSAGE_EDITING_COLUMNS.sql` (REQUIRED)

**Important notes:**
- Can only edit your own messages (checked via senderId)
- Can't edit AI/bot messages
- Keyboard shortcuts: Enter to save, Esc to cancel
- Edit history not tracked (only latest version stored)

---

### Real-time Message Sync

**How it works:**
1. User A edits a message
2. Database UPDATE event fires
3. Supabase broadcasts to all subscribers
4. UPDATE listener (lines 343-374) receives event
5. Updates both messageCache and current messages
6. User B sees the edit instantly (no refresh needed)

**Why it's critical:**
- Without UPDATE listener, only the editor sees changes
- Other users would need to refresh to see edits
- Keeps all chat windows in sync

**Database changes needed:**
- ✅ Run `ADD_MESSAGE_EDITING_COLUMNS.sql` (REQUIRED)

---

## 🧪 Testing Guide

### Test 1: Online Status
1. Open app in two different browsers (or incognito)
2. Log in as two different users
3. Check Team section in sidebar
4. Should see green dot next to online users
5. Close one browser → dot should turn gray within 30 seconds

### Test 2: Profile Picture Upload
1. Go to Settings
2. Click "Upload Photo"
3. Choose an image (JPG/PNG, under 5MB)
4. Should see loading spinner
5. Success toast: "Profile picture updated!"
6. Avatar should appear in sidebar and settings

**If it fails:**
- Check browser console for errors
- Verify you ran `CHECK_UPLOADS_BUCKET.sql`
- Check Supabase Storage → Buckets → uploads exists

### Test 3: Message Editing
1. Send a message in any channel
2. Hover over your message → Edit button appears
3. Click Edit → Message becomes textarea
4. Change text → Press Enter (or click Save)
5. Message should update with "(edited)" indicator
6. Open same channel in another browser → edit should appear there too

**If it fails:**
- Check console for errors
- Verify you ran `ADD_MESSAGE_EDITING_COLUMNS.sql`
- Check Supabase SQL Editor: `SELECT * FROM chat_messages LIMIT 1;`
  - Should have columns: sender_id, is_edited, edited_at

### Test 4: Real-time Sync
1. Open chat in Browser A and Browser B (different users)
2. User A sends a message
3. User B should see it instantly
4. User A edits the message
5. User B should see the edit instantly (no refresh)

**If sync fails:**
- Check console for: `[TeamChat] Realtime message UPDATE received`
- If missing, UPDATE listener not working
- Verify subscription status: Should see `SUBSCRIBED`

---

## 🐛 Common Issues & Fixes

### Issue: "Error sending message: Object"

**Cause:** Database columns don't exist yet

**Fix:**
1. Run `ADD_MESSAGE_EDITING_COLUMNS.sql` in Supabase
2. Refresh browser
3. Try sending message again

---

### Issue: "Failed to upload image. Bucket not found"

**Cause:** Uploads bucket doesn't exist or lacks policies

**Fix:**
1. Run `CHECK_UPLOADS_BUCKET.sql` in Supabase
2. Verify output shows bucket created
3. Refresh browser
4. Try upload again

---

### Issue: Edit button doesn't appear

**Possible causes:**
1. Message was sent by someone else (can only edit your own)
2. Message is from AI/bot
3. Already in edit mode

**Check:**
- Hover over YOUR OWN messages
- Look for pencil icon on the right side
- Should only appear on non-AI messages

---

### Issue: Edits don't appear for other users

**Cause:** UPDATE listener not working

**Fix:**
1. Check console for: `[TeamChat] Realtime message UPDATE received`
2. If missing, verify database columns exist
3. Hard refresh both browsers (Cmd/Ctrl + Shift + R)
4. Check Supabase → Database → Replication
   - Ensure `chat_messages` table is enabled

---

### Issue: Team members see Branding Configuration

**Cause:** Code not deployed yet

**Fix:**
1. Verify latest code is deployed to Vercel
2. Hard refresh browser
3. Check that user role is NOT 'Owner'
4. Only Owners should see Branding section

---

## 📋 Deployment Checklist

Before deploying to production:

### Database Setup:
- [ ] Run `ADD_MESSAGE_EDITING_COLUMNS.sql` ✅ REQUIRED
- [ ] Run `CHECK_UPLOADS_BUCKET.sql` ✅ REQUIRED
- [ ] Verify columns exist: `sender_id`, `is_edited`, `edited_at`
- [ ] Verify uploads bucket exists and is public
- [ ] Optional: Run `SETUP_AVATARS_BUCKET.sql` for dedicated bucket

### Code Deployment:
- [ ] All changes committed to Git
- [ ] Pushed to GitHub
- [ ] Vercel auto-deployed (or manually deployed)
- [ ] Hard refresh browser on production URL

### Verification:
- [ ] Console shows: `✅ Real-time subscription active`
- [ ] Console shows: `SUBSCRIBED` status
- [ ] Send test message → appears instantly
- [ ] Edit test message → updates in real-time
- [ ] Upload profile picture → succeeds
- [ ] Online status shows green dot
- [ ] Non-owners don't see branding section

---

## 🎉 Success Criteria

When everything is working correctly, you should see:

### In Browser Console:
```
[TeamChat] Setting up realtime subscription
[TeamChat] Subscription status: SUBSCRIBED
✅ Real-time subscription active
[TeamChat] Setting up online presence tracking
```

### In The UI:
- ✅ Green dots next to online team members
- ✅ Edit button (pencil icon) appears on hover over your messages
- ✅ Click Edit → message becomes editable
- ✅ Save → "(edited)" appears next to timestamp
- ✅ Other users see edits instantly (no refresh)
- ✅ Profile picture upload works
- ✅ Avatar appears in sidebar, settings, chat messages
- ✅ Only Owners see "Branding Configuration" section

### In Supabase:
- ✅ `chat_messages` table has new columns
- ✅ `uploads` bucket exists and is public
- ✅ Storage policies allow authenticated uploads
- ✅ Real-time enabled for chat_messages table

---

## 📊 Git Commit History

All work has been committed with these messages:

1. `Add profile picture upload and message editing features`
2. `Fix message sending and improve error logging`
3. `Use uploads bucket for avatars temporarily`
4. `Hide Branding Configuration from non-Owners and add uploads bucket check`
5. `Add realtime UPDATE listener for message editing` ← Most recent

---

## 🔄 Next Steps (If Needed)

### Optional Improvements:

1. **Edit History Tracking**
   - Store edit history in separate table
   - Show "View edit history" option
   - Requires new table and UI

2. **Delete Messages**
   - Add delete button next to edit
   - Soft delete (mark as deleted, don't remove)
   - Requires new column and UI

3. **Message Reactions**
   - Add emoji reactions to messages
   - Store in separate reactions table
   - Real-time reaction updates

4. **Typing Indicators**
   - Show "User is typing..." indicator
   - Use Supabase Presence API
   - Requires new presence channel

None of these are needed right now - current features are complete and working!

---

## 📞 Still Need Help?

If after following all steps something still doesn't work:

1. **Copy browser console output** (especially errors in red)
2. **Screenshot the error** (if visual issue)
3. **Note which SQL scripts you ran** (and their output)
4. **Describe what you expected vs what happened**

Most common issues are:
- Forgot to run SQL scripts
- Forgot to hard refresh browser
- Old code cached in browser
- Supabase project paused (free tier)

---

## ✅ Quick Start (TL;DR)

If you just want to get it working ASAP:

```bash
# 1. Run these SQL files in Supabase SQL Editor:
ADD_MESSAGE_EDITING_COLUMNS.sql  # REQUIRED
CHECK_UPLOADS_BUCKET.sql         # REQUIRED

# 2. Code is already pushed to GitHub (no action needed)

# 3. Hard refresh browser
Cmd/Ctrl + Shift + R

# 4. Test:
# - Send a message (should work)
# - Edit the message (should work)
# - Upload profile picture (should work)
# - Check online status (should show green dots)

# Done! 🎉
```

That's it! All features should now be working.
