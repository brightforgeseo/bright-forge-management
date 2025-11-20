# Bright Forge Portal - Setup Guide

This guide will help you get your team portal up and running in minutes.

## Prerequisites

- Node.js installed (v16 or higher)
- A Supabase account (free tier works fine)
- Git (for version control)

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Set Up Supabase Database

### 2.1: Go to Your Supabase Dashboard
- Visit https://supabase.com/dashboard
- Open your project: `mvkbmozwplhsduiiakql`

### 2.2: Run the Database Setup Script
1. Click **SQL Editor** in the left sidebar
2. Click **New Query**
3. Copy the entire contents of `supabase_setup.sql`
4. Paste it into the SQL editor
5. Click **Run** (or press Cmd/Ctrl + Enter)

**The script will:**
- ✅ Drop all existing policies (no conflicts!)
- ✅ Create all necessary tables
- ✅ Set up Row Level Security (RLS)
- ✅ Create default channels ('general', 'ask-ai')
- ✅ Set up file storage bucket
- ✅ Create automatic profile creation on signup

**Note:** You can run this script multiple times safely. It's completely idempotent.

### 2.3: Verify Setup
After running the script, check:
- **Table Editor** → You should see: `profiles`, `channels`, `chat_messages`, `client_boards`, `notifications`, `allowed_users`
- **Storage** → You should see an `uploads` bucket

## Step 3: Configure Environment (Optional)

The Supabase credentials are already hardcoded in `lib/supabaseClient.ts`. If you want to add a Gemini API key for the AI chat feature:

1. Open `.env.local`
2. Replace `PLACEHOLDER_API_KEY` with your actual Gemini API key
3. Get a free key at: https://aistudio.google.com/app/apikey

## Step 4: Run the Application

### Option A: Web Development Mode
```bash
npm start
```
Then open http://localhost:1234

### Option B: Electron Desktop App (Development)
```bash
npm run electron:dev
```

### Option C: Build for Production
```bash
# Build web version
npm run build

# Build Electron desktop app
npm run electron:build
```

## Step 5: Create Your First User

1. Open the app (http://localhost:1234 or Electron)
2. Click **Sign Up**
3. Enter your email and password
4. Your account will be created automatically
5. A profile will be auto-generated

## Features Overview

### 🏠 Dashboard
- View team performance metrics
- See recent activity
- Quick stats overview

### 📋 Task Board (Kanban)
- Create client boards
- Drag and drop tasks
- Add team members to tasks
- Track progress (Backlog → In Progress → Review → Done)

### 💬 Team Chat
- **Public Channels**: Create channels for different topics
- **Direct Messages**: One-on-one conversations with team members
- **File Sharing**: Upload images and files
- **AI Assistant**: Ask questions in the `#ask-ai` channel (requires Gemini API key)
- **Real-time Updates**: Messages appear instantly for all users

### 🔔 Notifications
- Get notified of important updates
- Direct message alerts
- Task assignments

### ⚙️ Settings
- Update your profile name
- Manage team members (Owner only)
- Invite new users

## Troubleshooting

### Chat Not Working?

**Problem**: Messages not sending or appearing

**Solution**:
1. **Check you're logged in**: You must be authenticated
2. **Verify database setup**: Run the SQL setup script again
3. **Check browser console** (F12):
   - Look for Supabase errors
   - Check for "permission denied" errors
4. **Verify RLS policies**: In Supabase Dashboard → Authentication → Policies
   - Ensure `chat_messages` table has INSERT policy for authenticated users

### Can't Delete Chat History?

**Problem**: Delete button not working

**Solution**:
- Click the trash icon in the top-right of the chat
- Confirm the deletion dialog
- If it fails, check browser console for errors

### Build Errors?

**Problem**: `npm run build` fails

**Solution**:
1. Delete `node_modules` and `.parcel-cache`:
   ```bash
   rm -rf node_modules .parcel-cache
   ```
2. Reinstall:
   ```bash
   npm install
   ```
3. Try building again:
   ```bash
   npm run build
   ```

### Supabase Connection Issues?

**Problem**: App can't connect to Supabase

**Solution**:
1. Check `lib/supabaseClient.ts` has correct credentials
2. Verify your Supabase project is active (not paused)
3. Check network connection
4. Look for CORS errors in browser console

## File Structure

```
bright-forge-portal/
├── components/          # React components
│   ├── Dashboard.tsx
│   ├── TaskBoard.tsx
│   ├── TeamChat.tsx
│   ├── Login.tsx
│   └── Settings.tsx
├── services/           # Backend services
│   ├── databaseService.ts
│   └── geminiService.ts
├── lib/               # Configuration
│   └── supabaseClient.ts
├── supabase_setup.sql # Database schema
├── index.html         # Entry point
├── index.tsx          # React root
├── App.tsx            # Main app component
└── package.json       # Dependencies
```

## User Roles

- **Owner**: Full access, can invite users, manage settings
- **Team Member**: Can use all features, cannot manage team

The first user to sign up becomes the Owner.

## Master Password Access

The app includes a master password feature for admin access:
- Use the password set in your Settings → Security
- This allows Owner-level access without creating an account

## Support

- **GitHub Issues**: https://github.com/brightforgeseo/bright-forge-management/issues
- **Supabase Docs**: https://supabase.com/docs
- **React Docs**: https://react.dev

## Next Steps

1. ✅ Run the database setup SQL
2. ✅ Start the app
3. ✅ Create your account
4. ✅ Invite your team
5. ✅ Create your first project board
6. ✅ Start chatting!

---

**Built with**: React, TypeScript, Supabase, Tailwind CSS, Parcel, Electron
