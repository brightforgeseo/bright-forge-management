#!/usr/bin/env python3
"""Generate SQL in batches to avoid timeout issues"""

import json
from pathlib import Path

# Load the existing generate_sql module functions
exec(open('generate_sql.py').read())

# Load parsed data
with open('monday_data.json', 'r') as f:
    all_boards = json.load(f)

BOARDS_PER_BATCH = 10
total_batches = (len(all_boards) + BOARDS_PER_BATCH - 1) // BOARDS_PER_BATCH

print(f'Creating {total_batches} batch files ({BOARDS_PER_BATCH} boards each)...\n')

for batch_num in range(total_batches):
    start_idx = batch_num * BOARDS_PER_BATCH
    end_idx = min(start_idx + BOARDS_PER_BATCH, len(all_boards))
    batch_boards = all_boards[start_idx:end_idx]

    sql_lines = []
    sql_lines.append(f'-- ========================================')
    sql_lines.append(f'-- RESTORE MONDAY.COM DATA - BATCH {batch_num + 1} of {total_batches}')
    sql_lines.append(f'-- Boards {start_idx + 1}-{end_idx} ({len(batch_boards)} boards)')
    sql_lines.append(f'-- ========================================\n')

    if batch_num == 0:
        sql_lines.append('-- Clear existing boards (UNCOMMENT TO USE - ONLY IN BATCH 1!)')
        sql_lines.append('-- DELETE FROM client_boards;\n')

    board_global_idx = start_idx + 1
    for board in batch_boards:
        board_name = clean_string(board['name'])
        initials = ''.join([w[0].upper() for w in board_name.split()[:2] if w])[:2]

        sql_lines.append(f'-- Board {board_global_idx}: {board_name}')

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
                        "id": f"comment-{board_global_idx}-{group_idx}-{task_idx}-{comment_idx}",
                        "author": clean_string(comment.get('author', 'Unknown')),
                        "text": clean_string(comment.get('text', '')),
                        "timestamp": comment.get('timestamp', ''),
                        "avatar": ""
                    })

                task_obj = {
                    "id": f"task-{board_global_idx}-{group_idx}-{task_idx}",
                    "title": clean_string(task['title']),
                    "status": normalize_status(task.get('status', '')),
                    "priority": clean_string(task.get('priority', '')),
                    "dueDate": task.get('date', '2025-11-20'),
                    "assignedTo": assigned_value,
                    "worksheet": clean_string(extract_url(task.get('worksheet', ''))),
                    "clientSheet": clean_string(extract_url(task.get('client_sheet', ''))),
                    "comments": comments
                }
                tasks_list.append(task_obj)

            group_obj = {
                "id": f"group-{board_global_idx}-{group_idx}",
                "title": clean_string(group['title']),
                "color": group_color,
                "tasks": tasks_list
            }
            groups_list.append(group_obj)

        # Build complete board object
        board_obj = {
            "id": f"board-{board_global_idx}",
            "name": board_name,
            "initials": initials,
            "color": "#FF6B6B",
            "groups": groups_list,
            "statusDefs": [
                {"id": "status-1", "label": "To Do", "color": "#C4C4C4"},
                {"id": "status-2", "label": "Working on it", "color": "#FDAB3D"},
                {"id": "status-3", "label": "Review", "color": "#A25DDC"},
                {"id": "status-4", "label": "QA", "color": "#9CD326"},
                {"id": "status-5", "label": "Ben To Check", "color": "#00C875"},
                {"id": "status-6", "label": "Sent To Client", "color": "#579BFC"},
                {"id": "status-7", "label": "Revisions Required", "color": "#E44258"},
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

        board_global_idx += 1

    output_file = f'/Users/user/Downloads/bright-forge-portal/RESTORE_BATCH_{batch_num + 1}_of_{total_batches}.sql'
    with open(output_file, 'w') as f:
        f.write('\n'.join(sql_lines))

    task_count = sum(sum(len(g['tasks']) for g in b['groups']) for b in batch_boards)
    comment_count = sum(sum(sum(len(t['comments']) for t in g['tasks']) for g in b['groups']) for b in batch_boards)

    print(f'✓ Batch {batch_num + 1}: Boards {start_idx + 1}-{end_idx} ({task_count} tasks, {comment_count} comments)')

print(f'\n✓ Created {total_batches} batch files')
print(f'✓ Run them in order: RESTORE_BATCH_1_of_{total_batches}.sql, then BATCH_2, etc.')
