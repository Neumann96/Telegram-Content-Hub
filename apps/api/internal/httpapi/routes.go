package httpapi

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"telegram-content-hub/apps/api/internal/config"
	"telegram-content-hub/apps/api/internal/models"
)

type Server struct {
	db  *gorm.DB
	cfg config.Config
}

func RegisterRoutes(router *gin.Engine, db *gorm.DB, cfg config.Config) {
	server := Server{db: db, cfg: cfg}

	router.GET("/api/health", server.health)
	router.GET("/api/bootstrap", server.bootstrap)

	router.POST("/api/auth/telegram", server.telegramLogin)
	worker := router.Group("/api/worker")
	worker.Use(server.workerContext)
	worker.GET("/sources", server.workerListSources)
	worker.PATCH("/sources/:id", server.workerUpdateSource)
	worker.POST("/posts/ingest", server.workerIngestPost)
	worker.GET("/publish_tasks/next", server.workerNextPublishTask)
	worker.PATCH("/publish_tasks/:id", server.workerUpdatePublishTask)

	api := router.Group("/api")
	api.Use(server.userContext)
	api.GET("/sources", server.listSources)
	api.POST("/sources", server.createSource)
	api.PATCH("/sources/:id", server.updateSource)
	api.GET("/posts", server.listPosts)
	api.GET("/posts/:id", server.getPost)
	api.PATCH("/posts/:id/draft", server.saveDraft)
	api.POST("/posts/ingest", server.ingestPost)
	api.POST("/media", server.createMedia)
	api.PATCH("/media/:id", server.updateMedia)
	api.DELETE("/media/:id", server.deleteMedia)
	api.POST("/publish_tasks", server.createPublishTask)
	api.GET("/publish_tasks/next", server.nextPublishTask)
	api.PATCH("/publish_tasks/:id", server.updatePublishTask)
}

func (s Server) health(ctx *gin.Context) {
	sqlDB, err := s.db.DB()
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"status": "error", "error": err.Error()})
		return
	}
	if err := sqlDB.PingContext(ctx.Request.Context()); err != nil {
		ctx.JSON(http.StatusServiceUnavailable, gin.H{"status": "error", "error": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"service": "telegram-content-hub-api",
	})
}

func (s Server) bootstrap(ctx *gin.Context) {
	ctx.JSON(http.StatusOK, gin.H{
		"telegram_login_bot": s.cfg.TelegramLoginBotName,
		"auth": gin.H{
			"telegram_login_bot_configured": s.cfg.TelegramLoginBotName != "",
			"telegram_bot_token_configured": s.cfg.TelegramBotToken != "",
		},
		"minio_bucket": s.cfg.MinIOBucket,
		"features": []string{
			"telegram_login",
			"source_channels",
			"post_editor",
			"media_library",
			"bot_publishing",
		},
	})
}

