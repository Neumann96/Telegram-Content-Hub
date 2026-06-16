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

export type Bootstrap = {
  telegram_login_bot: string;
  minio_bucket: string;
  features: string[];
};

export type TelegramLoginPayload = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

export type User = {
  id: string;
  telegram_id?: number | null;
  username: string;
  first_name: string;
  last_name: string;
  photo_url: string;
};

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
const authStorageKey = "telegram-content-hub-user";

export function getStoredUser(): User | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(authStorageKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    window.localStorage.removeItem(authStorageKey);
    return null;
  }
}

export function storeUser(user: User) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(authStorageKey, JSON.stringify(user));
  }
}

export function clearStoredUser() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(authStorageKey);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const user = getStoredUser();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(user?.id ? { "X-User-ID": user.id } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function getBootstrap() {
  return request<Bootstrap>("/api/bootstrap");
}

export function loginWithTelegram(payload: TelegramLoginPayload) {
  return request<{ user: User }>("/api/auth/telegram", {
    method: "POST",
    body: JSON.stringify(payload),
  });
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
