# ==============================================================================
# KPL FANTASY - PRODUCTION DEVELOPER MAKEFILE
# ==============================================================================

.PHONY: help dev build start lint typecheck test test-watch db-up db-down db-seed db-migrate db-reset db-studio clean

# Load .env file if available
if-[fileexists .env]
include .env
export $(shell seed .env | xargs)
endif

# Colors for terminal formatting
CYAN    := \033[36m
GREEN   := \033[32m
YELLOW  := \033[33m
RED     := \033[31m
RESET   := \033[0m

# Default target when running just `make`
.DEFAULT_GOAL := help

## help: Display available Makefile targets and descriptions
help:
	@echo ""
	@echo "$(CYAN)⚽ KPL Fantasy Development Commands$(RESET)"
	@echo "--------------------------------------------------------"
	@sed -n 's/^##//p' $(MAKEFILE_LIST) | column -t -s ':' | sed -e 's/^/ /'
	@echo ""

# ==============================================================================
# DEVELOPMENT & BUILD
# ==============================================================================

## dev: Start local Next.js development server with Turbopack
dev:
	@echo "$(GREEN)🚀 Starting Next.js development server...$(RESET)"
	npm run dev

## build: Build production application bundle
build:
	@echo "$(GREEN)📦 Building production Next.js bundle...$(RESET)"
	npx next build

## start: Start production server after build
start:
	@echo "$(GREEN)⚡ Starting Next.js production server...$(RESET)"
	npm run start

# ==============================================================================
# QUALITY & TESTING
# ==============================================================================

## lint: Run ESLint checks across project files
lint:
	@echo "$(YELLOW)🔍 Running ESLint...$(RESET)"
	npx next lint

## typecheck: Run TypeScript type checker without emitting code
typecheck:
	@echo "$(YELLOW)📐 Verifying TypeScript types...$(RESET)"
	npx tsc --noEmit

## test: Run unit tests using Node.js native test runner
test:
	@echo "$(GREEN)🧪 Executing unit test suite...$(RESET)"
	npx tsx --test lib/*.test.ts

## check: Run linting, typechecking, and tests in sequence
check: lint typecheck test
	@echo "$(GREEN)✅ All quality checks passed successfully!$(RESET)"

# ==============================================================================
# DATABASE & PRISMA ORM
# ==============================================================================

## db-generate: Generate Prisma Client artifacts from schema
db-generate:
	@echo "$(CYAN)⚙️ Generating Prisma Client...$(RESET)"
	npx prisma generate

## db-push: Push Prisma schema state directly to target PostgreSQL DB
db-push:
	@echo "$(CYAN)🔄 Pushing schema to database...$(RESET)"
	npx prisma db push

## db-seed: Run database seeding script (Clubs, Players, Gameweeks)
db-seed:
	@echo "$(GREEN)🌱 Seeding database...$(RESET)"
	npx tsx prisma/seed.ts

## db-migrate: Apply database migrations in development
db-migrate:
	@echo "$(CYAN)🛠️ Applying database migrations...$(RESET)"
	npx prisma migrate dev

## db-studio: Launch Prisma Studio GUI database explorer
db-studio:
	@echo "$(CYAN)📊 Launching Prisma Studio...$(RESET)"
	npx prisma studio

## db-reset: Wipe database, apply schema migrations, and re-seed
db-reset:
	@echo "$(RED)⚠️ Resetting database and re-seeding...$(RESET)"
	npx prisma migrate reset --force
	@make db-seed

# ==============================================================================
# HOUSEKEEPING
# ==============================================================================

## clean: Delete Next.js build cache and temporary artifacts
clean:
	@echo "$(YELLOW)🧹 Cleaning build caches...$(RESET)"
	rm -rf .next node_modules/.cache out
	@echo "$(GREEN)✨ Clean complete!$(RESET)"