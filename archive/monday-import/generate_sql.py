#!/usr/bin/env python3
"""Generate SQL to restore all Monday.com boards to Supabase"""

import json

# User ID mappings
USER_MAP = {
    'ben lowe': 'f9f11222-d2a9-4ae8-a327-8c4621d90b7c',
    'janin canonero': 'a1e57188-a322-42b2-9d33-b5df08033685',
    'dee tan': '942055eb-54f6-426a-8194-b81ab83669f6',
    'farhan nazardin': '01b597e9-43f0-4363-9ced-8b2613b1bbab',
    'alyssa marie donayre': 'cede181a-edf9-40fa-b917-e208ea15d450',
    'khedive adana': 'cede181a-edf9-40fa-b917-e208ea15d450'
}

def map_person_to_uuids(person_str):
    """Map person name(s) to array of UUIDs"""
    if not person_str or person_str.strip() == '':
        return None

    names = [n.strip().lower() for n in person_str.split(',')]
    uuids = []

    for name in names:
        if name in USER_MAP:
            uuids.append(USER_MAP[name])

    if not uuids:
        return None

    # Return single UUID as string for backwards compatibility with single assignment
    # Return array for multiple assignments
    return uuids[0] if len(uuids) == 1 else uuids

def clean_string(s):
    """Clean string for data - just normalize whitespace and remove problematic characters"""
    if s is None:
        return ''
    s = str(s)
    s = s.replace('\n', ' ')      # Replace newlines with spaces
    s = s.replace('\r', ' ')      # Replace carriage returns
    s = s.replace('\t', ' ')      # Replace tabs
    # Remove any null bytes or other control characters
    s = ''.join(char for char in s if ord(char) >= 32 or char in '\n\r\t')
    return s.strip()

def normalize_status(status):
    """Normalize status values and convert to status IDs"""
    if not status or status == 'Status':
        return ''

    status = status.strip()

    # Normalize common variations to the current six-status workflow.
    status_map = {
        'ben to check': 'Review',
        'bent to check': 'Review',
        'qa': 'Review',
        'on review': 'Review',
        'sent to check': 'Review',
        'sent to client': 'Send to client',
        'send to client': 'Send to client',
        'required revisions': 'Working on it',
        'revisions required': 'Working on it',
        'stuck': 'Working on it',
        'not started': 'To Do',
        'pending': 'To Do',
        'live video': 'Working on it',
        'need video for training': 'Working on it'
    }

    status_lower = status.lower()
    if status_lower in status_map:
        status = status_map[status_lower]

    # Map status labels to their IDs (matching statusDefs in the board)
    label_to_id = {
        'To Do': 'status-1',
        'Working on it': 'status-2',
        'Review': 'status-3',
        'Needs Evidence': 'status-needs-evidence',
        'Send to client': 'status-6',
        'Done': 'status-8'
    }

    # Return the ID if we have a match, otherwise return status-8 (Done) as default
    return label_to_id.get(status, 'status-8' if status else '')

def normalize_priority(priority):
    """Normalize priority values and convert to priority IDs"""
    if not priority or priority == 'Priority':
        return ''

    priority = priority.strip()

    # Map priority labels to their IDs
    label_to_id = {
        'Low': 'priority-1',
        'Medium': 'priority-2',
        'High': 'priority-3',
        'Critical ⚠️️': 'priority-4'
    }

    # Return the ID if we have a match, otherwise empty
    return label_to_id.get(priority, '')

def extract_url(s):
    """Extract just the URL from text that may contain labels"""
    if not s or s.strip() == '':
        return ''

    # Common patterns: "Label - https://..." or "Label https://..." or just "https://..."
    import re

    # Find all URLs
    urls = re.findall(r'https?://[^\s]+', s)

    if urls:
        # Return the first URL found
        return urls[0]

    # If no URL found, return original string cleaned
    return s.strip()

# Load parsed data
with open('monday_data.json', 'r') as f:
    all_boards = json.load(f)

GROUP_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#FF8B94']

print(f'Generating SQL for {len(all_boards)} boards...')

