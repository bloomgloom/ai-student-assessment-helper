import { ChangeEvent, TextareaHTMLAttributes, useLayoutEffect, useRef } from 'react';

type TextareaViewport = {
  scrollTop: number;
  scrollLeft: number;
  selectionStart: number;
  selectionEnd: number;
  selectionDirection: 'forward' | 'backward' | 'none' | null;
};

export function StableTextarea({
  value,
  onChange,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingViewportRef = useRef<TextareaViewport | null>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    const viewport = pendingViewportRef.current;
    if (!textarea || !viewport) return;

    if (document.activeElement === textarea) {
      textarea.setSelectionRange(
        viewport.selectionStart,
        viewport.selectionEnd,
        viewport.selectionDirection || undefined
      );
    }
    textarea.scrollTop = viewport.scrollTop;
    textarea.scrollLeft = viewport.scrollLeft;
    pendingViewportRef.current = null;
  }, [value]);

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget;
    pendingViewportRef.current = {
      scrollTop: textarea.scrollTop,
      scrollLeft: textarea.scrollLeft,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
      selectionDirection: textarea.selectionDirection,
    };
    onChange?.(event);
  };

  return (
    <textarea
      {...props}
      ref={textareaRef}
      value={value}
      onChange={handleChange}
    />
  );
}
