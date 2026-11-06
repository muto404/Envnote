import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

interface ModalProps {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
  locked?: boolean;
}

export function Modal({ title, description, children, actions, onClose, locked }: ModalProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    return () => element.close();
  }, []);

  return (
    <dialog
      className="modal"
      ref={dialog}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (!locked) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !locked) onClose();
      }}
    >
      <section className="modal-content">
        <header className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-button modal-close" type="button" title="关闭" aria-label="关闭" disabled={locked} onClick={onClose}>
            <X size={17} />
          </button>
        </header>
        {description && <div className="modal-description" id={descriptionId}>{description}</div>}
        {children}
        {actions && <footer className="modal-actions">{actions}</footer>}
      </section>
    </dialog>
  );
}

interface ConfirmationProps {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function Confirmation({ title, description, confirmLabel, cancelLabel = "取消", danger, onConfirm, onClose }: ConfirmationProps) {
  return (
    <Modal title={title} description={description} onClose={onClose} actions={
      <>
        <button className="button secondary" onClick={onClose}>{cancelLabel}</button>
        <button className={danger ? "button danger" : "button primary"} onClick={onConfirm}>{confirmLabel}</button>
      </>
    } />
  );
}