type telegramLoginRequest struct {
	ID        int64  `json:"id"`
	Username  string `json:"username"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	PhotoURL  string `json:"photo_url"`
	AuthDate  int64  `json:"auth_date"`
	Hash      string `json:"hash"`
}

func (s Server) telegramLogin(ctx *gin.Context) {
	var req telegramLoginRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.ID == 0 {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "telegram id is required"})
		return
	}
	if req.AuthDate == 0 {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "auth_date is required"})
		return
	}
	if time.Since(time.Unix(req.AuthDate, 0)) > 24*time.Hour {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "telegram login payload expired"})
		return
	}
	if s.cfg.TelegramBotToken != "" && !validTelegramLogin(req, s.cfg.TelegramBotToken) {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "invalid telegram login hash"})
		return
	}

	var user models.User
	err := s.db.Where("telegram_id = ?", req.ID).First(&user).Error
	if err != nil && err != gorm.ErrRecordNotFound {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	telegramID := req.ID
	user.TelegramID = &telegramID
	user.Username = req.Username
	user.FirstName = req.FirstName
	user.LastName = req.LastName
	user.PhotoURL = req.PhotoURL

	if user.ID == uuid.Nil {
		if err := s.db.Create(&user).Error; err != nil {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	} else if err := s.db.Save(&user).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"user": user})
}

func validTelegramLogin(req telegramLoginRequest, botToken string) bool {
	values := map[string]string{
		"auth_date":  formatInt(req.AuthDate),
		"first_name": req.FirstName,
		"id":         formatInt(req.ID),
		"last_name":  req.LastName,
		"photo_url":  req.PhotoURL,
		"username":   req.Username,
	}

	lines := make([]string, 0, len(values))
	for key, value := range values {
		if value != "" {
			lines = append(lines, key+"="+value)
		}
	}
	sort.Strings(lines)

	secret := sha256.Sum256([]byte(botToken))
	mac := hmac.New(sha256.New, secret[:])
	mac.Write([]byte(strings.Join(lines, "\n")))
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(req.Hash))
}

func formatInt(value int64) string {
	return strconv.FormatInt(value, 10)
}

func (s Server) userContext(ctx *gin.Context) {
	userIDHeader := ctx.GetHeader("X-User-ID")
	if userIDHeader != "" {
		userID, err := uuid.Parse(userIDHeader)
		if err != nil {
			ctx.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid X-User-ID"})
			return
		}
		ctx.Set("user_id", userID)
		ctx.Next()
		return
	}

	user, err := s.ensureDevUser()
	if err != nil {
		ctx.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	ctx.Set("user_id", user.ID)
	ctx.Next()
}

func (s Server) ensureDevUser() (models.User, error) {
	var user models.User
	err := s.db.Where("username = ?", "dev").First(&user).Error
	if err == nil {
		return user, nil
	}
	if err != gorm.ErrRecordNotFound {
		return user, err
	}
	user = models.User{Username: "dev", FirstName: "Development"}
	return user, s.db.Create(&user).Error
}

func currentUserID(ctx *gin.Context) uuid.UUID {
	return ctx.MustGet("user_id").(uuid.UUID)
}

func (s Server) workerContext(ctx *gin.Context) {
	if s.cfg.WorkerToken == "" {
		ctx.Next()
		return
	}
	if ctx.GetHeader("X-Worker-Token") != s.cfg.WorkerToken {
		ctx.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid worker token"})
		return
	}
	ctx.Next()
}

type sourceRequest struct {
	Username          string `json:"username"`
	Title             string `json:"title"`
	Description       string `json:"description"`
	TelegramChannelID *int64 `json:"telegram_channel_id"`
	LastMessageID     *int64 `json:"last_message_id"`
}

func (s Server) listSources(ctx *gin.Context) {
	var sources []models.Source
	if err := s.db.Where("user_id = ?", currentUserID(ctx)).Order("created_at DESC").Find(&sources).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"sources": sources})
}

func (s Server) workerListSources(ctx *gin.Context) {
	var sources []models.Source
	if err := s.db.Where("is_active = ?", true).Order("created_at DESC").Find(&sources).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"sources": sources})
}

func (s Server) createSource(ctx *gin.Context) {
	var req sourceRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	username := normalizeUsername(req.Username)
	if username == "" {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "username is required"})
		return
	}
	now := time.Now().UTC()
	source := models.Source{
		UserID:            currentUserID(ctx),
		Username:          username,
		Title:             req.Title,
		Description:       req.Description,
		TelegramChannelID: req.TelegramChannelID,
		LastMessageID:     req.LastMessageID,
		IsActive:          true,
		CheckedAt:         &now,
	}
	if err := s.db.Create(&source).Error; err != nil {
		ctx.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		return
	}
	ctx.JSON(http.StatusCreated, gin.H{"source": source})
}

func (s Server) updateSource(ctx *gin.Context) {
	id, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid source id"})
		return
	}
	var req sourceRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updates := map[string]any{
		"title":               req.Title,
		"description":         req.Description,
		"telegram_channel_id": req.TelegramChannelID,
		"last_message_id":     req.LastMessageID,
		"checked_at":          time.Now().UTC(),
		"updated_at":          time.Now().UTC(),
	}
	if err := s.db.Model(&models.Source{}).Where("id = ? AND user_id = ?", id, currentUserID(ctx)).Updates(updates).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (s Server) workerUpdateSource(ctx *gin.Context) {
	id, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid source id"})
		return
	}
	var req sourceRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updates := map[string]any{
		"title":               req.Title,
		"description":         req.Description,
		"telegram_channel_id": req.TelegramChannelID,
		"last_message_id":     req.LastMessageID,
		"checked_at":          time.Now().UTC(),
		"updated_at":          time.Now().UTC(),
	}
	if err := s.db.Model(&models.Source{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func normalizeUsername(username string) string {
	username = strings.TrimSpace(username)
	username = strings.TrimPrefix(username, "https://t.me/")
	username = strings.TrimPrefix(username, "http://t.me/")
	username = strings.TrimPrefix(username, "t.me/")
	username = strings.TrimPrefix(username, "@")
	if username == "" {
		return ""
	}
	return "@" + username
}

type postResponse struct {
	models.Post
	SourceUsername string         `json:"source_username"`
	Media          []models.Media `json:"media" gorm:"-"`
}

func (s Server) listPosts(ctx *gin.Context) {
	userID := currentUserID(ctx)
	query := s.db.Table("posts").
		Select("posts.*, sources.username AS source_username").
		Joins("JOIN sources ON sources.id = posts.source_id").
		Where("posts.user_id = ?", userID).
		Order("COALESCE(posts.posted_at, posts.created_at) DESC")

	if sourceID := ctx.Query("source_id"); sourceID != "" {
		query = query.Where("posts.source_id = ?", sourceID)
	}
	if status := ctx.Query("status"); status != "" {
		query = query.Where("posts.status = ?", status)
	}
	if q := strings.TrimSpace(ctx.Query("q")); q != "" {
		query = query.Where("posts.raw_text ILIKE ? OR posts.edited_text ILIKE ?", "%"+q+"%", "%"+q+"%")
	}
	if dateFrom := ctx.Query("date_from"); dateFrom != "" {
		query = query.Where("COALESCE(posts.posted_at, posts.created_at) >= ?", dateFrom)
	}
	if dateTo := ctx.Query("date_to"); dateTo != "" {
		query = query.Where("COALESCE(posts.posted_at, posts.created_at) <= ?", dateTo)
	}

	var posts []postResponse
	if err := query.Find(&posts).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	s.attachMedia(userID, posts)
	ctx.JSON(http.StatusOK, gin.H{"posts": posts})
}

func (s Server) getPost(ctx *gin.Context) {
	id, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid post id"})
		return
	}
	var post postResponse
	err = s.db.Table("posts").
		Select("posts.*, sources.username AS source_username").
		Joins("JOIN sources ON sources.id = posts.source_id").
		Where("posts.id = ? AND posts.user_id = ?", id, currentUserID(ctx)).
		First(&post).Error
	if err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "post not found"})
		return
	}
	posts := []postResponse{post}
	s.attachMedia(currentUserID(ctx), posts)
	post = posts[0]
	ctx.JSON(http.StatusOK, gin.H{"post": post})
}

func (s Server) attachMedia(userID uuid.UUID, posts []postResponse) {
	postIDs := make([]uuid.UUID, 0, len(posts))
	for _, post := range posts {
		postIDs = append(postIDs, post.ID)
	}
	if len(postIDs) == 0 {
		return
	}
	var media []models.Media
	if err := s.db.Where("user_id = ? AND post_id IN ?", userID, postIDs).Order("sort_order ASC").Find(&media).Error; err != nil {
		return
	}
	byPost := map[uuid.UUID][]models.Media{}
	for _, item := range media {
		byPost[item.PostID] = append(byPost[item.PostID], item)
	}
	for index := range posts {
		posts[index].Media = byPost[posts[index].ID]
	}
}

type draftRequest struct {
	EditedText       string            `json:"edited_text"`
	TelegramEntities json.RawMessage   `json:"telegram_entities"`
	Status           models.PostStatus `json:"status"`
}

func (s Server) saveDraft(ctx *gin.Context) {
	id, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid post id"})
		return
	}
	var req draftRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	status := req.Status
	if status == "" {
		status = models.PostStatusEditing
	}
	updates := map[string]any{
		"edited_text": req.EditedText,
		"status":      status,
		"updated_at":  time.Now().UTC(),
	}
	if len(req.TelegramEntities) > 0 {
		updates["telegram_entities"] = req.TelegramEntities
	}
	if err := s.db.Model(&models.Post{}).Where("id = ? AND user_id = ?", id, currentUserID(ctx)).Updates(updates).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"status": "ok"})
}

type ingestPostRequest struct {
	SourceID          *uuid.UUID      `json:"source_id"`
	SourceUsername    string          `json:"source_username"`
	TelegramMessageID int64           `json:"telegram_message_id"`
	RawText           string          `json:"raw_text"`
	TelegramEntities  json.RawMessage `json:"telegram_entities"`
	PostedAt          *time.Time      `json:"posted_at"`
	Media             []mediaRequest  `json:"media"`
}

func (s Server) ingestPost(ctx *gin.Context) {
	var req ingestPostRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.TelegramMessageID == 0 {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "telegram_message_id is required"})
		return
	}
	source, err := s.findSource(ctx, req.SourceID, req.SourceUsername)
	if err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "source not found"})
		return
	}

	entities := req.TelegramEntities
	if len(entities) == 0 {
		entities = json.RawMessage("[]")
	}
	post := models.Post{
		UserID:            currentUserID(ctx),
		SourceID:          source.ID,
		TelegramMessageID: req.TelegramMessageID,
		RawText:           req.RawText,
		TelegramEntities:  entities,
		Status:            models.PostStatusNew,
		PostedAt:          req.PostedAt,
	}
	err = s.db.Where("source_id = ? AND telegram_message_id = ?", source.ID, req.TelegramMessageID).Assign(post).FirstOrCreate(&post).Error
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	for _, media := range req.Media {
		media.PostID = post.ID
		_, _ = s.createMediaRecord(ctx, media)
	}
	if source.LastMessageID == nil || req.TelegramMessageID > *source.LastMessageID {
		s.db.Model(&source).Updates(map[string]any{"last_message_id": req.TelegramMessageID, "updated_at": time.Now().UTC()})
	}
	ctx.JSON(http.StatusOK, gin.H{"post": post})
}

func (s Server) workerIngestPost(ctx *gin.Context) {
	var req ingestPostRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.TelegramMessageID == 0 {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "telegram_message_id is required"})
		return
	}
	source, err := s.findWorkerSource(req.SourceID, req.SourceUsername)
	if err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "source not found"})
		return
	}

	entities := req.TelegramEntities
	if len(entities) == 0 {
		entities = json.RawMessage("[]")
	}
	post := models.Post{
		UserID:            source.UserID,
		SourceID:          source.ID,
		TelegramMessageID: req.TelegramMessageID,
		RawText:           req.RawText,
		TelegramEntities:  entities,
		Status:            models.PostStatusNew,
		PostedAt:          req.PostedAt,
	}
	err = s.db.Where("source_id = ? AND telegram_message_id = ?", source.ID, req.TelegramMessageID).Assign(post).FirstOrCreate(&post).Error
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	for _, media := range req.Media {
		media.PostID = post.ID
		_, _ = s.createMediaRecordForUser(source.UserID, media)
	}
	if source.LastMessageID == nil || req.TelegramMessageID > *source.LastMessageID {
		s.db.Model(&source).Updates(map[string]any{"last_message_id": req.TelegramMessageID, "updated_at": time.Now().UTC()})
	}
	ctx.JSON(http.StatusOK, gin.H{"post": post})
}

func (s Server) findSource(ctx *gin.Context, sourceID *uuid.UUID, username string) (models.Source, error) {
	var source models.Source
	query := s.db.Where("user_id = ?", currentUserID(ctx))
	if sourceID != nil {
		return source, query.Where("id = ?", *sourceID).First(&source).Error
	}
	return source, query.Where("username = ?", normalizeUsername(username)).First(&source).Error
}

func (s Server) findWorkerSource(sourceID *uuid.UUID, username string) (models.Source, error) {
	var source models.Source
	if sourceID != nil {
		return source, s.db.Where("id = ?", *sourceID).First(&source).Error
	}
	return source, s.db.Where("username = ?", normalizeUsername(username)).First(&source).Error
}

type mediaRequest struct {
	PostID         uuid.UUID `json:"post_id"`
	Kind           string    `json:"kind"`
	StorageURL     string    `json:"storage_url"`
	ThumbnailURL   string    `json:"thumbnail_url"`
	MimeType       string    `json:"mime_type"`
	FileSize       int64     `json:"file_size"`
	Width          int       `json:"width"`
	Height         int       `json:"height"`
	SortOrder      int       `json:"sort_order"`
	TelegramFileID string    `json:"telegram_file_id"`
}

func (s Server) createMedia(ctx *gin.Context) {
	var req mediaRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.PostID == uuid.Nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "post_id is required"})
		return
	}
	if strings.TrimSpace(req.StorageURL) == "" {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "storage_url is required"})
		return
	}
	media, err := s.createMediaRecord(ctx, req)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	ctx.JSON(http.StatusCreated, gin.H{"media": media})
}

func (s Server) createMediaRecord(ctx *gin.Context, req mediaRequest) (models.Media, error) {
	return s.createMediaRecordForUser(currentUserID(ctx), req)
}

func (s Server) createMediaRecordForUser(userID uuid.UUID, req mediaRequest) (models.Media, error) {
	media := models.Media{
		UserID:         userID,
		PostID:         req.PostID,
		Kind:           fallback(req.Kind, "photo"),
		StorageURL:     req.StorageURL,
		ThumbnailURL:   req.ThumbnailURL,
		MimeType:       req.MimeType,
		FileSize:       req.FileSize,
		Width:          req.Width,
		Height:         req.Height,
		SortOrder:      req.SortOrder,
		TelegramFileID: req.TelegramFileID,
	}
	return media, s.db.Create(&media).Error
}

func (s Server) updateMedia(ctx *gin.Context) {
	id, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid media id"})
		return
	}
	var req mediaRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updates := map[string]any{"updated_at": time.Now().UTC()}
	if req.Kind != "" {
		updates["kind"] = req.Kind
	}
	if req.StorageURL != "" {
		updates["storage_url"] = req.StorageURL
	}
	if req.ThumbnailURL != "" {
		updates["thumbnail_url"] = req.ThumbnailURL
	}
	if req.MimeType != "" {
		updates["mime_type"] = req.MimeType
	}
	if req.FileSize > 0 {
		updates["file_size"] = req.FileSize
	}
	if req.Width > 0 {
		updates["width"] = req.Width
	}
	if req.Height > 0 {
		updates["height"] = req.Height
	}
	updates["sort_order"] = req.SortOrder
	if err := s.db.Model(&models.Media{}).Where("id = ? AND user_id = ?", id, currentUserID(ctx)).Updates(updates).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (s Server) deleteMedia(ctx *gin.Context) {
	id, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid media id"})
		return
	}
	if err := s.db.Where("id = ? AND user_id = ?", id, currentUserID(ctx)).Delete(&models.Media{}).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"status": "ok"})
}

type publishTaskRequest struct {
	PostID                uuid.UUID  `json:"post_id"`
	TargetChannelUsername string     `json:"target_channel_username"`
	ScheduledAt           *time.Time `json:"scheduled_at"`
}

func (s Server) createPublishTask(ctx *gin.Context) {
	var req publishTaskRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	target := normalizeUsername(req.TargetChannelUsername)
	if target == "" {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "target_channel_username is required"})
		return
	}
	var post models.Post
	if err := s.db.Where("id = ? AND user_id = ?", req.PostID, currentUserID(ctx)).First(&post).Error; err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "post not found"})
		return
	}
	task := models.PublishTask{
		UserID:                currentUserID(ctx),
		PostID:                req.PostID,
		TargetChannelUsername: target,
		Status:                "queued",
		ScheduledAt:           req.ScheduledAt,
	}
	if err := s.db.Create(&task).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	ctx.JSON(http.StatusCreated, gin.H{"publish_task": task})
}

type publishTaskResponse struct {
	models.PublishTask
	Post  models.Post    `json:"post"`
	Media []models.Media `json:"media"`
}

func (s Server) nextPublishTask(ctx *gin.Context) {
	userID := currentUserID(ctx)
	var task models.PublishTask
	err := s.db.Where(
		"user_id = ? AND status = ? AND (scheduled_at IS NULL OR scheduled_at <= ?)",
		userID,
		"queued",
		time.Now().UTC(),
	).Order("created_at ASC").First(&task).Error
	if err == gorm.ErrRecordNotFound {
		ctx.JSON(http.StatusOK, gin.H{"publish_task": nil})
		return
	}
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := s.db.Model(&task).Updates(map[string]any{"status": "processing", "updated_at": time.Now().UTC()}).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var post models.Post
	if err := s.db.Where("id = ? AND user_id = ?", task.PostID, userID).First(&post).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var media []models.Media
	if err := s.db.Where("post_id = ? AND user_id = ?", task.PostID, userID).Order("sort_order ASC").Find(&media).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"publish_task": publishTaskResponse{PublishTask: task, Post: post, Media: media}})
}

func (s Server) workerNextPublishTask(ctx *gin.Context) {
	var task models.PublishTask
	err := s.db.Where(
		"status = ? AND (scheduled_at IS NULL OR scheduled_at <= ?)",
		"queued",
		time.Now().UTC(),
	).Order("created_at ASC").First(&task).Error
	if err == gorm.ErrRecordNotFound {
		ctx.JSON(http.StatusOK, gin.H{"publish_task": nil})
		return
	}
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := s.db.Model(&task).Updates(map[string]any{"status": "processing", "updated_at": time.Now().UTC()}).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var post models.Post
	if err := s.db.Where("id = ? AND user_id = ?", task.PostID, task.UserID).First(&post).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var media []models.Media
	if err := s.db.Where("post_id = ? AND user_id = ?", task.PostID, task.UserID).Order("sort_order ASC").Find(&media).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"publish_task": publishTaskResponse{PublishTask: task, Post: post, Media: media}})
}

type updatePublishTaskRequest struct {
	Status       string `json:"status"`
	BotMessageID *int64 `json:"bot_message_id"`
	ErrorMessage string `json:"error_message"`
}

func (s Server) updatePublishTask(ctx *gin.Context) {
	id, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid publish task id"})
		return
	}
	var req updatePublishTaskRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updates := map[string]any{
		"status":         fallback(req.Status, "queued"),
		"bot_message_id": req.BotMessageID,
		"error_message":  req.ErrorMessage,
		"updated_at":     time.Now().UTC(),
	}
	if req.Status == "completed" {
		updates["published_at"] = time.Now().UTC()
	}
	if err := s.db.Model(&models.PublishTask{}).Where("id = ? AND user_id = ?", id, currentUserID(ctx)).Updates(updates).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if req.Status == "completed" {
		var task models.PublishTask
		if err := s.db.Where("id = ? AND user_id = ?", id, currentUserID(ctx)).First(&task).Error; err == nil {
			_ = s.db.Model(&models.Post{}).Where("id = ? AND user_id = ?", task.PostID, currentUserID(ctx)).Updates(map[string]any{
				"status":       models.PostStatusPublished,
				"published_at": time.Now().UTC(),
				"updated_at":   time.Now().UTC(),
			}).Error
		}
	}
	ctx.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (s Server) workerUpdatePublishTask(ctx *gin.Context) {
	id, err := uuid.Parse(ctx.Param("id"))
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid publish task id"})
		return
	}
	var req updatePublishTaskRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updates := map[string]any{
		"status":         fallback(req.Status, "queued"),
		"bot_message_id": req.BotMessageID,
		"error_message":  req.ErrorMessage,
		"updated_at":     time.Now().UTC(),
	}
	if req.Status == "completed" {
		updates["published_at"] = time.Now().UTC()
	}
	if err := s.db.Model(&models.PublishTask{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if req.Status == "completed" {
		var task models.PublishTask
		if err := s.db.Where("id = ?", id).First(&task).Error; err == nil {
			_ = s.db.Model(&models.Post{}).Where("id = ? AND user_id = ?", task.PostID, task.UserID).Updates(map[string]any{
				"status":       models.PostStatusPublished,
				"published_at": time.Now().UTC(),
				"updated_at":   time.Now().UTC(),
			}).Error
		}
	}
	ctx.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func fallback(value, defaultValue string) string {
	if value == "" {
		return defaultValue
	}
	return value
}
