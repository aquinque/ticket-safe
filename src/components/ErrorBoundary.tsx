import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "system-ui, sans-serif",
            padding: "2rem",
            textAlign: "center",
            background: "#f8fafc",
          }}
        >
          <img
            src="/ticket-safe-logo.png"
            alt="Ticket Safe"
            style={{ width: 64, height: 64, marginBottom: "1.5rem" }}
          />
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", marginBottom: "0.5rem" }}>
            Something went wrong
          </h1>
          <p style={{ color: "#64748b", marginBottom: "1.5rem", maxWidth: 400 }}>
            An unexpected error occurred. Please refresh the page — if the problem persists, contact support.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: "#1E5EFF",
              color: "#fff",
              border: "none",
              borderRadius: "0.5rem",
              padding: "0.625rem 1.5rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Refresh page
          </button>
          {import.meta.env.DEV && this.state.error && (
            <pre
              style={{
                marginTop: "2rem",
                padding: "1rem",
                background: "#fee2e2",
                borderRadius: "0.5rem",
                fontSize: "0.75rem",
                color: "#991b1b",
                maxWidth: 600,
                overflow: "auto",
                textAlign: "left",
              }}
            >
              {this.state.error.toString()}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
