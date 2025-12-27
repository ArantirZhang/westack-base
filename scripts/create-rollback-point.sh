#!/bin/bash

# WeStack BMS Dependency Upgrade - Rollback Point Creation
# Creates a comprehensive rollback point before dependency upgrades

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
ROLLBACK_DIR="rollback-$TIMESTAMP"
GIT_TAG="pre-upgrade-$TIMESTAMP"

echo -e "${BLUE}🔄 Creating rollback point for dependency upgrade...${NC}"
echo "=================================================="

# Create rollback directory
mkdir -p "$ROLLBACK_DIR"

echo -e "${YELLOW}📋 Capturing current state...${NC}"

# 1. Backup package files
echo "  - Backing up package files"
cp package.json "$ROLLBACK_DIR/package.json.backup"
cp package-lock.json "$ROLLBACK_DIR/package-lock.json.backup" 2>/dev/null || echo "    (no package-lock.json found)"

# 2. Save current dependency list
echo "  - Capturing dependency list"
npm list --depth=0 > "$ROLLBACK_DIR/dependencies-before.txt" 2>&1 || echo "    (some dependencies may be missing)"

# 3. Run npm audit
echo "  - Running security audit"
npm audit > "$ROLLBACK_DIR/audit-before.txt" 2>&1 || echo "    (audit completed with warnings)"

# 4. Check for outdated packages
echo "  - Checking outdated packages"
npm outdated > "$ROLLBACK_DIR/outdated-before.txt" 2>&1 || echo "    (outdated check completed)"

# 5. Capture current test results
echo "  - Running baseline tests"
if npm test > "$ROLLBACK_DIR/tests-before.txt" 2>&1; then
    echo -e "    ${GREEN}✅ Tests passed${NC}"
else
    echo -e "    ${YELLOW}⚠️ Tests had issues (captured for comparison)${NC}"
fi

# 6. Try to build the project
echo "  - Testing build process"
if npm run build > "$ROLLBACK_DIR/build-before.txt" 2>&1; then
    echo -e "    ${GREEN}✅ Build successful${NC}"
else
    echo -e "    ${YELLOW}⚠️ Build had issues (captured for comparison)${NC}"
fi

# 7. Create Git commit and tag
echo -e "${YELLOW}🏷️ Creating Git snapshot...${NC}"

# Check if we're in a git repository
if git rev-parse --git-dir > /dev/null 2>&1; then
    # Check if there are uncommitted changes
    if [[ -n $(git status --porcelain) ]]; then
        echo "  - Staging current changes"
        git add -A
        git commit -m "Pre-upgrade snapshot: $TIMESTAMP"
    fi

    # Create tag
    echo "  - Creating tag: $GIT_TAG"
    git tag -a "$GIT_TAG" -m "Pre-upgrade snapshot for dependency updates"

    # Save current commit hash
    git rev-parse HEAD > "$ROLLBACK_DIR/commit-hash.txt"
    echo -e "    ${GREEN}✅ Git tag created: $GIT_TAG${NC}"
else
    echo -e "    ${YELLOW}⚠️ Not a Git repository - skipping Git snapshot${NC}"
fi

# 8. Backup database state (if running in Docker)
echo -e "${YELLOW}💾 Backing up database state...${NC}"

# Check if Docker containers are running
if docker compose ps | grep -q "Up"; then
    echo "  - Backing up Memgraph database"
    if docker exec bms-memgraph mgdump --path "/tmp/backup-pre-upgrade-$TIMESTAMP.cypher" > "$ROLLBACK_DIR/memgraph-backup.log" 2>&1; then
        # Copy backup file to host
        docker cp "bms-memgraph:/tmp/backup-pre-upgrade-$TIMESTAMP.cypher" "$ROLLBACK_DIR/" 2>/dev/null || echo "    (backup file copy failed, but backup exists in container)"
        echo -e "    ${GREEN}✅ Memgraph backup created${NC}"
    else
        echo -e "    ${YELLOW}⚠️ Memgraph backup failed (check if container is running)${NC}"
    fi

    echo "  - Backing up InfluxDB database"
    if docker exec bms-influxdb influx backup "/tmp/influx-backup-pre-upgrade-$TIMESTAMP" > "$ROLLBACK_DIR/influxdb-backup.log" 2>&1; then
        echo -e "    ${GREEN}✅ InfluxDB backup created${NC}"
    else
        echo -e "    ${YELLOW}⚠️ InfluxDB backup failed (check if container is running)${NC}"
    fi
else
    echo -e "    ${YELLOW}⚠️ Docker containers not running - skipping database backup${NC}"
fi

