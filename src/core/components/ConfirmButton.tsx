"use client";

/**
 * A submit button that asks first. Used where an action replaces or removes
 * something that cannot be got back, such as a page's draft. If the person
 * cancels, nothing is sent.
 */
export function ConfirmButton({
  message,
  children,
  className,
  ariaLabel,
}: {
  message: string;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      aria-label={ariaLabel}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
