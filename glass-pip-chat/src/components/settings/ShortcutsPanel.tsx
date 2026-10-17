import { motion } from 'framer-motion';

interface ShortcutsPanelProps { platform: string; theme: 'light' | 'dark' }

/** Keep this reference aligned with main.ts and useKeyboardShortcuts.ts. */
export default function ShortcutsPanel({ platform }: ShortcutsPanelProps) {
  const mod = platform === 'darwin' ? '⌘' : 'Ctrl';
  const groups = [
    ['Anywhere', [
      ['Show / hide Ally', `${mod}+Shift+C`], ['Quick input', `${mod}+Shift+Q`],
      ['Collapse / expand', `${mod}+Shift+M`], ['Resize window', `${mod}+Shift+S`],
      ['Circle to ask', `${mod}+Shift+Space`], ['Toggle context', `${mod}+Shift+T`], ['Toggle speech', `${mod}+Shift+V`],
    ]],
    ['In Ally', [
      ['Reload window', `${mod}+R / F5`], ['Resize window', 'F4'], ['Settings', `${mod}+, / F1`],
      ['New chat', `${mod}+N / F2`], ['Collapse / expand', 'F3'], ['Show / hide chats', 'F6'],
      ['Hide window', `${mod}+W / Escape`], ['Focus message', '/'], ['Stop reply', `${mod}+.`],
    ]],
    ['While typing', [['Send', 'Enter'], ['New line', 'Shift+Enter'], ['Recall single-line messages', '↑ / ↓'], ['Clear input', `${mod}+K`]]],
  ] as const;
  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5 border-b border-border p-4">
    <h3 className="text-sm font-medium">Keyboard shortcuts</h3>
    {groups.map(([title, rows]) => <section key={title} className="space-y-2">
      <h4 className="text-xs text-foreground/50">{title}</h4>
      {rows.map(([label, keys]) => <div key={label} className="flex items-center justify-between gap-4 text-xs">
        <span className="text-foreground/75">{label}</span><kbd className="rounded border border-border bg-secondary px-2 py-1 font-mono text-[11px]">{keys}</kbd>
      </div>)}
    </section>)}
    <p className="text-xs text-foreground/50">Reload asks first if a reply is running or an unsent draft is present.</p>
  </motion.div>;
}
