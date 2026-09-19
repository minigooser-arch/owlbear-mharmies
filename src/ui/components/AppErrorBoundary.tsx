import { Component, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryState {
  error?: Error;
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {};

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return {
      error: error instanceof Error ? error : new Error(String(error))
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Letopis Armies] UI render failed", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="state-screen warning" role="alert">
          <div>
            <strong>Ошибка интерфейса расширения.</strong>
            <p>{this.state.error.message}</p>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
