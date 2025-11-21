# How to Enable Supabase Realtime

Your messages are sending successfully but not appearing in real-time because Supabase Realtime is not enabled or not configured properly.

## Quick Fix Applied

I've added a workaround that manually adds messages to the UI after sending. **Messages should now appear when you send them!**

## Permanent Fix: Enable Supabase Realtime

To get real-time updates working properly (so messages from other users appear automatically):

### Step 1: Enable Realtime in Supabase

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project: `mvkbmozwplhsduiiakql`
3. Go to **Database** → **Replication** (in left sidebar)
4. Find the `chat_messages` table in the list
5. Toggle it **ON** (enable replication)
6. Also enable `channels` and `message_reactions` tables
7. Click **Save** or **Apply**

### Step 2: Verify Realtime is Enabled

1. Go to **Project Settings** → **API**
2. Scroll down to **Realtime** section
3. Make sure it shows "Enabled"
4. Check that your tables are listed under "Realtime enabled tables"

### Step 3: Test Realtime

After enabling:

1. Refresh your app
2. Open the browser console (F12)
3. Look for this log: `[TeamChat] Message subscription status: SUBSCRIBED`
4. Send a message from another browser/user
5. You should see: `[TeamChat] ✅ REALTIME: New message received:`

## What Changed

I updated the code to:

1. **Manually add sent messages to UI** - Your own messages now appear immediately
2. **Added realtime debugging** - Console will show if realtime is working
3. **Handle both cases** - Works with or without realtime enabled

## Current Behavior

- ✅ **Your messages**: Appear immediately when you send them
- ⚠️ **Other users' messages**: Will only appear if you refresh the page (until realtime is enabled)
- ⚠️ **Multi-device**: Messages won't sync across your devices in real-time (until realtime is enabled)

Once you enable Realtime in Supabase, messages from other users will appear instantly without refresh!
