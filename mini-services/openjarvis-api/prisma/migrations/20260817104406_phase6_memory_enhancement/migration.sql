-- CreateTable
CREATE TABLE "missions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "owner" TEXT NOT NULL DEFAULT 'default',
    "goal" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "plan" TEXT,
    "riskLevel" TEXT DEFAULT 'low',
    "budget" INTEGER NOT NULL DEFAULT 100000,
    "maxToolCalls" INTEGER NOT NULL DEFAULT 50,
    "toolCallCount" INTEGER NOT NULL DEFAULT 0,
    "tokenUsage" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "mission_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "missionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mission_events_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "missions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tools" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "inputSchema" TEXT,
    "outputSchema" TEXT,
    "riskLevel" TEXT NOT NULL DEFAULT 'low',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "memory_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT,
    "tags" TEXT,
    "missionId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'agent',
    "importance" INTEGER NOT NULL DEFAULT 3,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "lastAccessedAt" DATETIME,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "memory_entries_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "missions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "memory_associations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromMemoryId" TEXT NOT NULL,
    "toMemoryId" TEXT NOT NULL,
    "strength" REAL NOT NULL DEFAULT 1.0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "memory_associations_fromMemoryId_fkey" FOREIGN KEY ("fromMemoryId") REFERENCES "memory_entries" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "memory_associations_toMemoryId_fkey" FOREIGN KEY ("toMemoryId") REFERENCES "memory_entries" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "mission_events_missionId_idx" ON "mission_events"("missionId");

-- CreateIndex
CREATE UNIQUE INDEX "tools_name_key" ON "tools"("name");

-- CreateIndex
CREATE INDEX "memory_entries_scope_idx" ON "memory_entries"("scope");

-- CreateIndex
CREATE INDEX "memory_entries_key_idx" ON "memory_entries"("key");

-- CreateIndex
CREATE INDEX "memory_entries_missionId_idx" ON "memory_entries"("missionId");

-- CreateIndex
CREATE INDEX "memory_entries_importance_idx" ON "memory_entries"("importance");

-- CreateIndex
CREATE INDEX "memory_associations_fromMemoryId_idx" ON "memory_associations"("fromMemoryId");

-- CreateIndex
CREATE INDEX "memory_associations_toMemoryId_idx" ON "memory_associations"("toMemoryId");

-- CreateIndex
CREATE UNIQUE INDEX "memory_associations_fromMemoryId_toMemoryId_key" ON "memory_associations"("fromMemoryId", "toMemoryId");
