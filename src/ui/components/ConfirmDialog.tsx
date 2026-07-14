interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  onConfirm(): void;
  onCancel(): void;
}

export function ConfirmDialog({ open, title, message, onConfirm, onCancel }: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <h2 id="dialog-title">{title}</h2>
        <p>{message}</p>
        <div className="dialog-actions">
          <button type="button" className="button ghost" onClick={onCancel}>Отмена</button>
          <button type="button" className="button danger" onClick={onConfirm}>Подтвердить</button>
        </div>
      </section>
    </div>
  );
}
