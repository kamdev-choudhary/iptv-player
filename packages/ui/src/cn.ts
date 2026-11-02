import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge class lists, with later Tailwind utilities winning over earlier ones. */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))
