export function StubPage({ title, story }: { title: string; story: string }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Coming in {story} — see docs/STORIES.md.
      </p>
    </main>
  );
}
