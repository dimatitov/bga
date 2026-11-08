import { type ReactNode } from 'react';

export interface VisuallyHiddenProps {
  children?: ReactNode;
  /** Optional id, e.g. for `aria-describedby`. */
  id?: string;
}

const style = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

/** Content for assistive technology only. */
export function VisuallyHidden({ children, id }: VisuallyHiddenProps) {
  return (
    <span id={id} style={style}>
      {children}
    </span>
  );
}
