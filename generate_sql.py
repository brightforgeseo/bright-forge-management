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

def clean_for_json(s):
    """Escape string for JSON"""
    if s is None:
        return ''
    return str(s).replace('\\', '\\\\').replace('"', '\\"').replace('\n', ' ').replace('\r', ' ')

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
    board_name = clean_for_json(board['name'])
    initials = ''.join([w[0].upper() for w in board_name.split()[:2] if w])[:2]

    sql_lines.append(f'-- Board {board_idx}: {board_name}')

    groups_json = []
    for group_idx, group in enumerate(board['groups']):
        group_color = GROUP_COLORS[group_idx % len(GROUP_COLORS)]

        tasks_json = []
        for task_idx, task in enumerate(group['tasks']):
            assigned_value = map_person_to_uuids(task.get('person', ''))

            # Format comments with IDs
            comments = []
            for comment_idx, comment in enumerate(task.get('comments', [])):
                comments.append({
                    "id": f"comment-{board_idx}-{group_idx}-{task_idx}-{comment_idx}",
                    "author": comment.get('author', 'Unknown'),
                    "text": clean_for_json(comment.get('text', '')),
                    "timestamp": comment.get('timestamp', ''),
                    "avatar": ""
                })

            task_obj = {
                "id": f"task-{board_idx}-{group_idx}-{task_idx}",
                "title": clean_for_json(task['title']),
                "status": clean_for_json(task.get('status', '')),
                "priority": clean_for_json(task.get('priority', '')),
                "dueDate": task.get('date', '2025-11-20'),
                "assignedTo": assigned_value,
                "worksheet": clean_for_json(extract_url(task.get('worksheet', ''))),
                "clientSheet": clean_for_json(extract_url(task.get('client_sheet', ''))),
                "comments": comments
            }
            tasks_json.append(json.dumps(task_obj, separators=(',', ':')))

        group_obj = {
            "id": f"group-{board_idx}-{group_idx}",
            "title": clean_for_json(group['title']),
            "color": group_color,
            "tasks": tasks_json
        }

        # Manually build group JSON to embed task JSON strings
        group_str = f'{{"id":"group-{board_idx}-{group_idx}","title":"{clean_for_json(group["title"])}","color":"{group_color}","tasks":[{",".join(tasks_json)}]}}'
        groups_json.append(group_str)

    # Build board JSON
    board_str = f'{{"id":"board-{board_idx}","name":"{board_name}","initials":"{initials}","color":"#FF6B6B","groups":[{",".join(groups_json)}],"statusDefs":[{{"id":"status-1","label":"To Do","color":"#C4C4C4"}},{{"id":"status-2","label":"In Progress","color":"#FDAB3D"}},{{"id":"status-3","label":"Ben To Check","color":"#00C875"}},{{"id":"status-4","label":"Sent To Client","color":"#579BFC"}},{{"id":"status-5","label":"Revisions Required","color":"#E44258"}},{{"id":"status-6","label":"Done","color":"#00D084"}}],"priorityDefs":[{{"id":"priority-1","label":"Low","color":"#C4C4C4"}},{{"id":"priority-2","label":"Medium","color":"#FDAB3D"}},{{"id":"priority-3","label":"High","color":"#E44258"}},{{"id":"priority-4","label":"Critical ⚠️️","color":"#FF0000"}}]}}'

    sql_lines.append(f"INSERT INTO client_boards (board_data) VALUES ('{board_str}'::jsonb);\n")

output_file = '/Users/user/Downloads/bright-forge-portal/RESTORE_ALL_BOARDS.sql'
with open(output_file, 'w') as f:
    f.write('\n'.join(sql_lines))

print(f'✓ Generated {output_file}')
print(f'✓ Total: {len(all_boards)} boards, {sum(sum(len(g["tasks"]) for g in b["groups"]) for b in all_boards)} tasks')
