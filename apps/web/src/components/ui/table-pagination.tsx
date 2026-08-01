import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface TablePageInfo {
  limit: number;
  offset: number;
  total: number;
}

export function TablePagination({
  page,
  onPageChange,
}: Readonly<{
  page: TablePageInfo;
  onPageChange: (offset: number) => void;
}>) {
  if (page.total === 0) return null;

  const currentPage = Math.floor(page.offset / page.limit);
  const totalPages = Math.ceil(page.total / page.limit);
  const start = page.offset + 1;
  const end = Math.min(page.offset + page.limit, page.total);

  return (
    <div className="flex items-center justify-between rounded-lg border border-border p-4 bg-muted/30">
      <div className="text-sm text-muted-foreground">
        Showing {start} to {end} of {page.total}
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          iconLeft={<ChevronLeft className="h-4 w-4" />}
          disabled={currentPage === 0}
          onClick={() => onPageChange(Math.max(0, page.offset - page.limit))}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          iconRight={<ChevronRight className="h-4 w-4" />}
          disabled={currentPage >= totalPages - 1}
          onClick={() => onPageChange(page.offset + page.limit)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
