# How to Fix Live Chat & Notifications

## 🔍 Issues Found

After investigating your codebase, I found these problems:

1. **Missing Database Column**: The `notifications` table is missing the `link_data` column that the code expects
2. **Real-Time Not Fully Enabled**: Some tables may not have real-time replication enabled
3. **Potential RLS Issues**: Row Level Security policies might need refresh

## ✅ The Fix (Simple 3-Step Process)

### Step 1: Run the Fix SQL

1. Open your Supabase dashboard: https://supabase.com/dashboard
2. Navigate to: **SQL Editor** (left sidebar)
3. Click **"New query"**
4. Copy and paste the entire contents of `FIX_CHAT_AND_NOTIFICATIONS.sql`
5. Click **"Run"** button

You should see output like:
```
✅ link_data column exists
✅ Realtime enabled for: channels, chat_messages, notifications, profiles, client_boards
```

### Step 2: Verify in Supabase Dashboard

After running the SQL, verify real-time is enabled:

1. Go to **Database** → **Replication** (left sidebar)
2. You should see these tables enabled:
   - ✅ channels
   - ✅ chat_messages
   - ✅ notifications
   - ✅ profiles
   - ✅ client_boards

If any are missing, toggle them ON.

### Step 3: Test the Application

1. **Refresh your browser** (hard refresh: Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows)
2. **Open browser console** (F12 or right-click → Inspect → Console tab)
3. Look for these logs:
   ```
   [TeamChat] Setting up realtime subscription
   🔔 New notification received!
   ```

#### Test Live Chat:
1. Open two browser windows side-by-side (or use incognito mode for 2nd user)
2. Log in as different users in each window
3. Send a message in one window
4. **It should appear instantly in the other window**

#### Test Notifications:
1. Have someone @mention you in a channel
2. Or check your notifications bell (should have a test notification from the SQL)
3. **Notification should appear with sound**

---

## 🐛 Still Not Working?

### Check 1: Browser Console Errors

Open console (F12) and look for:

**Good signs:**
```
[TeamChat] Setting up realtime subscription
Realtime message received
```

**Bad signs (and what they mean):**
```
❌ "WebSocket connection failed" → Network/firewall issue
❌ "Permission denied" → RLS policy issue
❌ "401 Unauthorized" → Not logged in properly
❌ "Failed to subscribe" → Real-time not enabled
```

### Check 2: Are You Logged In?

- Guest mode has limited permissions
- Make sure you're logged in as a real user
- Check: Does the sidebar show your name/avatar?

### Check 3: Network Tab

1. Open DevTools → Network tab
2. Filter by "WS" (WebSocket)
3. Look for connections to Supabase
4. Should show: Status 101 (Switching Protocols) - this is good!

### Check 4: Verify Database Changes

Run this in Supabase SQL Editor:

```sql
-- Check if link_data column exists
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'notifications';

-- Check real-time enabled tables
SELECT tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
AND schemaname = 'public';
```

---

## 📊 Technical Details (What Was Wrong)

### Problem 1: Missing `link_data` Column

**What the code expected:**
```typescript
// In databaseService.ts line 93
link_data: linkData ? JSON.stringify(linkData) : null
```

**What was in the database:**
```sql
-- Original schema (supabase_setup.sql line 87-96)
CREATE TABLE notifications (
  id UUID,
  user_id UUID,
  title TEXT,
  message TEXT,
  type TEXT,
  link_view TEXT,
  is_read BOOLEAN,
  created_at TIMESTAMP
  -- ❌ link_data column was MISSING!
);
```

**Impact:**
- Notifications couldn't store deep-link data
- Clicking notifications wouldn't navigate to tasks/chats
- Database INSERT would fail silently

### Problem 2: Real-Time Not Enabled

Real-time subscriptions in Supabase require:

1. Table must be added to `supabase_realtime` publication
2. WebSocket connection established
3. RLS policies must allow SELECT

**The code sets up subscriptions:**
```typescript
// TeamChat.tsx line 194-278
const msgSub = supabase.channel('public:chat_messages')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'chat_messages'
  }, (payload) => {
    // Handle new message
  })
  .subscribe();
```

But if the table isn't in the publication, the subscription silently does nothing!

### Problem 3: Potential RLS Confusion

Your RLS policies allow anonymous SELECT (for guest mode), but real-time subscriptions need explicit filtering:

**Fixed policies:**
```sql
-- Allow reading messages
CREATE POLICY "Messages are viewable by everyone"
  ON chat_messages FOR SELECT
  USING (true);

-- Allow sending messages (authenticated only)
CREATE POLICY "Authenticated users can send messages"
  ON chat_messages FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
```

---

## 🎯 How Live Chat Works (Now That It's Fixed)

### The Flow:

```
User A types message
    ↓
Frontend: sendChatMessage() calls database
    ↓
Supabase: INSERT into chat_messages table
    ↓
Supabase Real-Time: Detects INSERT, publishes to subscribers
    ↓
User B's Browser: WebSocket receives event
    ↓
Frontend: Subscription handler fires
    ↓
React: Updates state, message appears instantly
    ↓
Sound plays: playNotificationSound()
```

### The Code Path:

1. **Send**: `TeamChat.tsx:418-503` → `sendChatMessage()`
2. **Database**: `databaseService.ts:271-286` → INSERT query
3. **Real-Time**: Supabase publication broadcasts
4. **Receive**: `TeamChat.tsx:194-278` → Subscription handler
5. **Display**: React state update → UI re-render

---

## 🔔 How Notifications Work (Now That It's Fixed)

### The Flow:

```
Event triggers notification
  ├─ @mention in chat
  ├─ Task due today
  └─ New DM message
    ↓
createNotification(userId, title, message, type, linkView, linkData)
    ↓
Database INSERT with link_data as JSON string
    ↓
Real-time subscription fires
    ↓
Sidebar updates: bell icon + count
    ↓
Sound plays
    ↓
User clicks notification
    ↓
Parse linkData JSON
    ↓
Navigate to linkView (TASKS, TEAM_CHAT)
    ↓
Open specific task/channel
```

### Example Deep Link Data:

```json
{
  "taskId": "abc-123",
  "boardId": "xyz-789",
  "groupId": "def-456",
  "boardName": "Client Work"
}
```

This is stored as a string in `link_data` column, parsed on click.

---

## 🚀 After the Fix

Everything should now work:

✅ Send message → Appears instantly for all users
✅ @mention someone → They get notification + sound
✅ Task due today → Notification appears
✅ Click notification → Opens the task/chat
✅ DM someone → Real-time message delivery
✅ Multiple channels → No lost messages when switching

---

## 📞 Need More Help?

If you're still having issues after running the fix:

1. **Check the verification queries** output from the SQL
2. **Copy/paste browser console errors** - I can help debug specific errors
3. **Check Network tab** for WebSocket connection status
4. **Verify you ran the full FIX_CHAT_AND_NOTIFICATIONS.sql** file

The most common remaining issue is browser cache - try:
- Hard refresh (Cmd+Shift+R / Ctrl+Shift+R)
- Clear browser cache
- Try incognito/private browsing mode
