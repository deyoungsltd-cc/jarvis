-- CreateTable
CREATE TABLE "approval_requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "missionId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "capability" TEXT,
    "riskLevel" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "toolInput" TEXT,
    "resolvedBy" TEXT,
    "resolvedAt" DATETIME,
    "response" TEXT,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "capability_grants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "capability" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,
    "scopeType" TEXT NOT NULL DEFAULT 'permanent',
    "scopeContext" TEXT,
    "missionId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "approvalRequestId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "approval_rules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "matchRiskLevels" TEXT,
    "matchToolNames" TEXT,
    "matchCapabilities" TEXT,
    "action" TEXT NOT NULL DEFAULT 'auto_approve',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "service_instances" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "repoUrl" TEXT,
    "replaces" TEXT,
    "hostname" TEXT,
    "composePath" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "imageTag" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_deployed',
    "healthStatus" TEXT NOT NULL DEFAULT 'unknown',
    "healthUrl" TEXT,
    "resourceWeight" TEXT NOT NULL DEFAULT 'lightweight',
    "lastHealthCheck" DATETIME,
    "lastDeployedAt" DATETIME,
    "lastUpdatedAt" DATETIME,
    "deployedImageTag" TEXT,
    "rollbackImageTag" TEXT,
    "error" TEXT,
    "mobileApp" TEXT,
    "mobileAppNote" TEXT,
    "port" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "service_backups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serviceInstanceId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "scheduleType" TEXT NOT NULL DEFAULT 'manual',
    "storageLocation" TEXT NOT NULL DEFAULT 'local',
    "storageTarget" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "restoredFrom" BOOLEAN NOT NULL DEFAULT false,
    "serviceStatusAtBackup" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "service_backups_serviceInstanceId_fkey" FOREIGN KEY ("serviceInstanceId") REFERENCES "service_instances" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "approval_requests_missionId_idx" ON "approval_requests"("missionId");

-- CreateIndex
CREATE INDEX "approval_requests_status_idx" ON "approval_requests"("status");

-- CreateIndex
CREATE INDEX "approval_requests_riskLevel_idx" ON "approval_requests"("riskLevel");

-- CreateIndex
CREATE INDEX "approval_requests_expiresAt_idx" ON "approval_requests"("expiresAt");

-- CreateIndex
CREATE INDEX "capability_grants_capability_idx" ON "capability_grants"("capability");

-- CreateIndex
CREATE INDEX "capability_grants_allowed_idx" ON "capability_grants"("allowed");

-- CreateIndex
CREATE INDEX "capability_grants_scopeType_idx" ON "capability_grants"("scopeType");

-- CreateIndex
CREATE UNIQUE INDEX "approval_rules_name_key" ON "approval_rules"("name");

-- CreateIndex
CREATE UNIQUE INDEX "service_instances_name_key" ON "service_instances"("name");

-- CreateIndex
CREATE INDEX "service_instances_group_idx" ON "service_instances"("group");

-- CreateIndex
CREATE INDEX "service_instances_status_idx" ON "service_instances"("status");

-- CreateIndex
CREATE INDEX "service_instances_healthStatus_idx" ON "service_instances"("healthStatus");

-- CreateIndex
CREATE INDEX "service_backups_serviceInstanceId_idx" ON "service_backups"("serviceInstanceId");

-- CreateIndex
CREATE INDEX "service_backups_scheduleType_idx" ON "service_backups"("scheduleType");
