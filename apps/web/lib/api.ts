export type Source = {
  id: string;
  username: string;
  title: string;
  description: string;
  last_message_id?: number | null;
  checked_at?: string | null;
};

export type Media = {
  id: string;
  post_id: string;
  kind: string;
  storage_url: string;
  sort_order: number;
};

export type Post = {
  id: string;
  source_id: string;
  source_username: string;
  telegram_message_id: number;
  raw_text: string;
  edited_text: string;
  telegram_entities: unknown[];
  status: "new" | "editing" | "ready" | "published" | "archived";
  posted_at?: string | null;
  media: Media[];
};

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function getSources() {
  return request<{ sources: Source[] }>("/api/sources");
}

export function createSource(username: string) {
  return request<{ source: Source }>("/api/sources", {
    method: "POST",
    body: JSON.stringify({ username }),
  });
}

export function getPosts(params: URLSearchParams) {
  const query = params.toString();
  return request<{ posts: Post[] }>(`/api/posts${query ? `?${query}` : ""}`);
}

export function saveDraft(postId: string, editedText: string, status: Post["status"]) {
  return request<{ status: string }>(`/api/posts/${postId}/draft`, {
    method: "PATCH",
    body: JSON.stringify({
      edited_text: editedText,
      telegram_entities: [],
      status,
    }),
  });
}

export function createPublishTask(postId: string, targetChannelUsername: string) {
  return request<{ publish_task: unknown }>("/api/publish_tasks", {
    method: "POST",
    body: JSON.stringify({ post_id: postId, target_channel_username: targetChannelUsername }),
  });
}
