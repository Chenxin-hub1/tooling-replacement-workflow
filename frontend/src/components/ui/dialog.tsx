import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { X } from "lucide-react";
export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className={`modal ${wide ? "modal-wide" : ""}`}>
          <div className="modal-head">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{description}</Dialog.Description>
            </div>
            <Dialog.Close aria-label="Close dialog" className="icon-button">
              <X size={20} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
