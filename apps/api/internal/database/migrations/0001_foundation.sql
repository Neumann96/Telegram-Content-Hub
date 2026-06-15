CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE post_status AS ENUM ('new', 'editing', 'ready', 'published', 'archived');
CREATE TYPE media_kind AS ENUM ('photo', 'video', 'document', 'animation');
CREATE TYPE publish_task_status AS ENUM ('queued', 'processing', 'completed', 'failed', 'cancelled');

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    telegram_id BIGINT UNIQUE,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    photo_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE telegram_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    telegram_user_id BIGINT,
    username TEXT,
    display_name TEXT,
    session_ref TEXT,
    is_technical BOOLEAN NOT NULL DEFAULT false,
    connected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    telegram_account_id UUID REFERENCES telegram_accounts(id) ON DELETE SET NULL,
    username TEXT NOT NULL,
    title TEXT,
    description TEXT,
    telegram_channel_id BIGINT,
    access_hash TEXT,
    last_message_id BIGINT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    checked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, username)
);

CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    telegram_message_id BIGINT NOT NULL,
    raw_text TEXT NOT NULL DEFAULT '',
    edited_text TEXT,
    telegram_entities JSONB NOT NULL DEFAULT '[]'::jsonb,
    status post_status NOT NULL DEFAULT 'new',
    published_at TIMESTAMPTZ,
    posted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source_id, telegram_message_id)
);

CREATE TABLE media (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    kind media_kind NOT NULL DEFAULT 'photo',
    storage_url TEXT NOT NULL,
    thumbnail_url TEXT,
    mime_type TEXT,
    file_size BIGINT,
    width INTEGER,
    height INTEGER,
    sort_order INTEGER NOT NULL DEFAULT 0,
    telegram_file_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE publish_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    target_channel_username TEXT NOT NULL,
    status publish_task_status NOT NULL DEFAULT 'queued',
    bot_message_id BIGINT,
    error_message TEXT,
    scheduled_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_telegram_accounts_user_id ON telegram_accounts(user_id);
CREATE INDEX idx_sources_user_id ON sources(user_id);
CREATE INDEX idx_sources_username ON sources(username);
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_source_id ON posts(source_id);
CREATE INDEX idx_posts_status ON posts(status);
CREATE INDEX idx_posts_posted_at ON posts(posted_at);
CREATE INDEX idx_posts_search ON posts USING gin(to_tsvector('simple', coalesce(raw_text, '') || ' ' || coalesce(edited_text, '')));
CREATE INDEX idx_media_user_id ON media(user_id);
CREATE INDEX idx_media_post_id ON media(post_id);
CREATE INDEX idx_publish_tasks_user_id ON publish_tasks(user_id);
CREATE INDEX idx_publish_tasks_post_id ON publish_tasks(post_id);
CREATE INDEX idx_publish_tasks_status ON publish_tasks(status);
