// Minimal singleton toast — one message at a time, auto-dismissed after
// 2.4s. Callers: `toastState.show('Added to list')`.

class ToastState {
  message = $state('');
  visible = $state(false);
  kind = $state<'info' | 'error'>('info');
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  show(message: string, kind: 'info' | 'error' = 'info') {
    this.message = message;
    this.kind = kind;
    this.visible = true;
    if (this.timeoutId) clearTimeout(this.timeoutId);
    this.timeoutId = setTimeout(() => {
      this.visible = false;
    }, 2400);
  }

  hide() {
    this.visible = false;
    if (this.timeoutId) clearTimeout(this.timeoutId);
    this.timeoutId = null;
  }
}

export const toastState = new ToastState();
