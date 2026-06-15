package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID         uuid.UUID `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	TelegramID *int64    `json:"telegram_id"`
	Username   string    `json:"username"`
	FirstName  string    `json:"first_name"`
	LastName   string    `json:"last_name"`
	PhotoURL   string    `json:"photo_url"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type TelegramAccount struct {
	ID             uuid.UUID  `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	UserID         uuid.UUID  `gorm:"type:uuid;index" json:"user_id"`
	TelegramUserID *int64     `json:"telegram_user_id"`
	Username       string     `json:"username"`
	DisplayName    string     `json:"display_name"`
	SessionRef     string     `json:"session_ref"`
	IsTechnical    bool       `json:"is_technical"`
	ConnectedAt    *time.Time `json:"connected_at"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

type Source struct {
	ID                uuid.UUID  `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	UserID            uuid.UUID  `gorm:"type:uuid;index" json:"user_id"`
	TelegramAccountID *uuid.UUID `gorm:"type:uuid" json:"telegram_account_id"`
	Username          string     `json:"username"`
	Title             string     `json:"title"`
	Description       string     `json:"description"`
	TelegramChannelID *int64     `json:"telegram_channel_id"`
	AccessHash        string     `json:"access_hash"`
	LastMessageID     *int64     `json:"last_message_id"`
	IsActive          bool       `json:"is_active"`
	CheckedAt         *time.Time `json:"checked_at"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
}

type PostStatus string

const (
	PostStatusNew       PostStatus = "new"
	PostStatusEditing   PostStatus = "editing"
	PostStatusReady     PostStatus = "ready"
	PostStatusPublished PostStatus = "published"
	PostStatusArchived  PostStatus = "archived"
)

type Post struct {
	ID                uuid.UUID       `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	UserID            uuid.UUID       `gorm:"type:uuid;index" json:"user_id"`
	SourceID          uuid.UUID       `gorm:"type:uuid;index" json:"source_id"`
	TelegramMessageID int64           `json:"telegram_message_id"`
	RawText           string          `json:"raw_text"`
	EditedText        string          `json:"edited_text"`
	TelegramEntities  json.RawMessage `gorm:"type:jsonb" json:"telegram_entities"`
	Status            PostStatus      `gorm:"type:post_status" json:"status"`
	PublishedAt       *time.Time      `json:"published_at"`
	PostedAt          *time.Time      `json:"posted_at"`
	CreatedAt         time.Time       `json:"created_at"`
	UpdatedAt         time.Time       `json:"updated_at"`
}

type Media struct {
	ID             uuid.UUID `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	UserID         uuid.UUID `gorm:"type:uuid;index" json:"user_id"`
	PostID         uuid.UUID `gorm:"type:uuid;index" json:"post_id"`
	Kind           string    `gorm:"type:media_kind" json:"kind"`
	StorageURL     string    `json:"storage_url"`
	ThumbnailURL   string    `json:"thumbnail_url"`
	MimeType       string    `json:"mime_type"`
	FileSize       int64     `json:"file_size"`
	Width          int       `json:"width"`
	Height         int       `json:"height"`
	SortOrder      int       `json:"sort_order"`
	TelegramFileID string    `json:"telegram_file_id"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type PublishTask struct {
	ID                    uuid.UUID  `gorm:"type:uuid;default:uuid_generate_v4();primaryKey" json:"id"`
	UserID                uuid.UUID  `gorm:"type:uuid;index" json:"user_id"`
	PostID                uuid.UUID  `gorm:"type:uuid;index" json:"post_id"`
	TargetChannelUsername string     `json:"target_channel_username"`
	Status                string     `gorm:"type:publish_task_status" json:"status"`
	BotMessageID          *int64     `json:"bot_message_id"`
	ErrorMessage          string     `json:"error_message"`
	ScheduledAt           *time.Time `json:"scheduled_at"`
	PublishedAt           *time.Time `json:"published_at"`
	CreatedAt             time.Time  `json:"created_at"`
	UpdatedAt             time.Time  `json:"updated_at"`
}
