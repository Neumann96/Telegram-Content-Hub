package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"telegram-content-hub/apps/api/internal/config"
)

type Server struct {
	db  *gorm.DB
	cfg config.Config
}

func RegisterRoutes(router *gin.Engine, db *gorm.DB, cfg config.Config) {
	server := Server{db: db, cfg: cfg}

	router.GET("/api/health", server.health)
	router.GET("/api/bootstrap", server.bootstrap)
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
		"minio_bucket":       s.cfg.MinIOBucket,
		"features": []string{
			"telegram_login",
			"source_channels",
			"post_editor",
			"media_library",
			"bot_publishing",
		},
	})
}
