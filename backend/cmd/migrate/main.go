package main

import (
	"errors"
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
)

func main() {
	// 1. Parse command-line flags/arguments
	flag.Parse()
	args := flag.Args()
	if len(args) < 1 {
		log.Fatal("Expected at least one command: 'up', 'down', or 'version'")
	}
	command := args[0]

	// 2. Grab the DSN from the environment
	dsn := os.Getenv("DATABASE_DSN")
	if dsn == "" {
		log.Fatal("DATABASE_DSN environment variable is not set")
	}

	// 3. Initialize the migrator
	// "file://migrations" assumes you run this from the backend/ root directory.
	// Modify to "file://backend/migrations" if running from the repository root.
	m, err := migrate.New("file://migrations", dsn)
	if err != nil {
		log.Fatalf("Failed to initialize migrator: %v", err)
	}
	defer m.Close()

	// 4. Execute the requested command
	switch command {
	case "up":
		log.Println("Running all pending 'up' migrations...")
		if err := m.Up(); err != nil {
			if errors.Is(err, migrate.ErrNoChange) {
				log.Println("No new migrations to apply.")
			} else {
				log.Fatalf("Migration 'up' failed: %v", err)
			}
		} else {
			log.Println("Migrations applied successfully!")
		}

	case "down":
		// 'down' typically expects a step count (e.g., down 1)
		steps := 1
		if len(args) > 1 {
			_, err := fmt.Sscanf(args[1], "%d", &steps)
			if err != nil {
				log.Fatalf("Invalid step count: %v", err)
			}
		}
		log.Printf("Rolling back the last %d migration(s)...", steps)
		if err := m.Steps(-steps); err != nil {
			if errors.Is(err, migrate.ErrNoChange) {
				log.Println("No migrations to roll back.")
			} else {
				log.Fatalf("Migration 'down' failed: %v", err)
			}
		} else {
			log.Println("Rollback completed successfully!")
		}

	case "version":
		version, dirty, err := m.Version()
		if err != nil {
			if errors.Is(err, migrate.ErrNilVersion) {
				log.Println("No migrations have been run yet (Version: 0).")
			} else {
				log.Fatalf("Failed to fetch version: %v", err)
			}
		} else {
			log.Printf("Current Version: %d (Dirty: %t)\n", version, dirty)
		}

	default:
		log.Fatalf("Unknown command: %s. Use 'up', 'down', or 'version'.", command)
	}
}
