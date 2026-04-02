"use client";

import { useParams } from "next/navigation";

export default function EditorPage() {
  const params = useParams<{ slug: string }>();

  return (
    <main style={{ padding: "2rem" }}>
      <h1>Editor</h1>
      <p>Document: {params.slug}</p>
      <p>The collaborative editor will be rendered here.</p>
    </main>
  );
}