# 9. Save environment information
echo -e "${YELLOW}🌐 Capturing environment information...${NC}"

echo "Node.js version: $(node --version)" > "$ROLLBACK_DIR/environment.txt"
echo "npm version: $(npm --version)" >> "$ROLLBACK_DIR/environment.txt"
echo "Operating System: $(uname -a)" >> "$ROLLBACK_DIR/environment.txt"
echo "Docker version: $(docker --version 2>/dev/null || echo 'Not installed')" >> "$ROLLBACK_DIR/environment.txt"
echo "Docker Compose version: $(docker compose version 2>/dev/null || echo 'Not installed')" >> "$ROLLBACK_DIR/environment.txt"

# 10. Create rollback instructions
cat > "$ROLLBACK_DIR/ROLLBACK_INSTRUCTIONS.md" << 'EOF'
# Rollback Instructions

This directory contains a complete rollback point for the dependency upgrade.

## Quick Rollback

```bash
# 1. Restore package files
cp rollback-*/package.json.backup package.json
cp rollback-*/package-lock.json.backup package-lock.json 2>/dev/null || true

# 2. Clean install dependencies
rm -rf node_modules
npm ci

# 3. Verify functionality
npm test
npm run build
```

## Full Rollback (including Git)

```bash
# 1. Find the pre-upgrade tag
git tag -l "pre-upgrade-*"

# 2. Reset to that tag
git reset --hard <pre-upgrade-tag>

# 3. Clean install
rm -rf node_modules
npm ci
```

## Database Rollback (if needed)

```bash
# Restore Memgraph (if backup exists)
docker exec -i bms-memgraph mgconsole < rollback-*/backup-pre-upgrade-*.cypher

# Restore InfluxDB (if backup exists)
# This requires manual restoration - check InfluxDB documentation
```

## Verification Checklist

After rollback, verify:

- [ ] Tests pass: `npm test`
- [ ] Build works: `npm run build`
- [ ] Application starts: `npm start`
- [ ] MQTT ingestion works
- [ ] GraphQL API responds
- [ ] Database connections work

## Files in this rollback point

- `package.json.backup` - Original package.json
- `package-lock.json.backup` - Original package-lock.json
- `dependencies-before.txt` - npm list output before upgrade
- `audit-before.txt` - npm audit output before upgrade
- `outdated-before.txt` - npm outdated output before upgrade
- `tests-before.txt` - Test results before upgrade
- `build-before.txt` - Build output before upgrade
- `commit-hash.txt` - Git commit hash before upgrade
- `environment.txt` - System environment information
- Database backup files (if created)
EOF

# 11. Create rollback script
cat > "$ROLLBACK_DIR/rollback.sh" << 'EOF'
#!/bin/bash

# Quick rollback script
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}🔄 Executing rollback...${NC}"

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "  - Restoring package.json"
cp "$SCRIPT_DIR/package.json.backup" package.json

echo "  - Restoring package-lock.json"
if [[ -f "$SCRIPT_DIR/package-lock.json.backup" ]]; then
    cp "$SCRIPT_DIR/package-lock.json.backup" package-lock.json
fi

echo "  - Cleaning node_modules"
rm -rf node_modules

echo "  - Installing dependencies"
npm ci

echo "  - Running tests"
if npm test; then
    echo -e "${GREEN}✅ Rollback successful - tests pass${NC}"
else
    echo -e "${RED}❌ Rollback completed but tests are failing${NC}"
    echo "Check the original test results in: $SCRIPT_DIR/tests-before.txt"
    exit 1
fi

echo -e "${GREEN}✅ Rollback completed successfully${NC}"
EOF

chmod +x "$ROLLBACK_DIR/rollback.sh"

# 12. Create success summary
echo
echo -e "${GREEN}✅ Rollback point created successfully!${NC}"
echo "=================================================="
echo "📁 Rollback directory: $ROLLBACK_DIR"
echo "🏷️  Git tag: $GIT_TAG"
echo "📋 Rollback instructions: $ROLLBACK_DIR/ROLLBACK_INSTRUCTIONS.md"
echo "🚀 Quick rollback script: $ROLLBACK_DIR/rollback.sh"
echo
echo -e "${BLUE}To rollback quickly, run:${NC}"
echo "  ./$ROLLBACK_DIR/rollback.sh"
echo
echo -e "${BLUE}You can now safely proceed with the dependency upgrade.${NC}"

# Save rollback point info for other scripts
echo "$ROLLBACK_DIR" > .last-rollback-point
echo "ROLLBACK_DIR=$ROLLBACK_DIR" > .rollback-env
echo "GIT_TAG=$GIT_TAG" >> .rollback-env