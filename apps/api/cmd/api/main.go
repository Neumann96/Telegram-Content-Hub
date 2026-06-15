package main

import (
	"log"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"telegram-content-hub/apps/api/internal/config"
	"telegram-content-hub/apps/api/internal/database"
	"telegram-content-hub/apps/api/internal/httpapi"
)

func main() {
	cfg := config.Load()

	db, err := database.Open(cfg.DatabaseDSN())
	if err != nil {
		log.Fatalf("open database: %v", err)
	}

	if err := database.Migrate(db); err != nil {
		log.Fatalf("run migrations: %v", err)
	}

	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery())
	router.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3000"},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
	}))

	httpapi.RegisterRoutes(router, db, cfg)

	if err := router.Run(":" + cfg.Port); err != nil {
		log.Fatalf("run api: %v", err)
	}
}
