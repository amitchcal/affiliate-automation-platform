/**
 * The confirmation or refusal a screen shows after a save. Keyed on the
 * message, so a new message replaces the old element rather than patching it.
 */
export function StatusMessages({ notice, error }: { notice?: string; error?: string }) {
  return (
    <>
      {notice ? (
        <p key={`notice:${notice}`} className="notice" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p key={`error:${error}`} className="error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
