import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  FolderOpen,
  Settings,
  Plus,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Sun,
  Moon,
  Pencil,
  Trash2,
  MessageSquarePlus,
  Loader2,
  CheckCircle2,
  Archive,
  ArchiveRestore,
  GitFork,
  AlertTriangle,
  Wrench,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react'
import WindowControls from './WindowControls'
import MemoryIndicator from './StatusBar'
import { Button } from './ui/button'
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarSeparator,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar
} from './ui/sidebar'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator
} from './ui/context-menu'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel
} from './ui/alert-dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import { useTheme } from '@/lib/theme'
import type { Project } from '../App'

interface AppSidebarProps {
  projects: Project[]
  activeProjectId: string | null
  activeConversationId: string | null
  loadingConversations: Set<string>
  interruptedConversations?: Set<string>
  queuedCounts: Map<string, number>
  onSelectProject: (id: string) => void
  onSelectConversation: (id: string) => void
  onNewChat: () => void
  onAddProject: () => void
  onRenameProject: (id: string, name: string) => void
  onDeleteProject: (id: string) => void
  onRenameConversation: (id: string, title: string) => void
  onDeleteConversation: (id: string) => void
  onArchiveConversation?: (id: string, archived: boolean) => void
  onDeleteAllArchived?: (projectId: string) => void
  onNewChatForProject: (projectId: string) => void
  onOpenSettings: () => void
  onOpenProjectSettings?: (projectId: string) => void
  onReorderProjects?: (orderedIds: string[]) => void
  onKillSession?: (conversationId: string) => void
  recentlyRetitled?: Set<string>
}

interface DeleteTarget {
  type: 'project' | 'conversation' | 'all-archived'
  id: string
  name: string
}

function SortableProjectItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: React.CSSProperties = {
    transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    zIndex: isDragging ? 10 : undefined
  }
  return (
    <li
      ref={setNodeRef}
      style={style}
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className="group/menu-item relative"
      {...attributes}
      {...listeners}
    >
      {children}
    </li>
  )
}

