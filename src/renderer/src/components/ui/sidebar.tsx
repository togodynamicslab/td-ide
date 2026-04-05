import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { PanelLeftIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './button'
import { Separator } from './separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip'

const SIDEBAR_WIDTH_DEFAULT = 240
const SIDEBAR_WIDTH_MIN = 180
const SIDEBAR_WIDTH_MAX = 480
const SIDEBAR_WIDTH_ICON = '3rem'

type SidebarContextProps = {
  state: 'expanded' | 'collapsed'
  open: boolean
  setOpen: (open: boolean) => void
  toggleSidebar: () => void
  sidebarWidth: number
  setSidebarWidth: React.Dispatch<React.SetStateAction<number>>
}

const SidebarContext = React.createContext<SidebarContextProps | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider.')
  }
  return context
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [_open, _setOpen] = React.useState(defaultOpen)
  const [sidebarWidth, setSidebarWidth] = React.useState(SIDEBAR_WIDTH_DEFAULT)
  const open = openProp ?? _open
  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === 'function' ? value(open) : value
      if (setOpenProp) {
        setOpenProp(openState)
      } else {
        _setOpen(openState)
      }
    },
    [setOpenProp, open]
  )

  const toggleSidebar = React.useCallback(() => {
    setOpen((prev) => !prev)
  }, [setOpen])

  const state = open ? 'expanded' : 'collapsed'

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({ state, open, setOpen, toggleSidebar, sidebarWidth, setSidebarWidth }),
    [state, open, setOpen, toggleSidebar, sidebarWidth]
  )

  return (
    <SidebarContext.Provider value={contextValue}>
      <TooltipProvider delayDuration={0}>
        <div
          data-slot="sidebar-wrapper"
          style={
            {
              '--sidebar-width': `${sidebarWidth}px`,
              '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
              ...style
            } as React.CSSProperties
          }
          className={cn('group/sidebar-wrapper flex h-screen w-full', className)}
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  )
}

function Sidebar({
  side = 'left',
  collapsible = 'icon',
  className,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  side?: 'left' | 'right'
  collapsible?: 'offcanvas' | 'icon' | 'none'
}) {
  const { state } = useSidebar()

  if (collapsible === 'none') {
    return (
      <div
        data-slot="sidebar"
        className={cn(
          'flex h-full w-[var(--sidebar-width)] flex-col bg-td-bg text-td-text',
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }

  return (
    <div
      className="group peer text-td-text"
      data-state={state}
      data-collapsible={state === 'collapsed' ? collapsible : ''}
      data-side={side}
      data-slot="sidebar"
    >
      <div
        data-slot="sidebar-gap"
        className={cn(
          'relative w-[var(--sidebar-width)] bg-transparent shrink-0',
          'transition-[width] duration-200 ease-linear group-data-[resizing]:!transition-none',
          'group-data-[collapsible=offcanvas]:w-0',
          'group-data-[collapsible=icon]:w-[var(--sidebar-width-icon)]'
        )}
      />
      <div
        data-slot="sidebar-container"
        className={cn(
          'fixed inset-y-0 z-10 h-screen w-[var(--sidebar-width)] flex',
          'transition-[left,right,width] duration-200 ease-linear group-data-[resizing]:!transition-none',
          side === 'left'
            ? 'left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]'
            : 'right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]',
          'group-data-[collapsible=icon]:w-[var(--sidebar-width-icon)]',
          side === 'left' ? 'border-r border-td-border' : 'border-l border-td-border',
          className
        )}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className="flex h-full w-full flex-col bg-td-bg overflow-hidden"
        >
          {children}
        </div>
        {state === 'expanded' && (
          <SidebarResizeHandle side={side} />
        )}
      </div>
    </div>
  )
}

function SidebarResizeHandle({ side }: { side: 'left' | 'right' }) {
  const { setSidebarWidth } = useSidebar()
  const startX = React.useRef(0)
  const startWidth = React.useRef(0)
  const parentRef = React.useRef<HTMLElement | null>(null)

  const handlePointerDown = React.useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      const sidebarEl = (e.currentTarget as HTMLElement).closest('[data-slot="sidebar"]')
      parentRef.current = sidebarEl as HTMLElement
      startX.current = e.clientX
      const gap = sidebarEl?.querySelector('[data-slot="sidebar-gap"]')
      startWidth.current = gap ? gap.getBoundingClientRect().width : 240

      sidebarEl?.setAttribute('data-resizing', '')

      const handlePointerMove = (ev: PointerEvent): void => {
        const delta = side === 'left' ? ev.clientX - startX.current : startX.current - ev.clientX
        const newWidth = Math.min(Math.max(startWidth.current + delta, SIDEBAR_WIDTH_MIN), SIDEBAR_WIDTH_MAX)
        setSidebarWidth(newWidth)
      }

      const handlePointerUp = (): void => {
        parentRef.current?.removeAttribute('data-resizing')
        document.removeEventListener('pointermove', handlePointerMove)
        document.removeEventListener('pointerup', handlePointerUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('pointermove', handlePointerMove)
      document.addEventListener('pointerup', handlePointerUp)
    },
    [setSidebarWidth, side]
  )

  return (
    <div
      onPointerDown={handlePointerDown}
      className={cn(
        'absolute top-0 bottom-0 w-1 cursor-col-resize z-20 hover:bg-td-accent/50 transition-colors',
        side === 'left' ? 'right-0' : 'left-0'
      )}
    />
  )
}

function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar()

  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon"
      className={cn('h-7 w-7', className)}
      onClick={(event) => {
        onClick?.(event)
        toggleSidebar()
      }}
      {...props}
    >
      <PanelLeftIcon className="h-4 w-4" />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  )
}

function SidebarHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn('flex flex-col gap-2 p-2', className)}
      {...props}
    />
  )
}

function SidebarContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden',
        className
      )}
      {...props}
    />
  )
}

function SidebarFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn('flex flex-col gap-2 p-2', className)}
      {...props}
    />
  )
}

function SidebarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="sidebar-separator"
      data-sidebar="separator"
      className={cn('mx-2 w-auto bg-td-border', className)}
      {...props}
    />
  )
}

function SidebarGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn('relative flex w-full min-w-0 flex-col p-2', className)}
      {...props}
    />
  )
}

function SidebarGroupLabel({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<'div'> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'div'

  return (
    <Comp
      data-slot="sidebar-group-label"
      data-sidebar="group-label"
      className={cn(
        'flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-td-muted uppercase tracking-wider transition-[margin,opacity] duration-200 ease-linear [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0',
        'group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0',
        className
      )}
      {...props}
    />
  )
}

function SidebarGroupAction({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="sidebar-group-action"
      data-sidebar="group-action"
      className={cn(
        'absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-td-muted transition-transform hover:bg-td-hover hover:text-td-text outline-none focus-visible:ring-1 focus-visible:ring-td-accent [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0',
        'group-data-[collapsible=icon]:hidden',
        className
      )}
      {...props}
    />
  )
}

function SidebarGroupContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      className={cn('w-full text-sm', className)}
      {...props}
    />
  )
}

function SidebarMenu({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn('flex w-full min-w-0 flex-col gap-1', className)}
      {...props}
    />
  )
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<'li'>) {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn('group/menu-item relative', className)}
      {...props}
    />
  )
}

const sidebarMenuButtonVariants = cva(
  'peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none transition-[width,height,padding] duration-200 hover:bg-td-hover hover:text-td-text focus-visible:ring-1 focus-visible:ring-td-accent disabled:pointer-events-none disabled:opacity-50 data-[active=true]:bg-td-hover data-[active=true]:font-medium data-[active=true]:text-td-text [&>span:last-child]:truncate [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0 group-data-[collapsible=icon]:!size-8 group-data-[collapsible=icon]:!p-2',
  {
    variants: {
      variant: {
        default: 'hover:bg-td-hover hover:text-td-text',
        outline:
          'bg-td-surface border border-td-border hover:bg-td-hover hover:text-td-text'
      },
      size: {
        default: 'h-8 text-sm',
        sm: 'h-7 text-xs',
        lg: 'h-12 text-sm group-data-[collapsible=icon]:!p-0'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

function SidebarMenuButton({
  asChild = false,
  isActive = false,
  variant = 'default',
  size = 'default',
  tooltip,
  className,
  ...props
}: React.ComponentProps<'button'> & {
  asChild?: boolean
  isActive?: boolean
  tooltip?: string | React.ComponentProps<typeof TooltipContent>
} & VariantProps<typeof sidebarMenuButtonVariants>) {
  const Comp = asChild ? Slot : 'button'
  const { state } = useSidebar()

  const button = (
    <Comp
      data-slot="sidebar-menu-button"
      data-sidebar="menu-button"
      data-size={size}
      data-active={isActive}
      className={cn(sidebarMenuButtonVariants({ variant, size }), className)}
      {...props}
    />
  )

  if (!tooltip) {
    return button
  }

  if (typeof tooltip === 'string') {
    tooltip = { children: tooltip }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent
        side="right"
        align="center"
        hidden={state !== 'collapsed'}
        {...tooltip}
      />
    </Tooltip>
  )
}

function SidebarMenuSub({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="sidebar-menu-sub"
      data-sidebar="menu-sub"
      className={cn(
        'ml-0 mr-0 flex min-w-0 flex-col gap-0.5 pl-0 pr-0 py-0.5',
        'group-data-[collapsible=icon]:hidden',
        className
      )}
      {...props}
    />
  )
}

function SidebarMenuSubItem({ className, ...props }: React.ComponentProps<'li'>) {
  return (
    <li
      data-slot="sidebar-menu-sub-item"
      data-sidebar="menu-sub-item"
      className={cn('group/menu-sub-item relative', className)}
      {...props}
    />
  )
}

function SidebarMenuSubButton({
  asChild = false,
  size = 'md',
  isActive = false,
  className,
  ...props
}: React.ComponentProps<'button'> & {
  asChild?: boolean
  size?: 'sm' | 'md'
  isActive?: boolean
}) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="sidebar-menu-sub-button"
      data-sidebar="menu-sub-button"
      data-size={size}
      data-active={isActive}
      className={cn(
        'flex min-w-0 -translate-x-px items-center gap-1.5 overflow-hidden rounded-md px-1.5 text-td-text-tertiary outline-none hover:bg-td-hover hover:text-td-text focus-visible:ring-1 focus-visible:ring-td-accent disabled:pointer-events-none disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:shrink-0',
        'data-[active=true]:bg-td-hover data-[active=true]:text-td-text',
        size === 'sm' && 'h-6 text-[11px] [&>svg]:h-3 [&>svg]:w-3',
        size === 'md' && 'h-7 text-sm [&>svg]:h-4 [&>svg]:w-4',
        'group-data-[collapsible=icon]:hidden',
        className
      )}
      {...props}
    />
  )
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar
}
