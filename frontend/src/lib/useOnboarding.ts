import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { useAuthStore } from '@/store/auth.store';

export interface OnboardingData {
  productType: 'pos' | 'contable';
  steps: Record<string, boolean>;
  state: { welcomeSeen: boolean; tourDone: boolean; dismissed: boolean };
  nextStep: string | null;
}

// Estado del onboarding (primeros pasos) del negocio actual. Los pasos se
// auto-marcan con datos reales; el estado (bienvenida/tour/oculto) vive en la BD
// (cross-device). Compartido por el checklist, la bienvenida y —luego— el tour.
export function useOnboarding() {
  const businessId = useAuthStore((s) => s.user?.businessId);
  const qc = useQueryClient();

  const { data } = useQuery<OnboardingData>({
    queryKey: ['onboarding', businessId],
    queryFn: () => api.get('/onboarding').then((r) => r.data.data),
    enabled: !!businessId,
    staleTime: 60_000,
  });

  const mut = useMutation({
    mutationFn: (body: { welcomeSeen?: boolean; tourDone?: boolean; dismissed?: boolean; firstSale?: boolean }) =>
      api.patch('/onboarding', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['onboarding', businessId] }),
  });

  return { data, patchState: mut.mutate };
}
