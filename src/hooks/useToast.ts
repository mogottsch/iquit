import * as React from 'react';

import type { ToastActionElement, ToastProps } from '@/components/ui/toast';

const TOAST_LIMIT = 1;
const TOAST_REMOVE_DELAY = 1000000;

type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

const actionTypes = {
  ADD_TOAST: 'ADD_TOAST',
  UPDATE_TOAST: 'UPDATE_TOAST',
  DISMISS_TOAST: 'DISMISS_TOAST',
  REMOVE_TOAST: 'REMOVE_TOAST',
} as const;

let count = 0;

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

type ActionType = typeof actionTypes;

type Action =
  | {
      type: ActionType['ADD_TOAST'];
      toast: ToasterToast;
    }
  | {
      type: ActionType['UPDATE_TOAST'];
      toast: Partial<ToasterToast>;
    }
  | {
      type: ActionType['DISMISS_TOAST'];
      toastId?: ToasterToast['id'];
    }
  | {
      type: ActionType['REMOVE_TOAST'];
      toastId?: ToasterToast['id'];
    };

interface ToastState {
  toasts: ToasterToast[];
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return;
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({
      type: 'REMOVE_TOAST',
      toastId: toastId,
    });
  }, TOAST_REMOVE_DELAY);

  toastTimeouts.set(toastId, timeout);
};

const handleAddToast = (state: ToastState, toast: ToasterToast): ToastState => ({
  ...state,
  toasts: [toast, ...state.toasts].slice(0, TOAST_LIMIT),
});

const handleUpdateToast = (state: ToastState, toast: Partial<ToasterToast>): ToastState => ({
  ...state,
  toasts: state.toasts.map((t) => (t.id === toast.id ? { ...t, ...toast } : t)),
});

const queueToastsForRemoval = (toasts: ToasterToast[], toastId?: string): void => {
  if (toastId) {
    addToRemoveQueue(toastId);
  } else {
    toasts.forEach((t) => addToRemoveQueue(t.id));
  }
};

const markToastsAsClosed = (toasts: ToasterToast[], toastId?: string): ToasterToast[] =>
  toasts.map((t) => (t.id === toastId || toastId === undefined ? { ...t, open: false } : t));

const handleDismissToast = ({ toasts, ...rest }: ToastState, toastId?: string): ToastState => {
  queueToastsForRemoval(toasts, toastId);
  const updatedToasts = markToastsAsClosed(toasts, toastId);

  return {
    ...rest,
    toasts: updatedToasts,
  };
};

const handleRemoveToast = ({ toasts, ...rest }: ToastState, toastId?: string): ToastState => {
  if (toastId === undefined) {
    return {
      ...rest,
      toasts: [],
    };
  }
  return {
    ...rest,
    toasts: toasts.filter((t) => t.id !== toastId),
  };
};

export const reducer = (state: ToastState, action: Action): ToastState => {
  switch (action.type) {
    case 'ADD_TOAST':
      return handleAddToast(state, action.toast);
    case 'UPDATE_TOAST':
      return handleUpdateToast(state, action.toast);
    case 'DISMISS_TOAST':
      return handleDismissToast(state, action.toastId);
    case 'REMOVE_TOAST':
      return handleRemoveToast(state, action.toastId);
  }
};

const listeners: Array<(_: ToastState) => void> = [];

let memoryState: ToastState = { toasts: [] };

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => {
    listener(memoryState);
  });
}

type Toast = Omit<ToasterToast, 'id'>;

function createToast(props: Toast) {
  const id = genId();

  const update = (props: ToasterToast) =>
    dispatch({
      type: 'UPDATE_TOAST',
      toast: { ...props, id },
    });

  const dismiss = () => dispatch({ type: 'DISMISS_TOAST', toastId: id });

  dispatch({
    type: 'ADD_TOAST',
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss();
      },
    },
  });

  return {
    id,
    dismiss,
    update,
  };
}

function useToast() {
  const [, setState] = React.useState<ToastState>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, [setState]);

  return {
    ...memoryState,
    toast: createToast,
    dismiss: (toastId?: string) => dispatch({ type: 'DISMISS_TOAST', toastId }),
  };
}

export { useToast, createToast as toast };