sql_lines = []
sql_lines.append('-- ========================================')
sql_lines.append('-- RESTORE ALL MONDAY.COM DATA TO SUPABASE')
sql_lines.append(f'-- Total: {len(all_boards)} client boards, {sum(sum(len(g["tasks"]) for g in b["groups"]) for b in all_boards)} tasks')
sql_lines.append('-- ========================================\n')
sql_lines.append('-- Clear existing boards (UNCOMMENT TO USE)')
sql_lines.append('-- DELETE FROM client_boards;\n')

for board_idx, board in enumerate(all_boards, 1):
    board_name = clean_string(board['name'])
    initials = ''.join([w[0].upper() for w in board_name.split()[:2] if w])[:2]

    sql_lines.append(f'-- Board {board_idx}: {board_name}')

    groups_list = []
    for group_idx, group in enumerate(board['groups']):
        group_color = GROUP_COLORS[group_idx % len(GROUP_COLORS)]

        tasks_list = []
        for task_idx, task in enumerate(group['tasks']):
            assigned_value = map_person_to_uuids(task.get('person', ''))

            # Format comments with IDs
            comments = []
            for comment_idx, comment in enumerate(task.get('comments', [])):
                comments.append({
                    "id": f"comment-{board_idx}-{group_idx}-{task_idx}-{comment_idx}",
                    "author": clean_string(comment.get('author', 'Unknown')),
                    "text": clean_string(comment.get('text', '')),
                    "timestamp": comment.get('timestamp', ''),
                    "avatar": ""
                })

            # Skip header/template rows (tasks with title "Name" and no real data)
            title = clean_string(task['title'])
            if title in ['Name', 'Item', 'Task'] and task.get('status', '') in ['Status', ''] and not task.get('comments', []):
                continue

            task_obj = {
                "id": f"task-{board_idx}-{group_idx}-{task_idx}",
                "title": title,
                "status": normalize_status(task.get('status', '')),
                "priority": normalize_priority(task.get('priority', '')),
                "dueDate": task.get('date', '2025-11-20'),
                "assignedTo": assigned_value,
                "worksheet": clean_string(extract_url(task.get('worksheet', ''))),
                "clientSheet": clean_string(extract_url(task.get('client_sheet', ''))),
                "comments": comments
            }
            tasks_list.append(task_obj)

        group_obj = {
            "id": f"group-{board_idx}-{group_idx}",
            "title": clean_string(group['title']),
            "color": group_color,
            "tasks": tasks_list
        }
        groups_list.append(group_obj)

    # Build complete board object
    board_obj = {
        "id": f"board-{board_idx}",
        "name": board_name,
        "initials": initials,
        "color": "#FF6B6B",
        "groups": groups_list,
        "statusDefs": [
            {"id": "status-1", "label": "To Do", "color": "#C4C4C4"},
            {"id": "status-2", "label": "Working on it", "color": "#FDAB3D"},
            {"id": "status-3", "label": "Review", "color": "#A25DDC"},
            {"id": "status-needs-evidence", "label": "Needs Evidence", "color": "#579BFC"},
            {"id": "status-6", "label": "Send to client", "color": "#579BFC"},
            {"id": "status-8", "label": "Done", "color": "#00D084"}
        ],
        "priorityDefs": [
            {"id": "priority-1", "label": "Low", "color": "#C4C4C4"},
            {"id": "priority-2", "label": "Medium", "color": "#FDAB3D"},
            {"id": "priority-3", "label": "High", "color": "#E44258"},
            {"id": "priority-4", "label": "Critical ⚠️️", "color": "#FF0000"}
        ]
    }

    # Use json.dumps for proper escaping, then wrap in dollar quotes
    board_json = json.dumps(board_obj, ensure_ascii=False, separators=(',', ':'))

    # Use dollar quoting to avoid escaping issues
    sql_lines.append(f"INSERT INTO client_boards (board_data) VALUES ($${board_json}$$::jsonb);\n")

output_file = '/Users/user/Downloads/bright-forge-portal/RESTORE_ALL_BOARDS.sql'
with open(output_file, 'w') as f:
    f.write('\n'.join(sql_lines))

print(f'✓ Generated {output_file}')
print(f'✓ Total: {len(all_boards)} boards, {sum(sum(len(g["tasks"]) for g in b["groups"]) for b in all_boards)} tasks')
