import React from "react";

/**
 * App-level error boundary. A render crash anywhere under <App/> shows this
 * fallback instead of a blank page, with a lightweight "Try again" re-render
 * and a full reload as a last resort. Logs only the error message and
 * component stack to the console — no user data.
 */
export default class ErrorBoundary extends React.Component {
	constructor(props) {
		super(props);
		this.state = { error: null };
	}

	static getDerivedStateFromError(error) {
		return { error };
	}

	componentDidCatch(error, info) {
		console.error("[ErrorBoundary]", error, info?.componentStack || "");
	}

	handleRetry = () => {
		this.setState({ error: null });
	};

	handleReload = () => {
		window.location.reload();
	};

	render() {
		const { error } = this.state;
		if (!error) return this.props.children;
		return (
			<div
				role="alert"
				className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-6"
			>
				<div className="max-w-md w-full rounded-2xl border-2 border-red-200 dark:border-red-800 bg-red-50/70 dark:bg-red-900/20 p-6 text-center">
					<h1 className="text-lg font-bold text-red-800 dark:text-red-200">
						Something went wrong
					</h1>
					<p className="mt-2 text-sm text-red-700 dark:text-red-300">
						The app hit an unexpected error and stopped rendering. Your
						saved trips and reports are stored on this device and were
						not lost.
					</p>
					<pre className="mt-3 max-h-32 overflow-auto rounded-lg bg-red-100/80 dark:bg-red-900/40 p-2 text-left text-[11px] whitespace-pre-wrap text-red-900 dark:text-red-100">
						{String(error?.message || error)}
					</pre>
					<div className="mt-4 flex items-center justify-center gap-3">
						<button
							onClick={this.handleRetry}
							className="rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 transition-colors"
						>
							Try again
						</button>
						<button
							onClick={this.handleReload}
							className="rounded-xl border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 text-sm font-semibold px-4 py-2 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
						>
							Reload app
						</button>
					</div>
				</div>
			</div>
		);
	}
}
