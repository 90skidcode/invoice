import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { CalendarIcon, Clock } from 'lucide-react';
import * as React from 'react';

interface DateTimePickerProps {
  value: string; // ISO datetime string, or '' when unset
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function DateTimePicker({ value, onChange, placeholder, className }: Readonly<DateTimePickerProps>) {
  const [open, setOpen] = React.useState(false);
  const selectedDate = value ? parseISO(value) : undefined;
  const [timeValue, setTimeValue] = React.useState(() => (selectedDate ? format(selectedDate, 'HH:mm') : '09:00'));

  function commit(date: Date | undefined, time: string) {
    if (!date) {
      onChange('');
      return;
    }
    const [hours, minutes] = time.split(':').map(Number);
    const combined = new Date(date);
    combined.setHours(hours ?? 0, minutes ?? 0, 0, 0);
    onChange(combined.toISOString());
  }

  function handleDaySelect(date: Date | undefined) {
    commit(date, timeValue);
    if (date) setOpen(false);
  }

  function handleTimeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newTime = e.target.value;
    setTimeValue(newTime);
    if (selectedDate) commit(selectedDate, newTime);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            className,
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          {selectedDate ? (
            <span>{format(selectedDate, 'dd MMM yyyy, h:mm a')}</span>
          ) : (
            <span className="text-muted-foreground">{placeholder ?? 'Pick a date & time'}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar mode="single" selected={selectedDate} onSelect={handleDaySelect} autoFocus />
        <div className="border-t border-border p-3">
          <label className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              type="time"
              value={timeValue}
              onChange={handleTimeChange}
              className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        </div>
      </PopoverContent>
    </Popover>
  );
}
