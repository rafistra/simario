import { create } from 'zustand';

export interface ToastItem {
  id: number;
  variant: 'success' | 'error';
  title: string;
  message?: string;
}

interface ToastState {
  toasts: ToastItem[];
  push: (toast: Omit<ToastItem, 'id'>) => void;
  dismiss: (id: number) => void;
}

let nextToastId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (toast) =>
    set((state) => ({
      // Stack max 3 (.pen Toast context); newest on top.
      toasts: [{ ...toast, id: nextToastId++ }, ...state.toasts].slice(0, 3),
    })),
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

/** Convenience API: toast.success('Penilaian dituntaskan', '8 risiko dituntaskan untuk TW I.'). */
export const toast = {
  success: (title: string, message?: string) =>
    useToastStore.getState().push({ variant: 'success', title, message }),
  error: (title: string, message?: string) =>
    useToastStore.getState().push({ variant: 'error', title, message }),
};
