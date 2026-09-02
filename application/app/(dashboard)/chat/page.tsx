import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ChatPageClient } from "./chat-page-client";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }

  const aiApiUrl = process.env.NEXT_PUBLIC_AI_API_URL ?? "";
  const { q } = await searchParams;
  // Next.js already URL-decodes searchParams values; pass through as-is.
  const initialPrompt = q && q.trim() ? q : null;

  return (
    <ChatPageClient
      aiApiUrl={aiApiUrl}
      initialPrompt={initialPrompt}
      auth0Sub={currentUser.auth0Sub}
    />
  );
}
