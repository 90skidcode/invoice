import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export interface PaymentModeData {
  id: string;
  name: string;
  type: string;
  badge_color: string;
  order_index: number;
  is_active: boolean;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
  deleted_at: string | null;
}

export function usePaymentModes() {
  return useQuery<PaymentModeData[]>({
    queryKey: ['payment-modes'],
    queryFn: () => api.get<PaymentModeData[]>('/payment-modes'),
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}
