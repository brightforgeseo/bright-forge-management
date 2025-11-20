
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Sparkles, ChevronDown, ChevronUp, ChevronRight, Trash2, Briefcase, CheckCircle2, Settings, Mail, Phone, Globe, X, Image as ImageIcon, Edit3, Palette, Loader2, Upload, UserCircle, Link as LinkIcon, MessageCircle, Send } from 'lucide-react';
import { Task, TaskGroup, User, ClientBoard, ToastType, LabelDefinition, Profile, TaskComment } from '../types';
import { generateProjectTasks } from '../services/geminiService';
import { fetchClientBoards, saveClientBoard, deleteClientBoard, uploadFile, fetchProfiles, createNotification } from '../services/databaseService';

interface TaskBoardProps {
  currentUser: User;
  addToast: (type: ToastType, message: string) => void;
}

const GROUP_COLORS = [
  '#f97316', '#3b82f6', '#ef4444', '#10b981', '#a855f7', '#ec4899'
];

const LABEL_COLORS = [
  '#94a3b8', '#22c55e', '#eab308', '#ef4444', '#3b82f6', '#a855f7', '#ec4899', '#f97316', '#06b6d4', '#14b8a6'
];

const DEFAULT_STATUS_DEFS: LabelDefinition[] = [
  { id: 's1', label: 'Done', color: '#22c55e' },
  { id: 's2', label: 'Working on it', color: '#eab308' },
  { id: 's3', label: 'Stuck', color: '#ef4444' },
  { id: 's4', label: 'Not Started', color: '#94a3b8' },
];

const DEFAULT_PRIORITY_DEFS: LabelDefinition[] = [
  { id: 'p1', label: 'High', color: '#a855f7' },
  { id: 'p2', label: 'Medium', color: '#3b82f6' },
  { id: 'p3', label: 'Low', color: '#94a3b8' },
];

const generateId = () => Date.now().toString() + Math.random().toString(36).substr(2, 9);

// Helper function to detect @mentions in text
const detectMentions = (text: string, profiles: Profile[]): string[] => {
  const mentionedIds: string[] = [];

  // Check for @everyone
  if (text.toLowerCase().includes('@everyone')) {
    return profiles.map(p => p.id);
  }

  // Check for @name mentions
  profiles.forEach(profile => {
    const name = profile.full_name || '';
    const firstName = name.split(' ')[0].toLowerCase();
    const fullName = name.toLowerCase();

    // Check if text mentions this person
    if (text.toLowerCase().includes(`@${firstName}`) || text.toLowerCase().includes(`@${fullName}`)) {
      mentionedIds.push(profile.id);
    }
  });

  return mentionedIds;
};

// Play notification sound - LOUD bell sound
const playNotificationSound = () => {
  try {
    // Create oscillator for a loud bell-like sound
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    // Create three oscillators for a rich bell sound
    const oscillator1 = audioContext.createOscillator();
    const oscillator2 = audioContext.createOscillator();
    const oscillator3 = audioContext.createOscillator();

    const gainNode = audioContext.createGain();

    // Bell frequencies
    oscillator1.frequency.value = 800;
    oscillator2.frequency.value = 1000;
    oscillator3.frequency.value = 1200;

    oscillator1.connect(gainNode);
    oscillator2.connect(gainNode);
    oscillator3.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Loud volume with decay
    gainNode.gain.value = 0.8;
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator1.start(audioContext.currentTime);
    oscillator2.start(audioContext.currentTime);
    oscillator3.start(audioContext.currentTime);

    oscillator1.stop(audioContext.currentTime + 0.5);
    oscillator2.stop(audioContext.currentTime + 0.5);
    oscillator3.stop(audioContext.currentTime + 0.5);

    console.log('🔔 Notification sound played!');
  } catch (error) {
    console.error('Failed to play notification sound:', error);
  }
};

