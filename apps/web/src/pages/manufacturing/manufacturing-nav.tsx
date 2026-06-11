import { cn } from '@/lib/utils';
import { Factory, Layers } from 'lucide-react';
import { NavLink } from 'react-router-dom';

const tabs = [
  { to: '/manufacturing/boms', label: 'Recipes (BOM)', icon: <Layers className="h-4 w-4" /> },
  { to: '/manufacturing/production', label: 'Production', icon: <Factory className="h-4 w-4" /> },
];

export function ManufacturingNav() {
  return (
    <div className="flex gap-1 border-b border-border">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all',
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )
          }
        >
          {t.icon}
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}
