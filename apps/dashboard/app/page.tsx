export default function HomePage() {
  return (
    <main className="space-y-6">
      <h1 className="text-3xl font-bold">Unified Shipping Dashboard</h1>
      <p className="text-gray-600">Welcome! This is your starting point.</p>
      <div className="rounded-md border bg-white p-4 shadow">
        <p className="text-sm text-gray-700">
          Healthcheck endpoint: <code className="rounded bg-gray-100 px-1">/api/health</code>
        </p>
      </div>
    </main>
  );
}
