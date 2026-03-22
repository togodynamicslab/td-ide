import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog'
import McpSettings from './McpSettings'
import type { Project } from '../App'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: Project | undefined
}

function SettingsDialog({ open, onOpenChange, project }: SettingsDialogProps): JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Settings</DialogTitle>
        <DialogDescription>
          {project
            ? `MCP servers for ${project.name}`
            : 'Select a project to manage settings'}
        </DialogDescription>
        <div className="mt-4">
          <McpSettings project={project} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default SettingsDialog