const TaskBoard: React.FC<TaskBoardProps> = ({ currentUser, addToast }) => {
  
  const [clients, setClients] = useState<ClientBoard[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [teamProfiles, setTeamProfiles] = useState<Profile[]>([]);

  // Fetch Data on Mount
  useEffect(() => {
    const loadData = async () => {
      setIsLoadingData(true);
      const [boards, profiles] = await Promise.all([fetchClientBoards(), fetchProfiles()]);

      // Check if we should open a task modal from notification BEFORE setting default board
      const openTaskData = localStorage.getItem('openTaskModal');
      let shouldOpenTask = false;
      let targetBoardId = boards.length > 0 ? boards[0].id : '';

      if (openTaskData) {
        try {
          const linkData = JSON.parse(openTaskData);
          const { taskId, boardId, groupId, boardName } = linkData;
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('📂 NOTIFICATION DEEP LINK DEBUG');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('Looking for:');
          console.log('  boardId:', boardId);
          console.log('  groupId:', groupId);
          console.log('  taskId:', taskId);
          console.log('  boardName:', boardName);
          console.log('');
          console.log('Available boards:');
          boards.forEach((b, idx) => {
            console.log(`  [${idx}] id: "${b.id}" name: "${b.name}"`);
          });
          console.log('');

          // Find the board, group, and task
          const board = boards.find(b => b.id === boardId);
          if (board) {
            console.log('✅ FOUND BOARD:', board.name);
            targetBoardId = board.id;

            console.log('Available groups in this board:');
            board.groups.forEach((g, idx) => {
              console.log(`  [${idx}] id: "${g.id}" title: "${g.title}"`);
            });

            const group = board.groups.find(g => g.id === groupId);
            if (group) {
              console.log('✅ FOUND GROUP:', group.title);

              console.log('Available tasks in this group:');
              group.tasks.forEach((t, idx) => {
                console.log(`  [${idx}] id: "${t.id}" title: "${t.title}"`);
              });

              const task = group.tasks.find(t => t.id === taskId);
              if (task) {
                console.log('✅ FOUND TASK:', task.title);
                console.log('Opening task modal in 100ms...');
                shouldOpenTask = true;
                // Set the task modal AFTER state is updated
                setTimeout(() => {
                  console.log('🎯 Opening task modal NOW');
                  setTaskModal({
                    task,
                    groupId: group.id,
                    clientId: board.id,
                    groupTitle: group.title,
                    groupColor: group.color
                  });
                }, 100);
              } else {
                console.error('❌ TASK NOT FOUND. Looking for taskId:', taskId);
              }
            } else {
              console.error('❌ GROUP NOT FOUND. Looking for groupId:', groupId);
            }
          } else {
            console.error('❌ BOARD NOT FOUND. Looking for boardId:', boardId);
          }
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          localStorage.removeItem('openTaskModal');
        } catch (e) {
          console.error('Error opening task modal:', e);
        }
      }

      if (boards.length > 0) {
        setClients(boards);
        setSelectedClientId(targetBoardId);
      }
      setTeamProfiles(profiles);
      setIsLoadingData(false);
    };
    loadData();
  }, []);

  // Debounced Save Logic
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerSave = useCallback((updatedClients: ClientBoard[], changedClientId: string) => {
    setClients(updatedClients);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      const clientToSave = updatedClients.find(c => c.id === changedClientId);
      if (clientToSave) {
        await saveClientBoard(clientToSave);
      }
    }, 1500);
  }, []);

  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [goal, setGoal] = useState('');
  const [loading, setLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [newItemText, setNewItemText] = useState<{ [key: string]: string }>({});
  const [selectedPersonFilter, setSelectedPersonFilter] = useState<string>(''); // '' = all, or profile ID
  const [isPersonFilterOpen, setIsPersonFilterOpen] = useState(false);
  
  const [isEditingClient, setIsEditingClient] = useState(false);
  const [editForm, setEditForm] = useState<{name: string, email: string, phone: string, website: string, logoUrl: string}>({
    name: '', email: '', phone: '', website: '', logoUrl: ''
  });
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [activePicker, setActivePicker] = useState<{ type: 'status' | 'priority', taskId: string, groupId: string, clientId: string, anchor: HTMLElement | null } | null>(null);
  const [activePersonPicker, setActivePersonPicker] = useState<{ taskId: string, groupId: string, clientId: string, anchor: HTMLElement | null } | null>(null);
  const [isLabelEditorOpen, setIsLabelEditorOpen] = useState(false);
  const [labelEditorType, setLabelEditorType] = useState<'status' | 'priority'>('status');
  const [taskModal, setTaskModal] = useState<{ task: Task, groupId: string, clientId: string, groupTitle: string, groupColor: string } | null>(null);
  const [newComment, setNewComment] = useState('');
  const [mentionDropdown, setMentionDropdown] = useState<{ show: boolean, search: string, position: number } | null>(null);

  const activeClient = clients.find(c => c.id === selectedClientId);

  useEffect(() => {
    if (activeClient && isEditingClient) {
      setEditForm({
        name: activeClient.name,
        email: activeClient.email || '',
        phone: activeClient.phone || '',
        website: activeClient.website || '',
        logoUrl: activeClient.logoUrl || ''
      });
    }
  }, [isEditingClient, activeClient]);

  const handleAddClient = async () => {
    if (!newClientName.trim()) return;
    const newClient: ClientBoard = {
      id: generateId(),
      name: newClientName,
      initials: newClientName.substring(0, 2).toUpperCase(),
      color: GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)],
      statusDefs: DEFAULT_STATUS_DEFS,
      priorityDefs: DEFAULT_PRIORITY_DEFS,
      groups: []
    };
    const newClientList = [...clients, newClient];
    setClients(newClientList);
    setSelectedClientId(newClient.id);
    setNewClientName('');
    setIsAddingClient(false);
    await saveClientBoard(newClient);
    addToast('success', `Client "${newClientName}" created.`);
  };

  const handleUpdateClient = () => {
    if (!activeClient) return;
    const updatedClients = clients.map(c => {
      if (c.id === activeClient.id) {
        return {
          ...c,
          name: editForm.name,
          initials: editForm.name.substring(0, 2).toUpperCase(),
          email: editForm.email,
          phone: editForm.phone,
          website: editForm.website,
          logoUrl: editForm.logoUrl
        };
      }
      return c;
    });
    triggerSave(updatedClients, activeClient.id);
    setIsEditingClient(false);
    addToast('success', 'Client details updated.');
  };

  const handleDeleteClient = async () => {
      if (!activeClient || !window.confirm(`Delete client "${activeClient.name}"? This cannot be undone.`)) return;
      await deleteClientBoard(activeClient.id);
      const newClients = clients.filter(c => c.id !== activeClient.id);
      setClients(newClients);
      if (newClients.length > 0) setSelectedClientId(newClients[0].id);
      else setSelectedClientId('');
      setIsEditingClient(false);
      addToast('info', 'Client deleted.');
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
     if (!e.target.files || !e.target.files[0]) return;
     const file = e.target.files[0];
     const url = await uploadFile(file);
     if (url) {
        setEditForm(prev => ({ ...prev, logoUrl: url }));
     } else {
        addToast('error', 'Failed to upload logo');
     }
  };

  const updateClient = (clientId: string, updateFn: (c: ClientBoard) => ClientBoard) => {
    const updatedClients = clients.map(c => c.id === clientId ? updateFn(c) : c);
    triggerSave(updatedClients, clientId);
  };

  const handleGenerateGroup = async (clientId: string) => {
      if (!goal.trim()) return;
      setLoading(true);
      try {
        const rawTasks = await generateProjectTasks(goal);
        const client = clients.find(c => c.id === clientId);
        if (!client) throw new Error("Client not found");
        const getStatusId = (text: string) => {
            if (!text) return client.statusDefs[client.statusDefs.length - 1].id;
            const match = client.statusDefs.find(d => d.label.toLowerCase().includes(text.toLowerCase()));
            return match ? match.id : client.statusDefs[client.statusDefs.length - 1].id;
        }
        const getPriorityId = (text: string) => {
            if (!text) return client.priorityDefs[client.priorityDefs.length - 1].id;
            const match = client.priorityDefs.find(d => d.label.toLowerCase().includes(text.toLowerCase()));
            return match ? match.id : client.priorityDefs[client.priorityDefs.length - 1].id;
        }
        const newTasks: Task[] = rawTasks.map(t => ({
          ...t,
          id: generateId(),
          status: getStatusId(t.status),
          priority: getPriorityId(t.priority),
        }));
        const newGroup: TaskGroup = {
          id: generateId(),
          title: goal,
          color: GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)],
          tasks: newTasks,
          isCollapsed: false
        };
        updateClient(clientId, c => ({ ...c, groups: [newGroup, ...c.groups] }));
        setGoal('');
        setIsGenerating(false);
        addToast('success', 'AI plan generated successfully.');
      } catch (error) {
        addToast('error', 'Failed to generate plan.');
      } finally {
        setLoading(false);
      }
  };
  
  const handleAddGroup = (cid: string) => updateClient(cid, c => ({ ...c, groups: [...c.groups, { id: generateId(), title: 'New Project Phase', color: GROUP_COLORS[0], tasks: [], isCollapsed: false }] }));
  const toggleCollapse = (cid: string, gid: string) => updateClient(cid, c => ({ ...c, groups: c.groups.map(g => g.id === gid ? { ...g, isCollapsed: !g.isCollapsed } : g) }));
  const handleDeleteGroup = (cid: string, gid: string) => updateClient(cid, c => ({ ...c, groups: c.groups.filter(g => g.id !== gid) }));
  const updateGroupTitle = (cid: string, gid: string, t: string) => updateClient(cid, c => ({ ...c, groups: c.groups.map(g => g.id === gid ? { ...g, title: t } : g) }));
  const handleAddTask = (cid: string, gid: string) => {
      const text = newItemText[gid];
      if(!text?.trim()) return;
      const client = clients.find(c => c.id === cid);
      if(!client) return;
      const newTask: Task = { id: generateId(), title: text, status: client.statusDefs[client.statusDefs.length-1].id, priority: client.priorityDefs[client.priorityDefs.length-1].id, dueDate: new Date().toISOString().split('T')[0] };
      updateClient(cid, c => ({ ...c, groups: c.groups.map(g => g.id === gid ? { ...g, tasks: [...g.tasks, newTask] } : g) }));
      setNewItemText(prev => ({ ...prev, [gid]: '' }));
  };
  const updateTaskField = (cid: string, gid: string, tid: string, f: keyof Task, v: string) => {
    console.log('updateTaskField called:', { f, v, tid, gid });

    updateClient(cid, c => {
      // Find the Done status ID from status definitions
      const doneStatusId = c.statusDefs.find(s => s.label === 'Done')?.id;
      console.log('Done status ID:', doneStatusId, 'Selected value:', v);

      // Find the task and current group
      let currentTask: Task | undefined;
      let currentGroupId: string | undefined;
      let currentGroup: TaskGroup | undefined;

      for (const group of c.groups) {
        const task = group.tasks.find(t => t.id === tid);
        if (task) {
          currentTask = task;
          currentGroupId = group.id;
          currentGroup = group;
          break;
        }
      }

      if (!currentTask) {
        console.log('Task not found!');
        return c;
      }

      const isCurrentlyDone = currentTask.status === doneStatusId;
      const isChangingToDone = f === 'status' && v === doneStatusId;
      const isChangingFromDone = f === 'status' && isCurrentlyDone && v !== doneStatusId;

      console.log('Task status check:', { isCurrentlyDone, isChangingToDone, isChangingFromDone, currentGroup: currentGroup?.title });

      // CASE 1: Moving TO Done group
      if (isChangingToDone && currentGroup?.title !== 'Done') {
        console.log('Moving task to Done group');

        // Store original group ID in task metadata
        const taskToMove = {
          ...currentTask,
          [f]: v,
          originalGroupId: currentGroupId // Remember where it came from
        };

        let doneGroupExists = false;
        const updatedGroups = c.groups.map(g => {
          if (g.title === 'Done') {
            doneGroupExists = true;
            console.log('Adding task to existing Done group');
            return {
              ...g,
              tasks: [...g.tasks, taskToMove]
            };
          } else if (g.id === currentGroupId) {
            console.log('Removing task from source group');
            return {
              ...g,
              tasks: g.tasks.filter(t => t.id !== tid)
            };
          }
          return g;
        });

        if (!doneGroupExists) {
          console.log('Creating new Done group');
          updatedGroups.push({
            id: generateId(),
            title: 'Done',
            color: '#00D084',
            tasks: [taskToMove]
          });
        }

        return { ...c, groups: updatedGroups };
      }

      // CASE 2: Moving FROM Done group back to original
      if (isChangingFromDone && currentGroup?.title === 'Done') {
        console.log('Moving task back from Done group');

        const taskToMove = { ...currentTask, [f]: v };
        const originalGroupId = (currentTask as any).originalGroupId;

        console.log('Original group ID:', originalGroupId);

        // Find the original group, or use first non-Done group
        let targetGroupId = originalGroupId;
        if (!targetGroupId || !c.groups.find(g => g.id === targetGroupId)) {
          const firstNonDoneGroup = c.groups.find(g => g.title !== 'Done');
          targetGroupId = firstNonDoneGroup?.id;
          console.log('Original group not found, using first non-Done group:', targetGroupId);
        }

        if (!targetGroupId) {
          console.log('No target group found, keeping in Done');
          // Just update status in place
          return { ...c, groups: c.groups.map(g => g.id === gid ? { ...g, tasks: g.tasks.map(t => t.id === tid ? { ...t, [f]: v } : t) } : g) };
        }

        // Remove originalGroupId from task when moving back
        delete (taskToMove as any).originalGroupId;

        const updatedGroups = c.groups.map(g => {
          if (g.id === targetGroupId) {
            console.log('Adding task to target group:', g.title);
            return {
              ...g,
              tasks: [...g.tasks, taskToMove]
            };
          } else if (g.id === currentGroupId) {
            console.log('Removing task from Done group');
            return {
              ...g,
              tasks: g.tasks.filter(t => t.id !== tid)
            };
          }
          return g;
        });

        return { ...c, groups: updatedGroups };
      }

      // CASE 3: Normal field update (not related to Done group moves)
      return { ...c, groups: c.groups.map(g => g.id === gid ? { ...g, tasks: g.tasks.map(t => t.id === tid ? { ...t, [f]: v } : t) } : g) };
    });
  };
  const deleteTask = (cid: string, gid: string, tid: string) => updateClient(cid, c => ({ ...c, groups: c.groups.map(g => g.id === gid ? { ...g, tasks: g.tasks.filter(t => t.id !== tid) } : g) }));
  const moveTask = (cid: string, gid: string, tid: string, dir: 'up'|'down') => {
      updateClient(cid, c => {
          const gs = c.groups.map(g => {
              if(g.id !== gid) return g;
              const idx = g.tasks.findIndex(t => t.id === tid);
              if(idx === -1) return g;
              const tasks = [...g.tasks];
              if(dir === 'up' && idx > 0) [tasks[idx], tasks[idx-1]] = [tasks[idx-1], tasks[idx]];
              else if(dir === 'down' && idx < tasks.length-1) [tasks[idx], tasks[idx+1]] = [tasks[idx+1], tasks[idx]];
              return { ...g, tasks };
          });
          return { ...c, groups: gs };
      });
  };
  const handleLabelClick = (e: React.MouseEvent, type: 'status'|'priority', tid: string, gid: string, cid: string) => {
      e.stopPropagation();
      setActivePicker({ type, taskId: tid, groupId: gid, clientId: cid, anchor: e.currentTarget as HTMLElement });
  };
  const handleSelectLabel = (defId: string) => {
      if(activePicker) {
        updateTaskField(activePicker.clientId, activePicker.groupId, activePicker.taskId, activePicker.type as keyof Task, defId);
        // Update modal if it's open for this task
        if (taskModal && taskModal.task.id === activePicker.taskId) {
          setTaskModal({ ...taskModal, task: { ...taskModal.task, [activePicker.type]: defId } });
        }
        setActivePicker(null);
      }
  };
  const handlePersonClick = (e: React.MouseEvent, tid: string, gid: string, cid: string) => {
      e.stopPropagation();
      setActivePersonPicker({ taskId: tid, groupId: gid, clientId: cid, anchor: e.currentTarget as HTMLElement });
  };
  const handleSelectPerson = (profileId: string) => {
      if(activePersonPicker) {
          // Get current task
          const client = clients.find(c => c.id === activePersonPicker.clientId);
          const group = client?.groups.find(g => g.id === activePersonPicker.groupId);
          const task = group?.tasks.find(t => t.id === activePersonPicker.taskId);

          if (task) {
              // Toggle person in/out of assignedTo array
              const currentAssigned = Array.isArray(task.assignedTo) ? task.assignedTo : (task.assignedTo ? [task.assignedTo] : []);

              let newAssigned: string | string[];
              if (currentAssigned.includes(profileId)) {
                  // Remove person
                  const filtered = currentAssigned.filter(id => id !== profileId);
                  newAssigned = filtered.length === 0 ? '' : (filtered.length === 1 ? filtered[0] : filtered);
              } else {
                  // Add person
                  const updated = [...currentAssigned, profileId];
                  newAssigned = updated.length === 1 ? updated[0] : updated;
              }

              updateTaskField(activePersonPicker.clientId, activePersonPicker.groupId, activePersonPicker.taskId, 'assignedTo', newAssigned as string);

              // Update modal if it's open for this task
              if (taskModal && taskModal.task.id === activePersonPicker.taskId) {
                setTaskModal({ ...taskModal, task: { ...taskModal.task, assignedTo: newAssigned } });
              }
          }
          // Don't close picker so user can select multiple people
      }
  };
  const getLabelDef = (cid: string, id: string, type: 'status'|'priority') => {
     const c = clients.find(cl => cl.id === cid);
     if(!c) return { label: 'Unknown', color: '#ccc', id: 'unknown' };
     const defs = type === 'status' ? c.statusDefs : c.priorityDefs;
     return defs.find(d => d.id === id) || defs[defs.length-1];
  };

  const handleUpdateLabel = (cid: string, type: 'status'|'priority', id: string, field: string, val: string) => {
      updateClient(cid, c => {
          const defs = type === 'status' ? c.statusDefs : c.priorityDefs;
          const newDefs = defs.map(d => d.id === id ? { ...d, [field]: val } : d);
          return { ...c, [type === 'status' ? 'statusDefs' : 'priorityDefs']: newDefs };
      });
  }
  const handleAddLabel = (cid: string, type: 'status'|'priority') => updateClient(cid, c => {
      const newDef = { id: generateId(), label: 'New Label', color: '#94a3b8' };
      return { ...c, [type === 'status' ? 'statusDefs' : 'priorityDefs']: [...(type === 'status' ? c.statusDefs : c.priorityDefs), newDef] };
  });
  const handleDeleteLabel = (cid: string, type: 'status'|'priority', id: string) => {
      if(!window.confirm("Delete?")) return;
      updateClient(cid, c => {
          const defs = type === 'status' ? c.statusDefs : c.priorityDefs;
          if(defs.length <= 1) return c;
          const newDefs = defs.filter(d => d.id !== id);
          const updatedGroups = c.groups.map(g => ({ ...g, tasks: g.tasks.map(t => {
              if(type === 'status' && t.status === id) return { ...t, status: newDefs[0].id };
              if(type === 'priority' && t.priority === id) return { ...t, priority: newDefs[0].id };
              return t;
          })}));
          return { ...c, groups: updatedGroups, [type === 'status' ? 'statusDefs' : 'priorityDefs']: newDefs };
      });
  };

  if (isLoadingData) return <div className="flex h-full items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-brand-500" /></div>;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white relative">
      {/* Header - Fixed */}
      <div className="flex-none px-8 py-6 border-b border-slate-100 bg-white flex justify-between items-start z-20">
         <div className="space-y-3">
          <div className="relative flex items-center gap-4">
            <button 
              onClick={() => setIsClientDropdownOpen(!isClientDropdownOpen)}
              className="text-2xl font-bold text-slate-900 flex items-center gap-2 hover:bg-slate-50 px-2 py-1 -ml-2 rounded-lg transition-colors"
            >
              {activeClient ? activeClient.name : 'Select Client'} 
              <ChevronDown className="w-5 h-5 text-slate-400" />
            </button>
            
            {activeClient && (
                <button onClick={() => setIsEditingClient(true)} className="text-slate-400 hover:text-brand-600 transition-colors">
                    <Settings className="w-5 h-5" />
                </button>
            )}

            {isClientDropdownOpen && (
              <>
              <div className="fixed inset-0 z-30" onClick={() => setIsClientDropdownOpen(false)}></div>
              <div className="absolute top-full left-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-40 animate-fadeIn">
                 <div className="p-2 max-h-60 overflow-y-auto">
                    {clients.map(c => (
                      <button
                        key={c.id}
                        onClick={() => { setSelectedClientId(c.id); setIsClientDropdownOpen(false); }}
                        className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 hover:bg-slate-50 transition-colors ${c.id === selectedClientId ? 'bg-brand-50 text-brand-900' : 'text-slate-700'}`}
                      >
                        <div className="w-8 h-8 rounded bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 uppercase border border-slate-200">
                           {c.logoUrl ? <img src={c.logoUrl} className="w-full h-full object-cover rounded" /> : c.initials}
                        </div>
                        <span className="font-medium truncate">{c.name}</span>
                        {c.id === selectedClientId && <CheckCircle2 className="w-4 h-4 text-brand-600 ml-auto" />}
                      </button>
                    ))}
                 </div>
                 <div className="p-2 border-t border-slate-100 bg-slate-50">
                    {!isAddingClient ? (
                      <button onClick={() => setIsAddingClient(true)} className="w-full py-2 flex items-center justify-center gap-2 text-sm font-semibold text-brand-600 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all">
                        <Plus className="w-4 h-4" /> Add Client
                      </button>
                    ) : (
                      <div className="space-y-2">
                         <input 
                           autoFocus
                           className="w-full p-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-brand-500"
                           placeholder="Client Name"
                           value={newClientName}
                           onChange={(e) => setNewClientName(e.target.value)}
                           onKeyDown={(e) => e.key === 'Enter' && handleAddClient()}
                         />
                         <button onClick={handleAddClient} className="w-full py-1.5 bg-brand-600 text-white text-xs font-bold rounded-lg">Create</button>
                      </div>
                    )}
                 </div>
              </div>
              </>
            )}
          </div>

          {/* Active Client Meta */}
          {activeClient && (
              <div className="flex items-center gap-4 text-sm text-slate-500">
                  {activeClient.email && (
                      <a href={`mailto:${activeClient.email}`} className="flex items-center gap-1.5 hover:text-brand-600">
                          <Mail className="w-3.5 h-3.5" /> {activeClient.email}
                      </a>
                  )}
                   {activeClient.phone && (
                      <span className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5" /> {activeClient.phone}
                      </span>
                  )}
                  {activeClient.website && (
                      <a href={activeClient.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-brand-600">
                          <Globe className="w-3.5 h-3.5" /> Website
                      </a>
                  )}
              </div>
          )}
         </div>

         {activeClient && (
             <div className="flex items-center gap-2">
               {/* Person Filter Dropdown */}
               <div className="relative">
                 <button
                   onClick={() => setIsPersonFilterOpen(!isPersonFilterOpen)}
                   className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-sm font-semibold text-slate-700"
                 >
                   <UserCircle className="w-4 h-4" />
                   {selectedPersonFilter ? teamProfiles.find(p => p.id === selectedPersonFilter)?.full_name || 'All Tasks' : 'All Tasks'}
                   <ChevronDown className="w-4 h-4 text-slate-400" />
                 </button>
                 {isPersonFilterOpen && (
                   <>
                     <div className="fixed inset-0 z-30" onClick={() => setIsPersonFilterOpen(false)}></div>
                     <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-40 animate-fadeIn">
                       <div className="p-2 max-h-64 overflow-y-auto">
                         <button
                           onClick={() => { setSelectedPersonFilter(''); setIsPersonFilterOpen(false); }}
                           className={`w-full text-left px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium ${selectedPersonFilter === '' ? 'bg-brand-50 text-brand-700' : 'text-slate-700'}`}
                         >
                           All Tasks
                           {selectedPersonFilter === '' && <CheckCircle2 className="w-4 h-4 text-brand-600 ml-auto inline" />}
                         </button>
                         {teamProfiles.map((profile) => (
                           <button
                             key={profile.id}
                             onClick={() => { setSelectedPersonFilter(profile.id); setIsPersonFilterOpen(false); }}
                             className={`w-full text-left px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium flex items-center gap-2 ${selectedPersonFilter === profile.id ? 'bg-brand-50 text-brand-700' : 'text-slate-700'}`}
                           >
                             {profile.avatar_url ? (
                               <img src={profile.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                             ) : (
                               <div className="w-5 h-5 rounded-full bg-brand-100 flex items-center justify-center text-[10px] font-bold text-brand-700">
                                 {profile.full_name?.charAt(0) || '?'}
                               </div>
                             )}
                             <span className="flex-1">{profile.full_name || profile.id.substring(0, 8)}</span>
                             {selectedPersonFilter === profile.id && <CheckCircle2 className="w-4 h-4 text-brand-600" />}
                           </button>
                         ))}
                       </div>
                     </div>
                   </>
                 )}
               </div>

               {isGenerating ? (
                 <div className="flex items-center gap-2 bg-white shadow-lg border border-brand-100 rounded-xl p-1 pr-2 animate-slideIn">
                    <input
                      autoFocus
                      value={goal}
                      onChange={(e) => setGoal(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleGenerateGroup(activeClient.id)}
                      placeholder="e.g. Launch Q4 Campaign"
                      className="outline-none text-sm px-3 py-1.5 w-64"
                    />
                    <button
                      onClick={() => handleGenerateGroup(activeClient.id)}
                      disabled={loading}
                      className="bg-brand-600 text-white p-1.5 rounded-lg hover:bg-brand-700 disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    </button>
                    <button onClick={() => setIsGenerating(false)} className="text-slate-400 hover:text-slate-600 p-1"><X className="w-4 h-4" /></button>
                 </div>
               ) : (
                 <button
                   onClick={() => setIsGenerating(true)}
                   className="flex items-center gap-2 px-4 py-2 bg-brand-50 text-brand-700 border border-brand-200 rounded-lg hover:bg-brand-100 transition-colors text-sm font-semibold"
                 >
                    <Sparkles className="w-4 h-4" />
                    AI Plan Generator
                 </button>
               )}
               <button
                  onClick={() => handleAddGroup(activeClient.id)}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm font-semibold shadow-lg shadow-slate-900/20"
               >
                  <Plus className="w-4 h-4" /> New Group
               </button>
             </div>
         )}
      </div>

      {/* Board Area - Scrollable */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-8 pt-2 bg-white">
        {activeClient ? (
            <div className="space-y-8 pb-20">
               {activeClient.groups.map((group) => {
                 // Filter tasks by selected person
                 const filteredTasks = selectedPersonFilter
                   ? group.tasks.filter(task => {
                       const assignedIds = Array.isArray(task.assignedTo) ? task.assignedTo : (task.assignedTo ? [task.assignedTo] : []);
                       return assignedIds.includes(selectedPersonFilter);
                     })
                   : group.tasks;

                 // Don't show group if no tasks match filter
                 if (selectedPersonFilter && filteredTasks.length === 0) return null;

                 return (
                 <div key={group.id} className="animate-fadeIn">
                    {/* Group Header */}
                    <div className="flex items-center gap-2 mb-2 group cursor-pointer">
                       <button onClick={() => toggleCollapse(activeClient.id, group.id)} className="p-1 hover:bg-slate-100 rounded text-slate-400 transition-colors">
                          {group.isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                       </button>
                       <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors flex-1">
                           <input
                             value={group.title}
                             onChange={(e) => updateGroupTitle(activeClient.id, group.id, e.target.value)}
                             className={`font-bold text-lg bg-transparent outline-none text-[${group.color}] w-full`}
                             style={{ color: group.color }}
                           />
                           <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                             {filteredTasks.length}{selectedPersonFilter && ` of ${group.tasks.length}`} items
                           </span>
                       </div>
                       <button onClick={(e) => { e.stopPropagation(); handleDeleteGroup(activeClient.id, group.id); }} className="opacity-0 group-hover:opacity-100 p-2 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded transition-all">
                           <Trash2 className="w-4 h-4" />
                       </button>
                    </div>

                    {/* Tasks Table */}
                    {!group.isCollapsed && (
                      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden ml-8">
                         <div className="overflow-x-auto custom-scrollbar">
                           <table className="w-full min-w-[800px]">
                              <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider w-1/4 sticky left-0 bg-slate-50 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">Item</th>
                                  <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider w-40">Person</th>
                                  <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider w-40">Status</th>
                                  <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider w-40">Priority</th>
                                  <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider w-40">Due Date</th>
                                  <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider w-48">Worksheet</th>
                                  <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider w-48">Client Sheet</th>
                                  <th className="w-10"></th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                 {filteredTasks.map((task) => {
                                    const statusDef = getLabelDef(activeClient.id, task.status, 'status');
                                    const priorityDef = getLabelDef(activeClient.id, task.priority, 'priority');
                                    
                                    return (
                                      <tr key={task.id} className="group hover:bg-slate-50/80 transition-colors">
                                        <td className="py-2 px-4 sticky left-0 bg-white group-hover:bg-slate-50/80 transition-colors z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] border-r border-transparent group-hover:border-slate-100">
                                            <div className="flex items-center gap-3">
                                                <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => moveTask(activeClient.id, group.id, task.id, 'up')}><ChevronUp className="w-3 h-3 text-slate-400 hover:text-brand-600" /></button>
                                                    <button onClick={() => moveTask(activeClient.id, group.id, task.id, 'down')}><ChevronDown className="w-3 h-3 text-slate-400 hover:text-brand-600" /></button>
                                                </div>
                                                <div className="w-1.5 h-8 rounded-full" style={{ backgroundColor: group.color }}></div>
                                                <input
                                                  value={task.title}
                                                  onChange={(e) => updateTaskField(activeClient.id, group.id, task.id, 'title', e.target.value)}
                                                  onClick={() => setTaskModal({ task, groupId: group.id, clientId: activeClient.id, groupTitle: group.title, groupColor: group.color })}
                                                  className="flex-1 bg-transparent outline-none text-sm font-medium text-slate-700 cursor-pointer hover:text-brand-600"
                                                />
                                                {(task.comments && task.comments.length > 0) && (
                                                  <MessageCircle className="w-4 h-4 text-slate-400" />
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-2 px-2 text-center">
                                           {(() => {
                                              const assignedIds = Array.isArray(task.assignedTo) ? task.assignedTo : (task.assignedTo ? [task.assignedTo] : []);
                                              const assignedProfiles = assignedIds.map(id => teamProfiles.find(p => p.id === id)).filter(Boolean);

                                              return (
                                                <button
                                                  onClick={(e) => handlePersonClick(e, task.id, group.id, activeClient.id)}
                                                  className="w-full py-1.5 px-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded transition-colors flex items-center justify-center gap-1"
                                                >
                                                  <UserCircle className="w-3.5 h-3.5" />
                                                  <span className="truncate">
                                                    {assignedProfiles.length > 0
                                                      ? assignedProfiles.length === 1
                                                        ? assignedProfiles[0]?.full_name
                                                        : `${assignedProfiles.length} people`
                                                      : 'Unassigned'}
                                                  </span>
                                                </button>
                                              );
                                           })()}
                                        </td>
                                        <td className="py-2 px-2 text-center">
                                           <button
                                             onClick={(e) => handleLabelClick(e, 'status', task.id, group.id, activeClient.id)}
                                             className="w-full py-1.5 text-xs font-bold text-white rounded shadow-sm hover:opacity-90 transition-opacity"
                                             style={{ backgroundColor: statusDef.color }}
                                           >
                                              {statusDef.label}
                                           </button>
                                        </td>
                                        <td className="py-2 px-2 text-center">
                                           <button 
                                             onClick={(e) => handleLabelClick(e, 'priority', task.id, group.id, activeClient.id)}
                                             className="w-full py-1.5 text-xs font-bold text-white rounded shadow-sm hover:opacity-90 transition-opacity"
                                             style={{ backgroundColor: priorityDef.color }}
                                           >
                                              {priorityDef.label}
                                           </button>
                                        </td>
                                        <td className="py-2 px-2 text-center">
                                           <input
                                             type="date"
                                             value={task.dueDate}
                                             onChange={(e) => updateTaskField(activeClient.id, group.id, task.id, 'dueDate', e.target.value)}
                                             className="w-full text-xs text-slate-600 font-medium bg-transparent outline-none text-center cursor-pointer hover:text-brand-600 px-2 py-1 rounded hover:bg-slate-50"
                                             style={{
                                               colorScheme: 'light',
                                               WebkitAppearance: 'none',
                                               MozAppearance: 'textfield'
                                             }}
                                             onFocus={(e) => e.target.showPicker?.()}
                                           />
                                        </td>
                                        <td className="py-2 px-2 text-center">
                                           <div className="flex items-center justify-center gap-1">
                                             {task.worksheet ? (
                                               <a
                                                 href={task.worksheet}
                                                 target="_blank"
                                                 rel="noopener noreferrer"
                                                 className="text-brand-600 hover:text-brand-700"
                                                 title="Open worksheet"
                                                 onClick={(e) => e.stopPropagation()}
                                               >
                                                 <LinkIcon className="w-4 h-4" />
                                               </a>
                                             ) : null}
                                             <input
                                               type="text"
                                               placeholder="Add URL"
                                               value={task.worksheet || ''}
                                               onChange={(e) => updateTaskField(activeClient.id, group.id, task.id, 'worksheet', e.target.value)}
                                               className="flex-1 text-xs text-slate-600 bg-transparent outline-none text-center placeholder:text-slate-300 hover:bg-slate-50 px-2 py-1 rounded"
                                               onClick={(e) => e.stopPropagation()}
                                             />
                                           </div>
                                        </td>
                                        <td className="py-2 px-2 text-center">
                                           <div className="flex items-center justify-center gap-1">
                                             {task.clientSheet ? (
                                               <a
                                                 href={task.clientSheet}
                                                 target="_blank"
                                                 rel="noopener noreferrer"
                                                 className="text-brand-600 hover:text-brand-700"
                                                 title="Open client sheet"
                                                 onClick={(e) => e.stopPropagation()}
                                               >
                                                 <LinkIcon className="w-4 h-4" />
                                               </a>
                                             ) : null}
                                             <input
                                               type="text"
                                               placeholder="Add URL"
                                               value={task.clientSheet || ''}
                                               onChange={(e) => updateTaskField(activeClient.id, group.id, task.id, 'clientSheet', e.target.value)}
                                               className="flex-1 text-xs text-slate-600 bg-transparent outline-none text-center placeholder:text-slate-300 hover:bg-slate-50 px-2 py-1 rounded"
                                               onClick={(e) => e.stopPropagation()}
                                             />
                                           </div>
                                        </td>
                                        <td className="py-2 px-2 text-center">
                                           <button onClick={() => deleteTask(activeClient.id, group.id, task.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-colors">
                                              <X className="w-4 h-4" />
                                           </button>
                                        </td>
                                      </tr>
                                    );
                                 })}
                                 
                                 {/* Add Item Row */}
                                 <tr>
                                   <td className="py-2 px-4 sticky left-0 bg-white z-10 border-t border-slate-100">
                                      <div className="flex items-center gap-3 pl-4">
                                         <input 
                                           value={newItemText[group.id] || ''}
                                           onChange={(e) => setNewItemText({ ...newItemText, [group.id]: e.target.value })}
                                           onKeyDown={(e) => e.key === 'Enter' && handleAddTask(activeClient.id, group.id)}
                                           placeholder="+ Add Item"
                                           className="flex-1 bg-transparent outline-none text-sm text-slate-500 placeholder:text-slate-400 hover:placeholder:text-slate-600"
                                         />
                                         {newItemText[group.id] && (
                                            <button onClick={() => handleAddTask(activeClient.id, group.id)} className="p-1 bg-brand-500 text-white rounded-full hover:bg-brand-600">
                                               <Plus className="w-3 h-3" />
                                            </button>
                                         )}
                                      </div>
                                   </td>
                                   <td colSpan={7} className="border-t border-slate-100"></td>
                                 </tr>
                              </tbody>
                           </table>
                         </div>
                      </div>
                    )}
                 </div>
               );
               })}

               {activeClient.groups.length === 0 && (
                 <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                    <Briefcase className="w-12 h-12 mb-4 opacity-20" />
                    <p className="font-medium">No groups yet.</p>
                    <button onClick={() => handleAddGroup(activeClient.id)} className="mt-4 text-brand-600 hover:underline text-sm">Create your first group</button>
                 </div>
               )}
            </div>
        ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
               <Briefcase className="w-16 h-16 mb-6 opacity-20" />
               <h2 className="text-xl font-bold text-slate-600">No Client Selected</h2>
               <p>Select or create a client to view tasks.</p>
               <button onClick={() => setIsClientDropdownOpen(true)} className="mt-6 px-6 py-2 bg-brand-600 text-white rounded-xl font-semibold shadow-lg hover:bg-brand-700">Select Client</button>
            </div>
        )}
      </div>

      {/* Label Picker Popover */}
      {activePicker && (
        <>
         <div className="fixed inset-0 z-[55]" onClick={() => setActivePicker(null)}></div>
         <div
           className="fixed z-[60] bg-white rounded-xl shadow-xl border border-slate-200 w-48 p-2 animate-fadeIn"
           style={{
             top: activePicker.anchor?.getBoundingClientRect().bottom ?? 0,
             left: activePicker.anchor?.getBoundingClientRect().left ?? 0
           }}
         >
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {(activePicker.type === 'status' ? activeClient!.statusDefs : activeClient!.priorityDefs).map(def => (
                <button 
                  key={def.id}
                  onClick={() => handleSelectLabel(def.id)}
                  className="w-full text-center py-1.5 text-xs font-bold text-white rounded hover:opacity-90"
                  style={{ backgroundColor: def.color }}
                >
                  {def.label}
                </button>
              ))}
            </div>
            <div className="pt-2 mt-2 border-t border-slate-100">
               <button 
                 onClick={() => { setLabelEditorType(activePicker.type); setIsLabelEditorOpen(true); setActivePicker(null); }}
                 className="w-full flex items-center justify-center gap-2 text-xs text-slate-500 hover:text-brand-600 py-1"
               >
                 <Edit3 className="w-3 h-3" /> Edit Labels
               </button>
            </div>
         </div>
        </>
      )}

      {/* Person Picker Popover */}
      {activePersonPicker && (() => {
        const client = clients.find((c: any) => c.id === activePersonPicker.clientId);
        const group = client?.groups.find((g: any) => g.id === activePersonPicker.groupId);
        const task = group?.tasks.find((t: any) => t.id === activePersonPicker.taskId);
        const currentAssigned = Array.isArray(task?.assignedTo) ? task.assignedTo : (task?.assignedTo ? [task.assignedTo] : []);

        return (
          <>
           <div className="fixed inset-0 z-[55]" onClick={() => setActivePersonPicker(null)}></div>
           <div
             className="fixed z-[60] bg-white rounded-xl shadow-xl border border-slate-200 w-64 p-2 animate-fadeIn"
             style={{
               top: activePersonPicker.anchor?.getBoundingClientRect().bottom ?? 0,
               left: activePersonPicker.anchor?.getBoundingClientRect().left ?? 0
             }}
           >
              <div className="px-3 py-2 border-b border-slate-200 mb-1">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Assign People</p>
              </div>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {teamProfiles.map((profile: any) => {
                  const isSelected = currentAssigned.includes(profile.id);
                  return (
                    <button
                      key={profile.id}
                      onClick={() => handleSelectPerson(profile.id)}
                      className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-slate-100 rounded transition-colors flex items-center gap-2 ${
                        isSelected ? 'bg-brand-50 text-brand-700' : 'text-slate-700'
                      }`}
                    >
                      <div className="flex-1 flex items-center gap-2">
                        {profile.avatar_url ? (
                          <img src={profile.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-brand-100 flex items-center justify-center text-[10px] font-bold text-brand-700">
                            {profile.full_name?.charAt(0) || '?'}
                          </div>
                        )}
                        <span className="truncate">{profile.full_name || profile.id.substring(0, 8)}</span>
                      </div>
                      {isSelected && (
                        <svg className="w-4 h-4 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="px-3 py-2 border-t border-slate-200 mt-1">
                <button
                  onClick={() => setActivePersonPicker(null)}
                  className="w-full py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 rounded transition-colors"
                >
                  Done
                </button>
              </div>
           </div>
          </>
        );
      })()}

      {/* Task Details Modal */}
      {taskModal && activeClient && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 animate-fadeIn backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-100 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-gradient-to-r from-slate-50 to-white">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-1 h-8 rounded-full" style={{ backgroundColor: taskModal.groupColor }}></div>
                  <h3 className="font-bold text-xl text-slate-900">{taskModal.task.title}</h3>
                </div>
                <p className="text-sm text-slate-500">{taskModal.groupTitle} • {activeClient.name}</p>
              </div>
              <button onClick={() => setTaskModal(null)} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body - Scrollable */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Task Details Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Status</label>
                  <button
                    onClick={(e) => handleLabelClick(e, 'status', taskModal.task.id, taskModal.groupId, taskModal.clientId)}
                    className="w-full py-2.5 px-3 text-sm font-bold text-white rounded-lg shadow-sm hover:opacity-90 transition-opacity flex items-center gap-2"
                    style={{ backgroundColor: activeClient.statusDefs.find(s => s.id === taskModal.task.status)?.color || '#94a3b8' }}
                  >
                    <div className="w-3 h-3 rounded-full bg-white/30"></div>
                    {activeClient.statusDefs.find((s: LabelDefinition) => s.id === taskModal.task.status)?.label || taskModal.task.status}
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Priority</label>
                  <button
                    onClick={(e) => handleLabelClick(e, 'priority', taskModal.task.id, taskModal.groupId, taskModal.clientId)}
                    className="w-full py-2.5 px-3 text-sm font-bold text-white rounded-lg shadow-sm hover:opacity-90 transition-opacity flex items-center gap-2"
                    style={{ backgroundColor: activeClient.priorityDefs.find(p => p.id === taskModal.task.priority)?.color || '#94a3b8' }}
                  >
                    <div className="w-3 h-3 rounded-full bg-white/30"></div>
                    {activeClient.priorityDefs.find((p: LabelDefinition) => p.id === taskModal.task.priority)?.label || taskModal.task.priority}
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Due Date</label>
                  <input
                    type="date"
                    value={taskModal.task.dueDate}
                    onChange={(e) => {
                      updateTaskField(taskModal.clientId, taskModal.groupId, taskModal.task.id, 'dueDate', e.target.value);
                      setTaskModal({ ...taskModal, task: { ...taskModal.task, dueDate: e.target.value } });
                    }}
                    className="w-full p-2.5 text-sm text-slate-700 font-medium bg-slate-50 border border-slate-200 rounded-lg outline-none hover:border-brand-500 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 cursor-pointer"
                    style={{
                      colorScheme: 'light',
                      WebkitAppearance: 'none',
                      MozAppearance: 'textfield'
                    }}
                    onFocus={(e) => e.target.showPicker?.()}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Assigned To</label>
                  <button
                    onClick={(e) => handlePersonClick(e, taskModal.task.id, taskModal.groupId, taskModal.clientId)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg hover:border-brand-500 transition-colors min-h-[2.75rem] flex items-center"
                  >
                    <div className="flex flex-wrap items-center gap-2 w-full">
                      {(() => {
                        const assignedIds = Array.isArray(taskModal.task.assignedTo) ? taskModal.task.assignedTo : (taskModal.task.assignedTo ? [taskModal.task.assignedTo] : []);
                        const assignedProfiles = assignedIds.map((id: string) => teamProfiles.find((p: any) => p.id === id)).filter(Boolean);

                        if (assignedProfiles.length === 0) {
                          return <span className="text-sm text-slate-400">Click to assign</span>;
                        }

                        return assignedProfiles.map((person: any) => (
                          <div key={person.id} className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-md border border-slate-200">
                            {person.avatar_url ? (
                              <img src={person.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-brand-100 flex items-center justify-center text-[10px] font-bold text-brand-700">
                                {person.full_name?.charAt(0) || '?'}
                              </div>
                            )}
                            <span className="text-xs font-medium text-slate-700">{person.full_name || person.id.substring(0, 8)}</span>
                          </div>
                        ));
                      })()}
                    </div>
                  </button>
                </div>
              </div>

              {/* Links Section */}
              {(taskModal.task.worksheet || taskModal.task.clientSheet) && (
                <div className="grid grid-cols-1 gap-4">
                  {taskModal.task.worksheet && (
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Worksheet</label>
                      <a
                        href={taskModal.task.worksheet}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-3 bg-brand-50 border border-brand-200 rounded-lg hover:bg-brand-100 transition-colors group"
                      >
                        <LinkIcon className="w-4 h-4 text-brand-600" />
                        <span className="text-sm font-medium text-brand-700 truncate flex-1">{taskModal.task.worksheet}</span>
                        <span className="text-xs text-brand-500 opacity-0 group-hover:opacity-100 transition-opacity">Open →</span>
                      </a>
                    </div>
                  )}

                  {taskModal.task.clientSheet && (
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Client Sheet</label>
                      <a
                        href={taskModal.task.clientSheet}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-3 bg-brand-50 border border-brand-200 rounded-lg hover:bg-brand-100 transition-colors group"
                      >
                        <LinkIcon className="w-4 h-4 text-brand-600" />
                        <span className="text-sm font-medium text-brand-700 truncate flex-1">{taskModal.task.clientSheet}</span>
                        <span className="text-xs text-brand-500 opacity-0 group-hover:opacity-100 transition-opacity">Open →</span>
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Comments Section */}
              <div className="border-t border-slate-200 pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <MessageCircle className="w-5 h-5 text-slate-600" />
                  <h4 className="font-bold text-slate-900">Comments</h4>
                  <span className="text-xs text-slate-400">({taskModal.task.comments?.length || 0})</span>
                </div>

                {/* Comments List */}
                <div className="space-y-4 mb-4 max-h-64 overflow-y-auto">
                  {taskModal.task.comments && taskModal.task.comments.length > 0 ? (
                    taskModal.task.comments.map(comment => (
                      <div key={comment.id} className="flex gap-3 p-3 bg-slate-50 rounded-lg">
                        {comment.avatar ? (
                          <img src={comment.avatar} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-xs font-bold text-brand-700 flex-shrink-0">
                            {comment.author.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-bold text-slate-900">{comment.author}</span>
                            <span className="text-xs text-slate-400">
                              {new Date(comment.timestamp).toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                          <p className="text-sm text-slate-700 whitespace-pre-wrap">{comment.text}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-slate-400 text-sm">
                      No comments yet. Be the first to comment!
                    </div>
                  )}
                </div>

                {/* Add Comment */}
                <div className="flex gap-2">
                  <div className="flex-shrink-0">
                    {currentUser.avatarUrl ? (
                      <img src={currentUser.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-xs font-bold text-white">
                        {currentUser.initials}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 flex gap-2 relative">
                    <input
                      type="text"
                      value={newComment}
                      onChange={(e) => {
                        const value = e.target.value;
                        setNewComment(value);

                        // Detect @ for mentions
                        const cursorPos = e.target.selectionStart || 0;
                        const textBeforeCursor = value.substring(0, cursorPos);
                        const lastAtIndex = textBeforeCursor.lastIndexOf('@');

                        console.log('🔍 Input changed:', { value, cursorPos, lastAtIndex, textBeforeCursor });

                        if (lastAtIndex !== -1 && cursorPos > lastAtIndex) {
                          const searchText = textBeforeCursor.substring(lastAtIndex + 1);
                          const charBeforeAt = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : ' ';
                          console.log('📝 @ detected:', { searchText, charBeforeAt, lastAtIndex });

                          // Only show if @ is at start or after space
                          if (charBeforeAt === ' ' || lastAtIndex === 0) {
                            console.log('✅ Showing mention dropdown');
                            setMentionDropdown({ show: true, search: searchText.toLowerCase(), position: cursorPos });
                          } else {
                            console.log('❌ @ not at valid position');
                            setMentionDropdown(null);
                          }
                        } else {
                          console.log('❌ No @ found or cursor not after @');
                          setMentionDropdown(null);
                        }
                      }}
                      onKeyDown={(e) => {
                        // Close dropdown on Escape
                        if (e.key === 'Escape') {
                          setMentionDropdown(null);
                        }
                      }}
                      onKeyPress={async (e) => {
                        if (e.key === 'Enter' && newComment.trim()) {
                          setMentionDropdown(null); // Close dropdown when submitting
                          console.log('💬 Adding comment:', newComment.trim());
                          const mentions = detectMentions(newComment.trim(), teamProfiles);
                          console.log('👥 Detected mentions:', mentions);
                          console.log('👤 Team profiles:', teamProfiles.map(p => ({ id: p.id, name: p.full_name })));

                          const comment: TaskComment = {
                            id: Date.now().toString(),
                            author: currentUser.name,
                            authorId: currentUser.id,
                            text: newComment.trim(),
                            timestamp: new Date().toISOString(),
                            avatar: currentUser.avatarUrl,
                            mentions
                          };
                          const updatedTask = {
                            ...taskModal.task,
                            comments: [...(taskModal.task.comments || []), comment]
                          };
                          updateTaskField(taskModal.clientId, taskModal.groupId, taskModal.task.id, 'comments', updatedTask.comments);
                          setTaskModal({ ...taskModal, task: updatedTask });
                          setNewComment('');

                          // Create notifications for mentioned users
                          if (mentions.length > 0) {
                            console.log('📢 Creating notifications for', mentions.length, 'users');
                            // Get the board name for the notification
                            const currentBoard = clients.find(c => c.id === taskModal.clientId);
                            const boardName = currentBoard?.name || 'Project';

                            for (const mentionedId of mentions) {
                              if (mentionedId !== currentUser.id) { // Don't notify self
                                console.log('✉️ Notifying user:', mentionedId);
                                await createNotification(
                                  mentionedId,
                                  `${currentUser.name} mentioned you`,
                                  `In "${taskModal.task.title}": ${newComment.trim().substring(0, 100)}`,
                                  'message',
                                  'TASKS',
                                  {
                                    taskId: taskModal.task.id,
                                    boardId: taskModal.clientId,
                                    groupId: taskModal.groupId,
                                    boardName: boardName
                                  }
                                );
                              }
                            }
                            console.log('🔔 Playing notification sound');
                            playNotificationSound();
                          } else {
                            console.log('⚠️ No mentions detected in comment');
                          }
                        }
                      }}
                      placeholder="Add a comment... (Use @name or @everyone to mention)"
                      className="flex-1 p-2 border border-slate-300 rounded-lg outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-sm"
                    />

                    {/* Mention Dropdown */}
                    {mentionDropdown?.show && (() => {
                      console.log('🎨 Rendering mention dropdown:', mentionDropdown, 'profiles:', teamProfiles.length);
                      return (
                      <div className="absolute bottom-full left-0 mb-2 w-64 bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden z-[100] animate-fadeIn">
                        <div className="p-2 bg-slate-50 border-b border-slate-200">
                          <p className="text-xs font-bold text-slate-500 uppercase">Mention Someone</p>
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                          {/* @everyone option */}
                          {(!mentionDropdown.search || 'everyone'.includes(mentionDropdown.search)) && (
                            <button
                              onClick={() => {
                                const lastAtIndex = newComment.lastIndexOf('@');
                                const newText = newComment.substring(0, lastAtIndex) + '@everyone ' + newComment.substring(mentionDropdown.position);
                                setNewComment(newText);
                                setMentionDropdown(null);
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-brand-50 transition-colors flex items-center gap-2 text-sm"
                            >
                              <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold text-xs">
                                ALL
                              </div>
                              <div>
                                <p className="font-medium text-slate-900">@everyone</p>
                                <p className="text-xs text-slate-500">Notify all team members</p>
                              </div>
                            </button>
                          )}

                          {/* Team members */}
                          {teamProfiles
                            .filter(profile => {
                              if (!mentionDropdown.search) return true;
                              const name = (profile.full_name || '').toLowerCase();
                              return name.includes(mentionDropdown.search);
                            })
                            .map(profile => (
                              <button
                                key={profile.id}
                                onClick={() => {
                                  const lastAtIndex = newComment.lastIndexOf('@');
                                  const mentionText = profile.full_name?.split(' ')[0] || 'User';
                                  const newText = newComment.substring(0, lastAtIndex) + '@' + mentionText + ' ' + newComment.substring(mentionDropdown.position);
                                  setNewComment(newText);
                                  setMentionDropdown(null);
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-brand-50 transition-colors flex items-center gap-2 text-sm"
                              >
                                {profile.avatar_url ? (
                                  <img src={profile.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-xs">
                                    {profile.full_name?.charAt(0) || '?'}
                                  </div>
                                )}
                                <div>
                                  <p className="font-medium text-slate-900">{profile.full_name || 'Unknown'}</p>
                                  <p className="text-xs text-slate-500">@{profile.full_name?.split(' ')[0] || 'user'}</p>
                                </div>
                              </button>
                            ))}
                        </div>
                      </div>
                      );
                    })()}

                    <button
                      onClick={async () => {
                        if (newComment.trim()) {
                          console.log('💬 Adding comment (button):', newComment.trim());
                          const mentions = detectMentions(newComment.trim(), teamProfiles);
                          console.log('👥 Detected mentions:', mentions);

                          const comment: TaskComment = {
                            id: Date.now().toString(),
                            author: currentUser.name,
                            authorId: currentUser.id,
                            text: newComment.trim(),
                            timestamp: new Date().toISOString(),
                            avatar: currentUser.avatarUrl,
                            mentions
                          };
                          const updatedTask = {
                            ...taskModal.task,
                            comments: [...(taskModal.task.comments || []), comment]
                          };
                          updateTaskField(taskModal.clientId, taskModal.groupId, taskModal.task.id, 'comments', updatedTask.comments);
                          setTaskModal({ ...taskModal, task: updatedTask });
                          setNewComment('');

                          // Create notifications for mentioned users
                          if (mentions.length > 0) {
                            console.log('📢 Creating notifications for', mentions.length, 'users');
                            // Get the board name for the notification
                            const currentBoard = clients.find(c => c.id === taskModal.clientId);
                            const boardName = currentBoard?.name || 'Project';

                            for (const mentionedId of mentions) {
                              if (mentionedId !== currentUser.id) { // Don't notify self
                                console.log('✉️ Notifying user:', mentionedId);
                                await createNotification(
                                  mentionedId,
                                  `${currentUser.name} mentioned you`,
                                  `In "${taskModal.task.title}": ${newComment.trim().substring(0, 100)}`,
                                  'message',
                                  'TASKS',
                                  {
                                    taskId: taskModal.task.id,
                                    boardId: taskModal.clientId,
                                    groupId: taskModal.groupId,
                                    boardName: boardName
                                  }
                                );
                              }
                            }
                            console.log('🔔 Playing notification sound');
                            playNotificationSound();
                          } else {
                            console.log('⚠️ No mentions detected in comment');
                          }
                        }
                      }}
                      className="p-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={!newComment.trim()}
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Client Modal */}
      {isEditingClient && activeClient && (
          <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 animate-fadeIn">
             <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                   <h3 className="font-bold text-lg text-slate-900">Client Settings</h3>
                   <button onClick={() => setIsEditingClient(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-6 space-y-4">
                   <div className="flex justify-center mb-6">
                      <div className="relative group cursor-pointer" onClick={() => logoInputRef.current?.click()}>
                         <div className="w-24 h-24 rounded-xl bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden hover:border-brand-500 transition-colors">
                            {editForm.logoUrl ? <img src={editForm.logoUrl} className="w-full h-full object-cover" /> : <ImageIcon className="w-8 h-8 text-slate-400" />}
                         </div>
                         <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-medium">
                            Change Logo
                         </div>
                         <input type="file" ref={logoInputRef} className="hidden" onChange={handleLogoUpload} accept="image/*" />
                      </div>
                   </div>

                   <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Client Name</label>
                      <input value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="w-full p-2 border rounded-lg outline-none focus:border-brand-500 text-sm" />
                   </div>
                   <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Email Contact</label>
                      <input value={editForm.email} onChange={e => setEditForm({...editForm, email: e.target.value})} className="w-full p-2 border rounded-lg outline-none focus:border-brand-500 text-sm" />
                   </div>
                   <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Phone</label>
                      <input value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} className="w-full p-2 border rounded-lg outline-none focus:border-brand-500 text-sm" />
                   </div>
                   <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Website</label>
                      <input value={editForm.website} onChange={e => setEditForm({...editForm, website: e.target.value})} className="w-full p-2 border rounded-lg outline-none focus:border-brand-500 text-sm" />
                   </div>
                </div>
                <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                   <button onClick={handleDeleteClient} className="text-red-500 hover:text-red-600 text-sm font-medium px-3 py-2 hover:bg-red-50 rounded-lg transition-colors">Delete Client</button>
                   <button onClick={handleUpdateClient} className="bg-slate-900 text-white px-6 py-2 rounded-lg font-bold hover:bg-slate-800 shadow-lg shadow-slate-900/10">Save Changes</button>
                </div>
             </div>
          </div>
      )}

      {/* Label Editor Modal */}
      {isLabelEditorOpen && activeClient && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full overflow-hidden">
               <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                   <h3 className="font-bold text-slate-900 capitalize">Edit {labelEditorType}s</h3>
                   <button onClick={() => setIsLabelEditorOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
               </div>
               <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
                  {(labelEditorType === 'status' ? activeClient.statusDefs : activeClient.priorityDefs).map((def) => (
                     <div key={def.id} className="flex items-center gap-2">
                        <input 
                          type="color" 
                          value={def.color} 
                          onChange={(e) => handleUpdateLabel(activeClient.id, labelEditorType, def.id, 'color', e.target.value)}
                          className="w-8 h-8 rounded cursor-pointer border-none" 
                        />
                        <input 
                          value={def.label}
                          onChange={(e) => handleUpdateLabel(activeClient.id, labelEditorType, def.id, 'label', e.target.value)}
                          className="flex-1 p-2 border border-slate-200 rounded text-sm outline-none focus:border-brand-500"
                        />
                        <button onClick={() => handleDeleteLabel(activeClient.id, labelEditorType, def.id)} className="p-2 text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                     </div>
                  ))}
                  <button 
                    onClick={() => handleAddLabel(activeClient.id, labelEditorType)}
                    className="w-full py-2 border-2 border-dashed border-slate-200 rounded-lg text-slate-400 hover:text-brand-600 hover:border-brand-200 text-sm font-semibold transition-colors mt-2"
                  >
                    + Add New Label
                  </button>
               </div>
               <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
                  <button onClick={() => setIsLabelEditorOpen(false)} className="bg-brand-600 text-white px-6 py-2 rounded-lg font-bold text-sm">Done</button>
               </div>
            </div>
        </div>
      )}

    </div>
  );
};

export default TaskBoard;