function AppSidebar({
  projects,
  activeProjectId,
  activeConversationId,
  loadingConversations,
  interruptedConversations,
  queuedCounts,
  onSelectProject,
  onSelectConversation,
  onNewChat,
  onAddProject,
  onRenameProject,
  onDeleteProject,
  onRenameConversation,
  onDeleteConversation,
  onArchiveConversation,
  onDeleteAllArchived,
  onNewChatForProject,
  onOpenSettings,
  onOpenProjectSettings,
  onReorderProjects,
  onKillSession,
  recentlyRetitled
}: AppSidebarProps): JSX.Element {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    new Set(activeProjectId ? [activeProjectId] : [])
  )
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [showArchived, setShowArchived] = useState<Set<string>>(new Set())
  const [recentlyFinished, setRecentlyFinished] = useState<Set<string>>(new Set())
  const prevLoadingRef = useRef<Set<string>>(new Set())
  const editInputRef = useRef<HTMLInputElement>(null)
  const { theme, toggleTheme } = useTheme()
  const { state: sidebarState, toggleSidebar } = useSidebar()

  // Drag-and-drop for project reordering
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 300, tolerance: 5 } }))
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = projects.findIndex(p => p.id === active.id)
    const newIndex = projects.findIndex(p => p.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = [...projects.map(p => p.id)]
    reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, active.id as string)
    onReorderProjects?.(reordered)
  }, [projects, onReorderProjects])

  // Track conversations that just finished loading → show checkmark until clicked
  useEffect(() => {
    const prev = prevLoadingRef.current
    const justFinished: string[] = []
    for (const id of prev) {
      if (!loadingConversations.has(id)) {
        justFinished.push(id)
      }
    }
    prevLoadingRef.current = new Set(loadingConversations)

    if (justFinished.length === 0) return

    setRecentlyFinished((s) => {
      const next = new Set(s)
      for (const id of justFinished) next.add(id)
      return next
    })
  }, [loadingConversations])

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  const toggleProject = (id: string) => {
    // In collapsed mode, just switch to the project
    if (sidebarState === 'collapsed') {
      onSelectProject(id)
      setExpandedProjects((prev) => new Set(prev).add(id))
      return
    }
    setExpandedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    onSelectProject(id)
  }

  const formatTime = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - new Date(date).getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    if (hours < 1) return 'Just now'
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  const startRenameProject = (project: Project) => {
    setEditingId(`project-${project.id}`)
    setEditValue(project.name)
  }

  const startRenameConversation = (convId: string, title: string) => {
    setEditingId(`conv-${convId}`)
    setEditValue(title)
  }

  const commitRename = () => {
    if (!editingId || !editValue.trim()) {
      setEditingId(null)
      return
    }
    if (editingId.startsWith('project-')) {
      const id = editingId.replace('project-', '')
      onRenameProject(id, editValue.trim())
    } else if (editingId.startsWith('conv-')) {
      const id = editingId.replace('conv-', '')
      onRenameConversation(id, editValue.trim())
    }
    setEditingId(null)
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitRename()
    else if (e.key === 'Escape') setEditingId(null)
  }

  const confirmDelete = () => {
    if (!deleteTarget) return
    if (deleteTarget.type === 'project') {
      onDeleteProject(deleteTarget.id)
    } else if (deleteTarget.type === 'all-archived') {
      onDeleteAllArchived?.(deleteTarget.id)
    } else {
      onDeleteConversation(deleteTarget.id)
    }
    setDeleteTarget(null)
  }

  return (
    <>
      <Sidebar collapsible="icon">
        {/* Header — shared container with fixed height */}
        <div className="h-10 flex items-center px-3 titlebar-drag overflow-hidden shrink-0">
          {/* Expanded header content */}
          <div className={cn(
            'flex items-center justify-between w-full gap-2 transition-all duration-200 ease-in-out',
            sidebarState === 'collapsed'
              ? 'opacity-0 scale-95 pointer-events-none absolute'
              : 'opacity-100 scale-100 delay-100'
          )}>
            <WindowControls />
            <div className={cn(
              'flex items-center gap-1.5 flex-1 min-w-0 transition-opacity duration-150',
              sidebarState === 'collapsed' ? 'opacity-0' : 'opacity-100 delay-200'
            )}>
              <span className="text-sm font-bold text-td-text tracking-tight whitespace-nowrap">td-ide</span>
              <span className="text-[9px] px-1 py-px rounded bg-td-muted/10 text-td-muted uppercase tracking-widest font-medium whitespace-nowrap">
                Alpha
              </span>
            </div>
            <div className="flex items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={onNewChat} className="titlebar-no-drag h-6 w-6">
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">New chat</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={toggleSidebar} className="titlebar-no-drag h-6 w-6">
                    <PanelLeftClose className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Collapse sidebar (Cmd+B)</TooltipContent>
              </Tooltip>
            </div>
          </div>
          {/* Collapsed header content */}
          <div className={cn(
            'flex items-center justify-center w-full transition-all duration-200 ease-in-out',
            sidebarState === 'collapsed'
              ? 'opacity-100 scale-100 delay-100'
              : 'opacity-0 scale-95 pointer-events-none absolute'
          )}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={toggleSidebar} className="h-8 w-8">
                  <PanelLeftOpen className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Expand sidebar (Cmd+B)</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <SidebarSeparator />

        {/* Collapsed: quick actions */}
        <div className={cn(
          'flex flex-col items-center gap-0.5 py-2 transition-all duration-200 ease-in-out overflow-hidden',
          sidebarState === 'collapsed'
            ? 'max-h-24 opacity-100 delay-100'
            : 'max-h-0 opacity-0 py-0 pointer-events-none'
        )}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onNewChat} className="h-8 w-8">
                <MessageSquarePlus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">New chat</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onAddProject} className="h-8 w-8">
                <FolderOpen className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Add project</TooltipContent>
          </Tooltip>
        </div>

        {/* Projects */}
        <SidebarContent className={cn(
          'transition-opacity duration-200 ease-in-out',
          sidebarState === 'collapsed' ? 'opacity-0 pointer-events-none' : 'opacity-100 delay-100'
        )}>
          <SidebarGroup>
            <SidebarGroupLabel>Projects</SidebarGroupLabel>
            <SidebarGroupAction onClick={onAddProject} title="Add project">
              <Plus className="h-3 w-3" />
            </SidebarGroupAction>
            <SidebarGroupContent>
              {projects.length === 0 ? (
                <div className="px-2 py-4 text-center group-data-[collapsible=icon]:hidden">
                  <p className="text-xs text-td-muted mb-2">No projects yet</p>
                  <Button variant="outline" size="sm" onClick={onAddProject} className="text-xs">
                    <FolderOpen className="h-3 w-3 mr-1.5" />
                    Open folder
                  </Button>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                <SortableContext items={projects.map(p => p.id)} strategy={verticalListSortingStrategy}>
                <SidebarMenu>
                  {projects.map((project) => {
                    const projectHasLoading = project.conversations.some((c) => loadingConversations.has(c.id))
                    const projectHasFinished = !projectHasLoading && project.conversations.some((c) => recentlyFinished.has(c.id))
                    return (
                    <SortableProjectItem key={project.id} id={project.id}>
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <SidebarMenuButton
                            isActive={project.id === activeProjectId}
                            onClick={() => toggleProject(project.id)}
                            tooltip={project.name}
                            className="text-td-text-tertiary data-[active=true]:text-td-text"
                          >
                            {expandedProjects.has(project.id) ? (
                              <ChevronDown className="h-3 w-3 text-td-muted" />
                            ) : (
                              <ChevronRight className="h-3 w-3 text-td-muted" />
                            )}
                            <FolderOpen className="h-4 w-4 text-td-muted" />
                            {editingId === `project-${project.id}` ? (
                              <input
                                ref={editInputRef}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={commitRename}
                                onKeyDown={handleRenameKeyDown}
                                onClick={(e) => e.stopPropagation()}
                                className="flex-1 min-w-0 bg-td-surface border border-td-border rounded px-1.5 py-0.5 text-sm text-td-text outline-none focus:border-td-accent"
                              />
                            ) : (
                              <span>{project.name}</span>
                            )}
                            {projectHasLoading ? (
                              <Loader2 className="ml-auto h-3 w-3 text-td-accent animate-spin shrink-0" />
                            ) : projectHasFinished ? (
                              <CheckCircle2 className="ml-auto h-3 w-3 text-emerald-400 shrink-0" />
                            ) : null}
                          </SidebarMenuButton>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem onClick={() => onNewChatForProject(project.id)}>
                            <MessageSquarePlus className="h-3.5 w-3.5 mr-2" />
                            New Chat
                          </ContextMenuItem>
                          {onOpenProjectSettings && (
                            <ContextMenuItem onClick={() => onOpenProjectSettings(project.id)}>
                              <Wrench className="h-3.5 w-3.5 mr-2" />
                              Project Settings
                            </ContextMenuItem>
                          )}
                          <ContextMenuSeparator />
                          <ContextMenuItem onClick={() => startRenameProject(project)}>
                            <Pencil className="h-3.5 w-3.5 mr-2" />
                            Rename
                          </ContextMenuItem>
                          <ContextMenuItem
                            onClick={() =>
                              setDeleteTarget({ type: 'project', id: project.id, name: project.name })
                            }
                            className="text-red-400 focus:text-red-300"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            Delete
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>

                      {expandedProjects.has(project.id) && project.conversations.length > 0 && (() => {
                        const activeConvs = project.conversations.filter((c) => !c.archived)
                        const archivedConvs = project.conversations.filter((c) => c.archived)
                        const isArchivedOpen = showArchived.has(project.id)

                        const renderConvItem = (conv: typeof project.conversations[0]) => (
                          <SidebarMenuSubItem key={conv.id}>
                            <ContextMenu>
                              <ContextMenuTrigger asChild>
                                <SidebarMenuSubButton
                                  size="sm"
                                  isActive={conv.id === activeConversationId}
                                  onClick={() => {
                                    onSelectProject(project.id)
                                    onSelectConversation(conv.id)
                                    if (recentlyFinished.has(conv.id)) {
                                      setRecentlyFinished((s) => {
                                        const next = new Set(s)
                                        next.delete(conv.id)
                                        return next
                                      })
                                    }
                                  }}
                                  className="w-full"
                                >
                                  {loadingConversations.has(conv.id) ? (
                                    <Loader2 className="h-3 w-3 shrink-0 text-td-accent animate-spin" />
                                  ) : recentlyFinished.has(conv.id) ? (
                                    <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-400" />
                                  ) : interruptedConversations?.has(conv.id) ? (
                                    <AlertTriangle className="h-3 w-3 shrink-0 text-amber-400" />
                                  ) : (
                                    conv.worktreePath
                                      ? <GitFork className="h-3 w-3 shrink-0 text-purple-400" />
                                      : <MessageSquare className={`h-3 w-3 shrink-0 ${conv.archived ? 'text-td-muted/50' : 'text-td-muted'}`} />
                                  )}
                                  {editingId === `conv-${conv.id}` ? (
                                    <input
                                      ref={editInputRef}
                                      value={editValue}
                                      onChange={(e) => setEditValue(e.target.value)}
                                      onBlur={commitRename}
                                      onKeyDown={handleRenameKeyDown}
                                      onClick={(e) => e.stopPropagation()}
                                      className="flex-1 min-w-0 bg-td-surface border border-td-border rounded px-1.5 py-0.5 text-sm text-td-text outline-none focus:border-td-accent"
                                    />
                                  ) : (
                                    <>
                                      <span className="truncate flex-1">{conv.title}</span>
                                      {loadingConversations.has(conv.id) ? (
                                        <span className="text-[10px] text-td-accent shrink-0 w-12 text-right">
                                          {(queuedCounts.get(conv.id) ?? 0) > 0
                                            ? `+${queuedCounts.get(conv.id)} queued`
                                            : 'Working...'}
                                        </span>
                                      ) : recentlyRetitled?.has(conv.id) ? (
                                        <span className="text-[10px] text-[#D97757] shrink-0 w-12 text-right animate-pulse">Title updated</span>
                                      ) : recentlyFinished.has(conv.id) ? (
                                        <span className="text-[10px] text-emerald-400 shrink-0 w-12 text-right">Done</span>
                                      ) : interruptedConversations?.has(conv.id) ? (
                                        <span className="text-[10px] text-amber-400 shrink-0 w-12 text-right">Interrupted</span>
                                      ) : (
                                        <span className="text-[10px] text-td-muted shrink-0 w-12 text-right">
                                          {formatTime(conv.createdAt)}
                                        </span>
                                      )}
                                    </>
                                  )}
                                </SidebarMenuSubButton>
                              </ContextMenuTrigger>
                              <ContextMenuContent>
                                <ContextMenuItem
                                  onClick={() => startRenameConversation(conv.id, conv.title)}
                                >
                                  <Pencil className="h-3.5 w-3.5 mr-2" />
                                  Rename
                                </ContextMenuItem>
                                {onArchiveConversation && (
                                  <ContextMenuItem onClick={() => onArchiveConversation(conv.id, !conv.archived)}>
                                    {conv.archived ? (
                                      <><ArchiveRestore className="h-3.5 w-3.5 mr-2" />Unarchive</>
                                    ) : (
                                      <><Archive className="h-3.5 w-3.5 mr-2" />Archive</>
                                    )}
                                  </ContextMenuItem>
                                )}
                                <ContextMenuSeparator />
                                <ContextMenuItem
                                  onClick={() =>
                                    setDeleteTarget({
                                      type: 'conversation',
                                      id: conv.id,
                                      name: conv.title
                                    })
                                  }
                                  className="text-red-400 focus:text-red-300"
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                                  Delete
                                </ContextMenuItem>
                              </ContextMenuContent>
                            </ContextMenu>
                          </SidebarMenuSubItem>
                        )

                        return (
                          <SidebarMenuSub>
                            {activeConvs.map(renderConvItem)}
                            {archivedConvs.length > 0 && (
                              <>
                                <SidebarMenuSubItem>
                                  <ContextMenu>
                                    <ContextMenuTrigger asChild>
                                      <button
                                        onClick={() => setShowArchived((prev) => {
                                          const next = new Set(prev)
                                          if (next.has(project.id)) next.delete(project.id)
                                          else next.add(project.id)
                                          return next
                                        })}
                                        className="flex items-center gap-2 w-full px-2 py-1 text-[11px] text-td-muted hover:bg-td-hover rounded-sm transition-colors"
                                      >
                                        {isArchivedOpen ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
                                        <Archive className="h-3 w-3" />
                                        <span>Archived ({archivedConvs.length})</span>
                                      </button>
                                    </ContextMenuTrigger>
                                    <ContextMenuContent>
                                      <ContextMenuItem
                                        onClick={() =>
                                          setDeleteTarget({
                                            type: 'all-archived',
                                            id: project.id,
                                            name: `${archivedConvs.length} archived chat${archivedConvs.length === 1 ? '' : 's'}`
                                          })
                                        }
                                        className="text-red-400 focus:text-red-300"
                                      >
                                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                                        Delete all archived
                                      </ContextMenuItem>
                                    </ContextMenuContent>
                                  </ContextMenu>
                                </SidebarMenuSubItem>
                                {isArchivedOpen && archivedConvs.map(renderConvItem)}
                              </>
                            )}
                          </SidebarMenuSub>
                        )
                      })()}
                    </SortableProjectItem>
                    )
                  })}
                </SidebarMenu>
                </SortableContext>
                </DndContext>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarSeparator />

        {/* Footer */}
        <SidebarFooter className="pb-7">
          <MemoryIndicator
            conversationTitles={useMemo(() => {
              const map = new Map<string, string>()
              projects.forEach(p => p.conversations.forEach(c => map.set(c.id, c.title)))
              return map
            }, [projects])}
            onNavigateToConversation={(convId) => {
              const project = projects.find(p => p.conversations.some(c => c.id === convId))
              if (project) {
                onSelectProject(project.id)
                onSelectConversation(convId)
              }
            }}
            onKillSession={onKillSession}
          />
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={toggleTheme} tooltip={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Settings" onClick={onOpenSettings}>
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>
            Delete {deleteTarget?.type === 'project' ? 'project' : deleteTarget?.type === 'all-archived' ? 'all archived chats' : 'chat'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {deleteTarget?.type === 'all-archived'
              ? `Are you sure you want to delete ${deleteTarget.name}? All messages will be permanently removed.`
              : <>Are you sure you want to delete &quot;{deleteTarget?.name}&quot;?
                {deleteTarget?.type === 'project'
                  ? ' This will also delete all conversations in this project.'
                  : ' All messages in this chat will be permanently removed.'}</>}
            {' '}This action cannot be undone.
          </AlertDialogDescription>
          <div className="flex justify-end gap-2 mt-4">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export default AppSidebar
