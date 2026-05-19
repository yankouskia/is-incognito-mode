import {
  detectIncognito,
  IncognitoDetectionError,
  type DetectionResult,
} from 'is-incognito-mode';
import { useEffect, useState } from 'react';

type ViewState =
  | { status: 'pending' }
  | { status: 'ok'; result: DetectionResult }
  | { status: 'error'; code: string; message: string };

export function App() {
  const [state, setState] = useState<ViewState>({ status: 'pending' });

  useEffect(() => {
    let cancelled = false;
    detectIncognito()
      .then((result) => {
        if (!cancelled) setState({ status: 'ok', result });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof IncognitoDetectionError) {
          setState({
            status: 'error',
            code: error.code,
            message: error.message,
          });
        } else {
          setState({
            status: 'error',
            code: 'UNKNOWN',
            message: String(error),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui', padding: '2rem', maxWidth: 600 }}>
      <h1>is-incognito-mode demo</h1>
      {state.status === 'pending' && <p>Probing…</p>}
      {state.status === 'ok' && (
        <>
          <p>
            <strong>
              {state.result.isPrivate
                ? 'Incognito / private mode detected.'
                : 'Regular browsing window.'}
            </strong>
          </p>
          <pre>{JSON.stringify(state.result, null, 2)}</pre>
        </>
      )}
      {state.status === 'error' && (
        <p>
          Detection failed ({state.code}): {state.message}
        </p>
      )}
    </main>
  );
}
