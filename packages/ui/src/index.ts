/**
 * Three layers, exported as one surface:
 *   components/ui  the shadcn/ui primitives, enhanced for this console
 *   panel          this application's vocabulary, composed from them
 *   tally          the signal indicator the whole interface is built around
 */

export { cn } from './lib/utils.ts'

export { Button, buttonVariants } from './components/ui/button.tsx'
export { Badge, badgeVariants } from './components/ui/badge.tsx'
export { Input } from './components/ui/input.tsx'
export { Label } from './components/ui/label.tsx'
export { Checkbox } from './components/ui/checkbox.tsx'
export { Switch } from './components/ui/switch.tsx'
export { Separator } from './components/ui/separator.tsx'
export { Skeleton } from './components/ui/skeleton.tsx'
export { ScrollArea, ScrollBar } from './components/ui/scroll-area.tsx'
export { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs.tsx'
export { Toaster } from './components/ui/sonner.tsx'
export {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './components/ui/tooltip.tsx'
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './components/ui/select.tsx'
export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './components/ui/sheet.tsx'
export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from './components/ui/popover.tsx'
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './components/ui/dialog.tsx'
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu.tsx'

export {
  ANY_OPTION,
  Check,
  Empty,
  Field,
  PanelScroll,
  PanelSelect,
  Readout,
  RowSkeleton,
  Rule,
  type PanelSelectOption,
  type PanelSelectProps,
} from './panel.tsx'

export { TALLY_LABEL, Tally, TallyCount, type TallyState } from './tally.tsx'
