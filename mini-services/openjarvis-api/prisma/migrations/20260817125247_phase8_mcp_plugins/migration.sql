-- CreateTable
CREATE TABLE "mcp_servers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "transport" TEXT NOT NULL,
    "command" TEXT,
    "args" TEXT,
    "url" TEXT,
    "env" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "lastError" TEXT,
    "toolCount" INTEGER NOT NULL DEFAULT 0,
    "connectedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "mcp_tools" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mcpName" TEXT NOT NULL,
    "description" TEXT,
    "inputSchema" TEXT,
    "riskLevel" TEXT NOT NULL DEFAULT 'medium',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "mcp_tools_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "mcp_servers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "mcp_servers_name_key" ON "mcp_servers"("name");

-- CreateIndex
CREATE INDEX "mcp_servers_status_idx" ON "mcp_servers"("status");

-- CreateIndex
CREATE INDEX "mcp_servers_enabled_idx" ON "mcp_servers"("enabled");

-- CreateIndex
CREATE INDEX "mcp_tools_serverId_idx" ON "mcp_tools"("serverId");

-- CreateIndex
CREATE INDEX "mcp_tools_name_idx" ON "mcp_tools"("name");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_tools_serverId_mcpName_key" ON "mcp_tools"("serverId", "mcpName");
